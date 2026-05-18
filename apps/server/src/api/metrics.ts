import type { FastifyInstance } from 'fastify';
import type {
  DiskUsageReport,
  DiskUsagePipelineEntry,
  HomeMetrics,
  HomeMetricsRecentBuild,
  HomeMetricsSlowestPipeline,
  PipelineMetrics,
  PipelineMetricsBuild,
  PipelineMetricsStep,
  PruneBuildsResponse,
  StepType,
} from '@buildpilot/shared-types';
import { getDb } from '../store/db';
import { getPipeline } from '../store/pipelines';
import { pruneOldBuilds } from '../store/retention';

// Phase 4 Cluster 10.D — aggregated metrics for the home dashboard and the
// per-pipeline panel. All numbers come from SQLite — we do not buffer step
// duration state in-memory because finished step rows are already keyed
// by build_id + node_id in `build_log_entries`.

const DAY_MS = 24 * 60 * 60 * 1000;

interface BuildRow {
  id: string;
  pipeline_id: string;
  project_id: string;
  trigger_sha: string;
  trigger_branch: string;
  status: string;
  started_at: number;
  finished_at: number | null;
}

interface PipelineNameRow {
  id: string;
  project_id: string;
  name: string;
}

interface ProjectNameRow {
  id: string;
  name: string;
}

interface StepLogRow {
  ts: number;
  level: string;
  node_id: string | null;
  step_type: string | null;
  message: string;
}

function loadPipelineMap(): Map<string, { name: string; projectId: string }> {
  const rows = getDb()
    .prepare('SELECT id, project_id, name FROM pipelines')
    .all() as PipelineNameRow[];
  const m = new Map<string, { name: string; projectId: string }>();
  for (const r of rows) m.set(r.id, { name: r.name, projectId: r.project_id });
  return m;
}

function loadProjectMap(): Map<string, string> {
  const rows = getDb().prepare('SELECT id, name FROM projects').all() as ProjectNameRow[];
  const m = new Map<string, string>();
  for (const r of rows) m.set(r.id, r.name);
  return m;
}

// Helpers that return percentile values from a sorted-ascending number array.
function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo]!;
  const frac = rank - lo;
  return sortedAsc[lo]! * (1 - frac) + sortedAsc[hi]! * frac;
}

// Compute per-step durations from build_log_entries. We use the pipeline's
// own "▶ step started" / "✔ step ok" / "✖ step failed" markers (level
// `system` / `success` / `failure`) which carry the originating `node_id`
// and `step_type`. Anything that finishes is included — even soft-failed
// steps — because the duration is interesting either way.
function computeStepDurations(buildIds: string[]): Array<{
  nodeId: string;
  stepType: StepType;
  durationMs: number;
}> {
  if (buildIds.length === 0) return [];
  const out: Array<{ nodeId: string; stepType: StepType; durationMs: number }> = [];
  const CHUNK = 500;
  for (let i = 0; i < buildIds.length; i += CHUNK) {
    const slice = buildIds.slice(i, i + CHUNK);
    const placeholders = slice.map(() => '?').join(',');
    // Match step "started" markers with their matching ok/failed markers
    // per (build_id, node_id). Iterating in `id ASC` keeps pairs correctly
    // ordered even when multiple builds are interleaved in the slice.
    const rows = getDb()
      .prepare(
        `SELECT build_id, ts, level, node_id, step_type, message
         FROM build_log_entries
         WHERE build_id IN (${placeholders})
           AND node_id IS NOT NULL
           AND (
             (level = 'system' AND message LIKE '▶ step started%') OR
             (level = 'success' AND message LIKE '✔ step ok%') OR
             (level = 'failure' AND message LIKE '✖ step failed%')
           )
         ORDER BY id ASC`,
      )
      .all(...slice) as Array<StepLogRow & { build_id: string }>;
    const pending = new Map<string, number>(); // key = build_id|node_id
    for (const r of rows) {
      if (!r.node_id || !r.step_type) continue;
      const key = `${r.build_id}|${r.node_id}`;
      if (r.level === 'system') {
        pending.set(key, r.ts);
      } else {
        const startedAt = pending.get(key);
        if (startedAt !== undefined) {
          pending.delete(key);
          out.push({
            nodeId: r.node_id,
            stepType: r.step_type as StepType,
            durationMs: Math.max(0, r.ts - startedAt),
          });
        }
      }
    }
  }
  return out;
}

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/metrics/home', async () => {
    const db = getDb();
    const now = Date.now();
    const since = now - DAY_MS;

    const runningBuildsCount = Number(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM builds WHERE status IN ('pending', 'running')`,
          )
          .get() as { c: number }
      ).c,
    );

    const window = db
      .prepare(
        `SELECT status, COUNT(*) AS c
         FROM builds
         WHERE finished_at IS NOT NULL AND finished_at >= ?
         GROUP BY status`,
      )
      .all(since) as Array<{ status: string; c: number }>;
    let successes24h = 0;
    let failures24h = 0;
    let cancelled24h = 0;
    for (const r of window) {
      if (r.status === 'success') successes24h = r.c;
      else if (r.status === 'failed') failures24h = r.c;
      else if (r.status === 'cancelled') cancelled24h = r.c;
    }
    const builds24h = successes24h + failures24h + cancelled24h;
    const denom = successes24h + failures24h;
    const successRate24h = denom > 0 ? successes24h / denom : null;

    const pipelineMap = loadPipelineMap();
    const projectMap = loadProjectMap();

    const failureRows = db
      .prepare(
        `SELECT * FROM builds
         WHERE status = 'failed'
         ORDER BY started_at DESC
         LIMIT 5`,
      )
      .all() as BuildRow[];
    const recentFailures: HomeMetricsRecentBuild[] = failureRows.map((b) => {
      const pi = pipelineMap.get(b.pipeline_id);
      return {
        id: b.id,
        pipelineId: b.pipeline_id,
        pipelineName: pi?.name ?? '(deleted pipeline)',
        projectId: b.project_id,
        projectName: projectMap.get(b.project_id) ?? '(deleted project)',
        status: b.status as HomeMetricsRecentBuild['status'],
        triggerSha: b.trigger_sha,
        triggerBranch: b.trigger_branch,
        startedAt: b.started_at,
        finishedAt: b.finished_at,
        durationMs: b.finished_at != null ? b.finished_at - b.started_at : null,
      };
    });

    // Slowest pipelines: take the 30 most recent successful builds per
    // pipeline and average their (finished_at - started_at). Pure SQL
    // would be awkward; we fan out per known pipeline.
    const slowest: HomeMetricsSlowestPipeline[] = [];
    for (const [pipelineId, pi] of pipelineMap.entries()) {
      const rows = db
        .prepare(
          `SELECT started_at, finished_at FROM builds
           WHERE pipeline_id = ? AND status = 'success' AND finished_at IS NOT NULL
           ORDER BY started_at DESC
           LIMIT 30`,
        )
        .all(pipelineId) as Array<{ started_at: number; finished_at: number }>;
      if (rows.length === 0) continue;
      const total = rows.reduce((acc, r) => acc + (r.finished_at - r.started_at), 0);
      slowest.push({
        pipelineId,
        pipelineName: pi.name,
        projectId: pi.projectId,
        projectName: projectMap.get(pi.projectId) ?? '(deleted project)',
        avgDurationMs: Math.round(total / rows.length),
        sampleCount: rows.length,
      });
    }
    slowest.sort((a, b) => b.avgDurationMs - a.avgDurationMs);
    const slowestPipelines = slowest.slice(0, 5);

    const disk = db
      .prepare(
        `SELECT COALESCE(SUM(size), 0) AS bytes,
                COUNT(*) AS artifactCount,
                COUNT(DISTINCT build_id) AS buildCount
         FROM build_artifacts`,
      )
      .get() as { bytes: number; artifactCount: number; buildCount: number };

    const body: HomeMetrics = {
      runningBuildsCount,
      builds24h,
      successes24h,
      failures24h,
      cancelled24h,
      successRate24h,
      recentFailures,
      slowestPipelines,
      diskUsage: {
        totalBytes: Number(disk.bytes ?? 0),
        artifactCount: Number(disk.artifactCount ?? 0),
        buildCount: Number(disk.buildCount ?? 0),
      },
    };
    return body;
  });

  app.get('/api/metrics/pipeline/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const pipeline = getPipeline(id);
    if (!pipeline) return reply.code(404).send({ error: 'pipeline not found' });
    const db = getDb();

    const rows = db
      .prepare(
        `SELECT id, status, started_at, finished_at FROM builds
         WHERE pipeline_id = ?
         ORDER BY started_at DESC
         LIMIT 30`,
      )
      .all(id) as Array<{
      id: string;
      status: string;
      started_at: number;
      finished_at: number | null;
    }>;

    // recentBuilds oldest → newest for sparklines.
    const recentBuilds: PipelineMetricsBuild[] = rows
      .slice()
      .reverse()
      .map((r) => ({
        id: r.id,
        status: r.status as PipelineMetricsBuild['status'],
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        durationMs: r.finished_at != null ? r.finished_at - r.started_at : null,
      }));

    const durations = recentBuilds
      .map((b) => b.durationMs)
      .filter((d): d is number => d != null)
      .sort((a, b) => a - b);
    const durationP50Ms = percentile(durations, 50);
    const durationP95Ms = percentile(durations, 95);

    // Step durations from logs.
    const buildIds = rows.map((r) => r.id);
    const steps = computeStepDurations(buildIds);
    const agg = new Map<
      string,
      { nodeId: string; stepType: StepType; total: number; max: number; count: number }
    >();
    for (const s of steps) {
      const cur = agg.get(s.nodeId);
      if (cur) {
        cur.total += s.durationMs;
        cur.count += 1;
        if (s.durationMs > cur.max) cur.max = s.durationMs;
      } else {
        agg.set(s.nodeId, {
          nodeId: s.nodeId,
          stepType: s.stepType,
          total: s.durationMs,
          max: s.durationMs,
          count: 1,
        });
      }
    }
    const slowestSteps: PipelineMetricsStep[] = Array.from(agg.values())
      .map((a) => ({
        nodeId: a.nodeId,
        stepType: a.stepType,
        avgDurationMs: Math.round(a.total / a.count),
        maxDurationMs: a.max,
        sampleCount: a.count,
      }))
      .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
      .slice(0, 5);

    const body: PipelineMetrics = {
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      recentBuilds,
      durationP50Ms,
      durationP95Ms,
      slowestSteps,
    };
    return body;
  });

  app.get('/api/metrics/disk-usage', async () => {
    const db = getDb();
    const pipelineMap = loadPipelineMap();
    const projectMap = loadProjectMap();

    const total = db
      .prepare(
        `SELECT COALESCE(SUM(size), 0) AS bytes,
                COUNT(*) AS artifactCount,
                COUNT(DISTINCT build_id) AS buildCount
         FROM build_artifacts`,
      )
      .get() as { bytes: number; artifactCount: number; buildCount: number };

    // Per-pipeline rollup via build_artifacts → builds → pipelines.
    const perPipeline = db
      .prepare(
        `SELECT b.pipeline_id AS pipeline_id,
                COALESCE(SUM(ba.size), 0) AS bytes,
                COUNT(ba.id) AS artifactCount,
                COUNT(DISTINCT ba.build_id) AS buildCount
         FROM build_artifacts ba
         JOIN builds b ON b.id = ba.build_id
         GROUP BY b.pipeline_id`,
      )
      .all() as Array<{
      pipeline_id: string;
      bytes: number;
      artifactCount: number;
      buildCount: number;
    }>;

    const pipelines: DiskUsagePipelineEntry[] = perPipeline
      .map((r) => {
        const pi = pipelineMap.get(r.pipeline_id);
        return {
          pipelineId: r.pipeline_id,
          pipelineName: pi?.name ?? '(deleted pipeline)',
          projectId: pi?.projectId ?? '',
          projectName: pi ? projectMap.get(pi.projectId) ?? '(deleted project)' : '(deleted)',
          bytes: Number(r.bytes ?? 0),
          artifactCount: Number(r.artifactCount ?? 0),
          buildCount: Number(r.buildCount ?? 0),
        };
      })
      .sort((a, b) => b.bytes - a.bytes);

    // Orphan artifacts: rows in build_artifacts whose build was pruned.
    const orphan = db
      .prepare(
        `SELECT COALESCE(SUM(size), 0) AS bytes, COUNT(*) AS c
         FROM build_artifacts
         WHERE build_id NOT IN (SELECT id FROM builds)`,
      )
      .get() as { bytes: number; c: number };

    const body: DiskUsageReport = {
      totalBytes: Number(total.bytes ?? 0),
      artifactCount: Number(total.artifactCount ?? 0),
      buildCount: Number(total.buildCount ?? 0),
      pipelines,
      orphanBytes: Number(orphan.bytes ?? 0),
      orphanArtifactCount: Number(orphan.c ?? 0),
    };
    return body;
  });

  app.post('/api/builds/prune', async (req, reply) => {
    const q = (req.query as { olderThanDays?: string }) ?? {};
    const days = Math.max(0, parseInt(q.olderThanDays ?? '', 10));
    if (!days || !Number.isFinite(days)) {
      return reply.code(400).send({ error: 'olderThanDays must be a positive integer' });
    }
    const stats = pruneOldBuilds(days);
    const body: PruneBuildsResponse = stats;
    return body;
  });
}
