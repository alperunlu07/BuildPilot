import type { XcresultParseStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { captureMaybeRemote, shellQuote } from './_exec';

// Parsed shape we render into a single structured log entry.
export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  expectedFailures: number;
}

// Pure parser — fed the JSON xcresulttool emits, returns the summary
// shape we surface to the build log. Targets the modern (Xcode 16+)
// `xcresulttool get test-results summary --format json` output, which
// looks like:
//   {
//     "totalTestCount": 42,
//     "passedTests": 39,
//     "failedTests": 2,
//     "skippedTests": 1,
//     "expectedFailures": 0,
//     ...
//   }
// Anything missing (legacy Xcode, partial output) is treated as zero so
// the parser never throws on shape — only on outright invalid JSON.
export function parseXcresultSummary(json: string): TestSummary {
  const obj = JSON.parse(json) as Record<string, unknown>;
  const num = (k: string): number => {
    const v = obj[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  };
  return {
    total: num('totalTestCount'),
    passed: num('passedTests'),
    failed: num('failedTests'),
    skipped: num('skippedTests'),
    expectedFailures: num('expectedFailures'),
  };
}

export function formatTestSummary(s: TestSummary): string {
  const checkMark = s.failed === 0 ? '✔' : '✖';
  const failedNote = s.failed > 0 ? ` (${s.failed} failed)` : '';
  const skippedNote = s.skipped > 0 ? ` (${s.skipped} skipped)` : '';
  return `${checkMark} ${s.passed}/${s.total} tests passed${failedNote}${skippedNote}`;
}

export async function runXcresultParse(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<XcresultParseStepData>;
  if (!d.bundlePath) throw new Error('xcresultParse: missing "bundlePath"');
  const failOnTestFailure = d.failOnTestFailure !== 'false';

  const command = `xcrun xcresulttool get test-results summary --path ${shellQuote(d.bundlePath)} --format json`;
  const stdout = await captureMaybeRemote({
    ctx,
    d,
    command,
    label: `xcresulttool summary ${d.bundlePath}`,
  });

  let summary: TestSummary;
  try {
    summary = parseXcresultSummary(stdout);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`xcresultParse: could not parse xcresulttool output (${msg})`);
  }

  ctx.log(formatTestSummary(summary), summary.failed > 0 ? 'failure' : 'success');
  if (failOnTestFailure && summary.failed > 0) {
    throw new Error(`${summary.failed} test(s) failed`);
  }
}
