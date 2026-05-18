import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync, statSync } from 'node:fs';
import type {
  CoverageReport,
  TestReportKind,
  TestReportTree,
} from '@buildpilot/shared-types';
import { getBuild } from '../store/builds';
import { listBuildArtifacts } from '../store/buildArtifacts';
import { parseJunitXml } from '../_junit';
import { parseXcresultBundle } from '../_xcresult';

// Cluster 11.F — Test report + coverage endpoints. Both endpoints are
// best-effort: they walk the build's artifact list looking for a file
// whose path matches a known extension, parse it, and return a normalized
// shape the dashboard can render. If the source artifact isn't on disk
// any more (retention sweep) or can't be parsed, we surface a `note` so
// the UI doesn't render a confusing empty tree.

const XCRESULT_RE = /\.xcresult\/?$/i;
const JUNIT_RE = /(?:^|\/)([^/]*junit[^/]*|.+_results?)\.xml$/i;
const COVERAGE_RE = /(?:^|\/)(coverage|cobertura)[^/]*\.xml$/i;

function detectKind(path: string): TestReportKind | null {
  if (XCRESULT_RE.test(path)) return 'xcresult';
  if (JUNIT_RE.test(path)) return 'junit';
  // Permissive: any .xml that isn't coverage.xml is treated as JUnit so
  // pipelines that name their report `tests.xml` aren't shut out. The
  // parser bails cleanly on non-JUnit XML (returns an empty suite list).
  if (path.toLowerCase().endsWith('.xml') && !COVERAGE_RE.test(path)) return 'junit';
  return null;
}

// Sum up the totals across all suites so the client gets them without
// walking the tree.
function totals(tree: TestReportTree): TestReportTree {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let durationSec = 0;
  let anyDuration = false;
  for (const s of tree.suites) {
    if (s.timeSec !== undefined) {
      durationSec += s.timeSec;
      anyDuration = true;
    }
    for (const t of s.tests) {
      if (t.status === 'passed') passed += 1;
      else if (t.status === 'failed') failed += 1;
      else if (t.status === 'skipped') skipped += 1;
    }
  }
  return {
    ...tree,
    totalPassed: passed,
    totalFailed: failed,
    totalSkipped: skipped,
    totalTests: passed + failed + skipped,
    totalDurationSec: anyDuration ? durationSec : null,
  };
}

function emptyTree(
  kind: TestReportKind,
  artifactId: number | null,
  artifactPath: string | null,
  note: string,
): TestReportTree {
  return {
    artifactId,
    artifactPath,
    kind,
    totalTests: 0,
    totalPassed: 0,
    totalFailed: 0,
    totalSkipped: 0,
    totalDurationSec: null,
    suites: [],
    note,
  };
}

export async function testReportsRoutes(app: FastifyInstance): Promise<void> {
  // Look up a build's test report. The kind is auto-detected from the
  // artifact list; clients can force one with the `kind` query string
  // (e.g. when both an xcresult and a junit.xml are present).
  app.get('/api/builds/:id/test-report', async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = (req.query as { kind?: TestReportKind; artifactId?: string }) ?? {};
    const build = getBuild(id);
    if (!build) return reply.code(404).send({ error: 'build not found' });

    const artifacts = listBuildArtifacts(id);

    // Caller can pin a specific artifact by id — useful when a build has
    // both UnitTests.xcresult and UITests.xcresult and we want to show
    // each in its own tab.
    let chosen = artifacts.find((a) => {
      if (q.artifactId && String(a.id) !== q.artifactId) return false;
      if (q.kind === 'xcresult') return XCRESULT_RE.test(a.path);
      if (q.kind === 'junit') return JUNIT_RE.test(a.path) || (a.path.toLowerCase().endsWith('.xml') && !COVERAGE_RE.test(a.path));
      return detectKind(a.path) !== null;
    });
    if (q.artifactId && chosen?.id !== Number(q.artifactId)) {
      chosen = artifacts.find((a) => a.id === Number(q.artifactId));
    }

    if (!chosen) {
      const kind: TestReportKind = q.kind ?? 'junit';
      return emptyTree(kind, null, null, 'No xcresult or JUnit XML artifact was recorded for this build.');
    }

    const kind = detectKind(chosen.path) ?? q.kind ?? 'junit';

    // The artifact path is captured at upload time. Retention may have
    // since deleted the file from disk — return a usable empty tree
    // rather than throwing so the UI can show the explanation.
    if (!existsSync(chosen.path)) {
      return emptyTree(
        kind,
        chosen.id,
        chosen.path,
        'The recorded artifact file no longer exists on disk (it was likely pruned by build retention).',
      );
    }

    if (kind === 'xcresult') {
      const outcome = await parseXcresultBundle(chosen.path);
      const base: TestReportTree = {
        artifactId: chosen.id,
        artifactPath: chosen.path,
        kind: 'xcresult',
        totalTests: 0,
        totalPassed: 0,
        totalFailed: 0,
        totalSkipped: 0,
        totalDurationSec: null,
        suites: outcome.suites,
      };
      if (outcome.note) base.note = outcome.note;
      return totals(base);
    }

    try {
      const st = statSync(chosen.path);
      // 32 MiB hard ceiling so a runaway JUnit report can't blow up the
      // event loop. Reports above this are clearly not interactive
      // anyway.
      if (st.size > 32 * 1024 * 1024) {
        return emptyTree(
          'junit',
          chosen.id,
          chosen.path,
          `JUnit XML is ${Math.round(st.size / 1024 / 1024)} MiB — too large to render interactively. Download the artifact directly instead.`,
        );
      }
      const xml = readFileSync(chosen.path, 'utf-8');
      const suites = parseJunitXml(xml);
      const base: TestReportTree = {
        artifactId: chosen.id,
        artifactPath: chosen.path,
        kind: 'junit',
        totalTests: 0,
        totalPassed: 0,
        totalFailed: 0,
        totalSkipped: 0,
        totalDurationSec: null,
        suites,
      };
      if (suites.length === 0) {
        base.note =
          'No `<testsuite>` elements found. The artifact may not be a JUnit-format XML; check the raw file.';
      }
      return totals(base);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return emptyTree('junit', chosen.id, chosen.path, `Could not read or parse XML: ${msg}`);
    }
  });

  app.get('/api/builds/:id/coverage', async (req, reply) => {
    const { id } = req.params as { id: string };
    const build = getBuild(id);
    if (!build) return reply.code(404).send({ error: 'build not found' });

    const artifacts = listBuildArtifacts(id);
    const chosen = artifacts.find((a) => COVERAGE_RE.test(a.path));
    if (!chosen) {
      const empty: CoverageReport = {
        artifactId: null,
        artifactPath: null,
        lineRate: null,
        branchRate: null,
        linesCovered: 0,
        linesValid: 0,
        lowestFiles: [],
        note: 'No Cobertura-format coverage.xml artifact was recorded for this build.',
      };
      return empty;
    }

    if (!existsSync(chosen.path)) {
      const r: CoverageReport = {
        artifactId: chosen.id,
        artifactPath: chosen.path,
        lineRate: null,
        branchRate: null,
        linesCovered: 0,
        linesValid: 0,
        lowestFiles: [],
        note: 'The coverage.xml artifact was pruned by retention; only the recorded path remains.',
      };
      return r;
    }

    try {
      const xml = readFileSync(chosen.path, 'utf-8');
      // Root <coverage> attributes carry the headline numbers. Hand-rolled
      // attribute regex to keep us off `fast-xml-parser`.
      const rootMatch = xml.match(/<coverage\b([^>]*)>/i);
      const attrs: Record<string, string> = {};
      if (rootMatch) {
        const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(rootMatch[1] ?? '')) !== null) {
          attrs[m[1]!] = m[2] ?? m[3] ?? '';
        }
      }
      const num = (k: string): number | null => {
        const v = attrs[k];
        if (!v) return null;
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : null;
      };

      // Walk each <class filename="..." line-rate="..."> to find the
      // worst-covered files. Cobertura emits these inside <classes>; we
      // don't care about packages here.
      const classRe = /<class\b([^>]*)>/g;
      const lowest: Array<{ filename: string; lineRate: number; lines: number }> = [];
      let cm: RegExpExecArray | null;
      while ((cm = classRe.exec(xml)) !== null) {
        const ca: Record<string, string> = {};
        const re2 = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
        let m: RegExpExecArray | null;
        while ((m = re2.exec(cm[1] ?? '')) !== null) {
          ca[m[1]!] = m[2] ?? m[3] ?? '';
        }
        if (!ca.filename) continue;
        const lr = parseFloat(ca['line-rate'] ?? '');
        if (!Number.isFinite(lr)) continue;
        lowest.push({
          filename: ca.filename,
          lineRate: lr,
          lines: parseInt(ca['lines-valid'] ?? '0', 10) || 0,
        });
      }
      lowest.sort((a, b) => a.lineRate - b.lineRate || b.lines - a.lines);

      const out: CoverageReport = {
        artifactId: chosen.id,
        artifactPath: chosen.path,
        lineRate: num('line-rate'),
        branchRate: num('branch-rate'),
        linesCovered: Math.max(0, Math.floor(num('lines-covered') ?? 0)),
        linesValid: Math.max(0, Math.floor(num('lines-valid') ?? 0)),
        lowestFiles: lowest.slice(0, 5),
      };
      return out;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const r: CoverageReport = {
        artifactId: chosen.id,
        artifactPath: chosen.path,
        lineRate: null,
        branchRate: null,
        linesCovered: 0,
        linesValid: 0,
        lowestFiles: [],
        note: `Could not parse coverage.xml: ${msg}`,
      };
      return r;
    }
  });
}
