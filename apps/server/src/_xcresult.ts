import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import type { TestCase, TestSuite, TestStatus } from '@buildpilot/shared-types';

// xcresult parsing — invokes `xcrun xcresulttool` to convert a bundle to
// JSON, then walks the result graph for per-test pass/fail rows. The tool
// only ships with Xcode, so this module is a no-op outside macOS; callers
// should use `parseXcresultBundle()` and let the `note` field explain
// why the tree is empty.

export interface XcresultParseOutcome {
  suites: TestSuite[];
  note?: string;
}

function isMac(): boolean {
  return platform() === 'darwin';
}

// Run `xcrun xcresulttool` and capture stdout. Returns null on any
// failure — caller logs and treats as "couldn't parse, show note".
async function xcresulttoolJson(bundlePath: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn('xcrun', ['xcresulttool', ...args, '--path', bundlePath, '--format', 'json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }, 15_000);
    child.stdout.on('data', (d) => {
      out += String(d);
    });
    child.stderr.on('data', (d) => {
      err += String(d);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (timedOut) return resolve(null);
      if (code === 0) return resolve(out);
      // Some Xcode-13-era bundles need `--legacy`. Caller retries.
      void err;
      return resolve(null);
    });
  });
}

interface RawTestResultsSummary {
  // Modern (Xcode 16+) `xcresulttool get test-results summary --format json` output.
  // Contains a `testFailures` array and aggregate counts, but no per-test
  // pass list. So we use it as a fallback only.
  totalTestCount?: number;
  passedTests?: number;
  failedTests?: number;
  skippedTests?: number;
  testFailures?: Array<{
    targetName?: string;
    testName?: string;
    failureText?: string;
    sourceCodeContext?: {
      location?: { filePath?: string; lineNumber?: number };
    };
  }>;
}

interface RawTestResultsTests {
  // Modern `xcresulttool get test-results tests --format json` output.
  // The actual data lives under `testNodes` with `nodeType` discriminating
  // suite vs. case. Shape per Xcode 16 schema.
  testNodes?: TestNode[];
}

interface TestNode {
  nodeType?: string; // "Test Plan" | "Test Bundle" | "Test Suite" | "Test Case" | …
  name?: string;
  duration?: string; // e.g. "0.12s"
  result?: string; // "Passed" | "Failed" | "Skipped" | "Expected Failure" | …
  children?: TestNode[];
  // On failures, `details` and `nodeIdentifier` can be present; we fall
  // back to the top-level `result` for status.
  details?: string;
}

function statusFromResult(r: string | undefined): TestStatus {
  if (!r) return 'passed';
  const lower = r.toLowerCase();
  if (lower.includes('fail') && !lower.includes('expected')) return 'failed';
  if (lower.includes('skip')) return 'skipped';
  return 'passed';
}

function parseDurationSec(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*(m?s)?/);
  if (!m) return undefined;
  const v = parseFloat(m[1]!);
  if (!Number.isFinite(v)) return undefined;
  return m[2] === 'ms' ? v / 1000 : v;
}

// Walk the testNodes graph collecting suites and their tests. We flatten
// any nesting deeper than "Test Suite" so the UI gets a stable two-level
// suite → test layout.
function collectSuites(nodes: TestNode[] | undefined, currentSuite: string | null): TestSuite[] {
  if (!nodes || nodes.length === 0) return [];
  const suites: TestSuite[] = [];
  // Tests that live directly under a Test Bundle (no suite) get a
  // synthetic "(top-level)" suite so they still show up.
  let topLevel: TestCase[] = [];

  for (const n of nodes) {
    if (n.nodeType === 'Test Case' || n.nodeType === 'Test Method') {
      const status = statusFromResult(n.result);
      const tc: TestCase = {
        name: n.name ?? '(unnamed)',
        status,
      };
      const d = parseDurationSec(n.duration);
      if (d !== undefined) tc.durationSec = d;
      if (status === 'failed' && n.details) tc.message = n.details;
      // Source location best-effort — xcresult Test Cases can carry a
      // child node with nodeType "Failure Message" containing the file
      // path. We grab the first one for the deep-link.
      if (status === 'failed' && n.children) {
        for (const c of n.children) {
          if (c.nodeType === 'Failure Message' && c.name) {
            const m = c.name.match(/(.+?):(\d+):/);
            if (m) {
              tc.file = m[1]!;
              tc.line = parseInt(m[2]!, 10);
            }
            if (!tc.message) tc.message = c.name;
            break;
          }
        }
      }
      if (currentSuite) {
        // belongs to the suite currently being walked — added by parent
        // call site after we return.
        topLevel.push(tc);
      } else {
        topLevel.push(tc);
      }
    } else if (n.nodeType === 'Test Suite') {
      const inner = collectSuites(n.children, n.name ?? null);
      // The suite's own direct testcases are returned as a single
      // synthetic suite under the suite name; the recursive call may
      // also return sub-suites — preserve their names.
      if (inner.length === 0) {
        suites.push({ name: n.name ?? '(unnamed)', tests: [] });
      } else {
        // If a sub-suite came back with name "(direct)" merge into this
        // suite; otherwise push it as a peer.
        const directIdx = inner.findIndex((s) => s.name === '(direct)');
        if (directIdx >= 0) {
          const direct = inner.splice(directIdx, 1)[0]!;
          const suite: TestSuite = {
            name: n.name ?? '(unnamed)',
            tests: direct.tests,
          };
          const sumSec = direct.tests
            .map((t) => t.durationSec ?? 0)
            .reduce((a, b) => a + b, 0);
          if (sumSec > 0) suite.timeSec = sumSec;
          suites.push(suite);
        }
        suites.push(...inner);
      }
    } else if (n.children && n.children.length > 0) {
      // "Test Plan" / "Test Bundle" / unknown — recurse and merge.
      suites.push(...collectSuites(n.children, currentSuite));
    }
  }
  if (topLevel.length > 0) {
    const suite: TestSuite = { name: currentSuite ?? '(direct)', tests: topLevel };
    const sumSec = topLevel
      .map((t) => t.durationSec ?? 0)
      .reduce((a, b) => a + b, 0);
    if (sumSec > 0) suite.timeSec = sumSec;
    // Insert at the front so it appears alongside named suites.
    suites.unshift(suite);
  }
  return suites;
}

// Build a synthetic single-suite fallback from the summary-only output
// when the detailed `tests` payload is unavailable (older Xcode bundles).
function suitesFromSummary(summary: RawTestResultsSummary): TestSuite[] {
  const failedNames = new Set(
    (summary.testFailures ?? []).map((f) => f.testName ?? ''),
  );
  const failures = (summary.testFailures ?? []).map<TestCase>((f) => {
    const tc: TestCase = {
      name: f.testName ?? '(unnamed)',
      classname: f.targetName,
      status: 'failed',
    };
    if (f.failureText) tc.message = f.failureText;
    const loc = f.sourceCodeContext?.location;
    if (loc?.filePath) tc.file = loc.filePath;
    if (loc?.lineNumber !== undefined) tc.line = loc.lineNumber;
    return tc;
  });
  const passedCount = Math.max(0, (summary.passedTests ?? 0));
  const skippedCount = Math.max(0, (summary.skippedTests ?? 0));
  // We don't have names for the passed tests in this fallback — only
  // counts. Surface as synthetic placeholders so the totals add up but
  // the suite tree is honest about what we know.
  const passed: TestCase[] = [];
  for (let i = 0; i < passedCount; i++) {
    passed.push({ name: `(passed test ${i + 1})`, status: 'passed' });
  }
  const skipped: TestCase[] = [];
  for (let i = 0; i < skippedCount; i++) {
    skipped.push({ name: `(skipped test ${i + 1})`, status: 'skipped' });
  }
  void failedNames;
  const all = [...failures, ...passed, ...skipped];
  if (all.length === 0) return [];
  return [{ name: 'Tests', tests: all }];
}

export async function parseXcresultBundle(bundlePath: string): Promise<XcresultParseOutcome> {
  if (!isMac()) {
    return {
      suites: [],
      note:
        'xcresult parsing requires `xcrun xcresulttool`, which only ships with Xcode on macOS. Run BuildPilot on a Mac to view the per-test breakdown.',
    };
  }

  // Preferred: per-test detail. Fall back to summary if `tests` subcommand
  // isn't supported on this Xcode (older releases) or the bundle is the
  // wrong shape.
  const testsJson = await xcresulttoolJson(bundlePath, ['get', 'test-results', 'tests']);
  if (testsJson) {
    try {
      const parsed = JSON.parse(testsJson) as RawTestResultsTests;
      const suites = collectSuites(parsed.testNodes, null);
      if (suites.length > 0) return { suites };
    } catch {
      /* fall through to summary */
    }
  }

  const summaryJson = await xcresulttoolJson(bundlePath, ['get', 'test-results', 'summary']);
  if (summaryJson) {
    try {
      const parsed = JSON.parse(summaryJson) as RawTestResultsSummary;
      const suites = suitesFromSummary(parsed);
      if (suites.length > 0) {
        return {
          suites,
          note:
            'Only the test summary was available — passed-test names aren\'t in the bundle on this Xcode version. Failed tests show full detail.',
        };
      }
    } catch {
      /* fall through */
    }
  }

  return {
    suites: [],
    note:
      'Could not run `xcrun xcresulttool` against this bundle. Make sure Xcode command-line tools are installed and the .xcresult path is correct.',
  };
}
