import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import type {
  FlakyQuarantineUpdate,
  FlakyTestEntry,
  FlakyTestsReport,
  TestStatus,
} from '@buildpilot/shared-types';
import { getDb } from '../store/db';
import { getPipeline } from '../store/pipelines';
import { listBuildArtifacts } from '../store/buildArtifacts';
import { parseJunitXml } from '../_junit';
import { parseXcresultBundle } from '../_xcresult';
import {
  getFlakyQuarantine,
  toggleFlakyQuarantine,
} from '../store/flakyQuarantine';

// Cluster 11.F — aggregate test pass/fail across the last N builds of a
// single pipeline. A test is flaky when its failure rate sits strictly
// between 0 and 1 over the window (i.e. it passed sometimes and failed
// other times). We parse each build's test-report artifact on demand;
// this is fine for the typical "30 builds × a few hundred tests"
// workload and avoids needing a new persistent test-result table.

interface AggRow {
  name: string;
  classname?: string;
  runs: number;
  passes: number;
  failures: number;
  skips: number;
  lastSeenAt: number;
}

function testKey(name: string, classname?: string): string {
  return classname && classname.length > 0 ? `${classname}::${name}` : name;
}

const XCRESULT_RE = /\.xcresult\/?$/i;
const JUNIT_RE = /(?:^|\/)([^/]*junit[^/]*|.+_results?)\.xml$/i;
const COVERAGE_RE = /(?:^|\/)(coverage|cobertura)[^/]*\.xml$/i;

async function loadTestsForBuild(buildId: string): Promise<Array<{
  name: string;
  classname?: string;
  status: TestStatus;
}>> {
  const artifacts = listBuildArtifacts(buildId);
  // Prefer JUnit when present (cheap to parse). Fall back to xcresult.
  const junit = artifacts.find(
    (a) =>
      JUNIT_RE.test(a.path) ||
      (a.path.toLowerCase().endsWith('.xml') && !COVERAGE_RE.test(a.path)),
  );
  const xcresult = artifacts.find((a) => XCRESULT_RE.test(a.path));
  const chosen = junit ?? xcresult;
  if (!chosen) return [];
  if (!existsSync(chosen.path)) return [];

  if (chosen === junit) {
    try {
      const xml = readFileSync(chosen.path, 'utf-8');
      const suites = parseJunitXml(xml);
      const out: Array<{ name: string; classname?: string; status: TestStatus }> = [];
      for (const s of suites) {
        for (const t of s.tests) {
          const r: { name: string; classname?: string; status: TestStatus } = {
            name: t.name,
            status: t.status,
          };
          if (t.classname) r.classname = t.classname;
          else if (s.name) r.classname = s.name;
          out.push(r);
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  // xcresult — only macOS hosts can parse it; on Linux the call returns
  // an empty suite list and we contribute nothing for this build (a
  // realistic fail-soft for the cross-platform case).
  const outcome = await parseXcresultBundle(chosen.path);
  const out: Array<{ name: string; classname?: string; status: TestStatus }> = [];
  for (const s of outcome.suites) {
    for (const t of s.tests) {
      const r: { name: string; classname?: string; status: TestStatus } = {
        name: t.name,
        status: t.status,
      };
      if (t.classname) r.classname = t.classname;
      else if (s.name) r.classname = s.name;
      out.push(r);
    }
  }
  return out;
}

export async function flakyTestsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/flaky-tests', async (req, reply) => {
    const q = (req.query as { pipelineId?: string; buildCount?: string }) ?? {};
    if (!q.pipelineId) return reply.code(400).send({ error: 'pipelineId required' });
    const pipeline = getPipeline(q.pipelineId);
    if (!pipeline) return reply.code(404).send({ error: 'pipeline not found' });

    const limit = Math.max(1, Math.min(200, parseInt(q.buildCount ?? '30', 10) || 30));

    const db = getDb();
    const buildRows = db
      .prepare(
        `SELECT id, started_at FROM builds
         WHERE pipeline_id = ? AND finished_at IS NOT NULL
         ORDER BY started_at DESC
         LIMIT ?`,
      )
      .all(q.pipelineId, limit) as Array<{ id: string; started_at: number }>;

    const agg = new Map<string, AggRow>();
    for (const b of buildRows) {
      const tests = await loadTestsForBuild(b.id);
      for (const t of tests) {
        const key = testKey(t.name, t.classname);
        let row = agg.get(key);
        if (!row) {
          row = {
            name: t.name,
            runs: 0,
            passes: 0,
            failures: 0,
            skips: 0,
            lastSeenAt: b.started_at,
          };
          if (t.classname) row.classname = t.classname;
          agg.set(key, row);
        }
        row.runs += 1;
        if (t.status === 'passed') row.passes += 1;
        else if (t.status === 'failed') row.failures += 1;
        else if (t.status === 'skipped') row.skips += 1;
        if (b.started_at > row.lastSeenAt) row.lastSeenAt = b.started_at;
      }
    }

    const quarantineSet = new Set(getFlakyQuarantine(q.pipelineId));
    const flaky: FlakyTestEntry[] = [];
    for (const [k, r] of agg.entries()) {
      const decisive = r.passes + r.failures;
      // Flaky === strictly mixed pass/fail. Tests that are 100% green or
      // 100% red are excluded; quarantined tests stay visible regardless
      // so the user can un-quarantine them when they're fixed.
      const isFlaky = decisive > 0 && r.passes > 0 && r.failures > 0;
      const isQuarantined = quarantineSet.has(k);
      if (!isFlaky && !isQuarantined) continue;
      const entry: FlakyTestEntry = {
        testKey: k,
        name: r.name,
        runs: r.runs,
        passes: r.passes,
        failures: r.failures,
        skips: r.skips,
        failureRate: decisive > 0 ? r.failures / decisive : null,
        lastSeenAt: r.lastSeenAt,
        quarantined: isQuarantined,
      };
      if (r.classname) entry.classname = r.classname;
      flaky.push(entry);
    }
    flaky.sort((a, b) => {
      const ra = a.failureRate ?? -1;
      const rb = b.failureRate ?? -1;
      if (rb !== ra) return rb - ra;
      return b.runs - a.runs;
    });

    // Project name lookup — keeps the page self-contained so the client
    // doesn't have to cross-reference store maps.
    const projectName =
      (db
        .prepare('SELECT name FROM projects WHERE id = ?')
        .get(pipeline.projectId) as { name: string } | undefined)?.name ??
      '(deleted project)';

    const report: FlakyTestsReport = {
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      projectId: pipeline.projectId,
      projectName,
      buildsAnalyzed: buildRows.length,
      flaky,
    };
    return report;
  });

  app.post('/api/flaky-tests/:pipelineId/quarantine', async (req, reply) => {
    const { pipelineId } = req.params as { pipelineId: string };
    const pipeline = getPipeline(pipelineId);
    if (!pipeline) return reply.code(404).send({ error: 'pipeline not found' });
    const body = req.body as Partial<FlakyQuarantineUpdate>;
    if (!body || typeof body.testKey !== 'string' || typeof body.quarantined !== 'boolean') {
      return reply.code(400).send({ error: 'testKey and quarantined required' });
    }
    const keys = toggleFlakyQuarantine(pipelineId, body.testKey, body.quarantined);
    return { pipelineId, quarantined: keys };
  });
}
