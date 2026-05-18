import type { ChildProcess } from 'node:child_process';
import type { Build, Pipeline, Project } from '@buildpilot/shared-types';
import { runPipeline } from './engine';
import { logger } from '../logger';
import { getPipeline } from '../store/pipelines';
import { getProject } from '../store/projects';
import { createBuild, getBuild, listChildBuilds, updateBuildStatus } from '../store/builds';
import { getCurrentBranch, getHeadSha } from '../git/operations';
import { getLane, listLanes } from '../store/lanes';
import { getDb } from '../store/db';
import { appendBuildLogEntry } from '../store/buildLogs';
import { eventBus } from '../events/bus';
import { fanOutMatrix, interpolatePipelineForMatrix, matrixLabel } from './matrix';
import { cancelPendingApprovalsForBuild } from './approvalBus';

interface RunArgs {
  pipeline: Pipeline;
  project: Project;
  build: Build;
  // When set, the engine only runs this node and its descendants.
  fromNodeId?: string;
}

// WP3 (queue): lane-aware scheduler. Replaces the per-project FIFO chain that
// lived here previously. Each lane has its own max-concurrency budget; within
// a lane, pending builds run in (pipeline.priority ASC, build.startedAt ASC)
// order. Across lanes, picks are fully independent.

// laneId → buildIds currently mid-run on that lane. Used to gate tick()
// against the lane's maxConcurrency budget.
const runningByLane = new Map<string, Set<string>>();

// Active child processes keyed by build id, used for hard-kill on cancel.
const activeChildren = new Map<string, Set<ChildProcess>>();

// Cancellation flags. Engine consults this between steps and turns the run
// into a 'cancelled' final status instead of 'failed'.
const cancelledBuilds = new Set<string>();

// Pipeline-id → currently in-flight build-ids (pending or running). Used by
// the rolling-build trigger (Phase 4 Cluster A) so a new commit can cancel
// the previous build for the same pipeline before queuing the new one.
const pipelineInflight = new Map<string, Set<string>>();

// buildId → resolver to call when the build finishes. Lets enqueueBuild()
// callers await build completion just like the old project-FIFO chain did.
// Failures still resolve (never reject) so callers don't have to handle
// rejection separately — runPipeline already finalises the DB row with
// 'failed' / 'cancelled' status.
const buildCompletionResolvers = new Map<string, () => void>();

// buildId → fromNodeId for "restart from step" runs. This is in-memory only;
// a server restart between createBuild() and tick() picking it up means the
// restart-marker is lost and the build runs from scratch. Acceptable for
// "restart" UX — a fresh full run is the safe fallback.
const pendingFromNode = new Map<string, string>();

// Pluggable pipeline runner. Production code uses the real engine; tests can
// inject a fast stub via __setPipelineRunner() to avoid spinning up the full
// DAG executor for queue-ordering assertions.
type PipelineRunner = (args: RunArgs) => Promise<void>;
let pipelineRunner: PipelineRunner = runPipeline;

// Test-only hook. Returns the previous runner so tests can restore it on
// teardown. Not part of the public surface — the leading underscore signals
// "do not call from production code".
export function __setPipelineRunner(fn: PipelineRunner): PipelineRunner {
  const prev = pipelineRunner;
  pipelineRunner = fn;
  return prev;
}

export function __resetCoordinatorState(): void {
  runningByLane.clear();
  activeChildren.clear();
  cancelledBuilds.clear();
  pipelineInflight.clear();
  buildCompletionResolvers.clear();
  pendingFromNode.clear();
  pipelineRunner = runPipeline;
}

interface PendingBuildRow {
  id: string;
  pipeline_id: string;
  project_id: string;
  trigger_sha: string;
  trigger_branch: string;
  status: string;
  started_at: number;
  finished_at: number | null;
  log: string;
  lane_id: string;
}

function pickNextPendingForLane(laneId: string): PendingBuildRow | null {
  // Sort order: pipeline.priority ASC (smaller is more urgent), then build's
  // started_at ASC (FIFO within equal priority — started_at is the row's
  // create timestamp while still in 'pending' state). We join on pipelines
  // because priority lives there; if a pipeline is deleted while a build is
  // still pending we fall back to the highest sortable priority via COALESCE.
  return (
    getDb()
      .prepare(
        `SELECT b.*
         FROM builds b
         LEFT JOIN pipelines p ON p.id = b.pipeline_id
         WHERE b.lane_id = ? AND b.status = 'pending'
         ORDER BY COALESCE(p.priority, 100) ASC, b.started_at ASC
         LIMIT 1`,
      )
      .get(laneId) as PendingBuildRow | undefined
  ) ?? null;
}

export function enqueueBuild(args: RunArgs): Promise<void> {
  const pipelineId = args.pipeline.id;
  const buildId = args.build.id;
  const laneId = args.build.laneId;

  // Cluster 11.C — matrix fan-out. A pipeline with a non-null matrix
  // expands the trigger into N child builds plus this parent "summary"
  // build. The parent doesn't run pipeline steps itself — it waits for
  // every child to settle, then publishes a `notifyMatrix` event and
  // closes out with a rolled-up status. Children are enqueued without
  // matrix metadata themselves (so they take the regular runPipeline
  // path) but receive their per-cell matrixValues + interpolated nodes.
  if (args.pipeline.matrix && !args.build.parentBuildId) {
    return enqueueMatrixParent(args);
  }

  // Track in-flight (pending or running) for the rolling-build canceller.
  // Added eagerly so a queued-but-not-yet-running build is still cancellable.
  const set = pipelineInflight.get(pipelineId) ?? new Set<string>();
  set.add(buildId);
  pipelineInflight.set(pipelineId, set);

  if (args.fromNodeId) pendingFromNode.set(buildId, args.fromNodeId);

  // Promise that resolves when the build is fully done (success / failed /
  // cancelled). Mirrors the old behaviour where awaiting enqueueBuild waited
  // on the per-project FIFO chain.
  const completion = new Promise<void>((resolve) => {
    buildCompletionResolvers.set(buildId, resolve);
  });

  // Kick the lane scheduler. tick() is synchronous up to the void-runPipeline
  // launch, so by the time enqueueBuild returns the build is either running
  // or properly queued behind the lane's concurrency budget.
  tick(laneId);

  return completion;
}

function tick(laneId: string): void {
  const lane = getLane(laneId);
  if (!lane) {
    logger.warn({ laneId }, 'tick: lane not found, skipping');
    return;
  }
  const running = runningByLane.get(laneId) ?? new Set<string>();
  runningByLane.set(laneId, running);

  // Greedy slot-fill: as long as we have headroom AND there's a pending
  // build for this lane in the DB, start it. Each launch is fire-and-forget
  // via void; the .finally() reschedules tick() so the next pending build
  // picks up the freed slot.
  while (running.size < lane.maxConcurrency) {
    const row = pickNextPendingForLane(laneId);
    if (!row) return;

    const buildId = row.id;
    // Guard against the same row being re-picked while still "pending" in
    // the DB but already racing toward 'running'. updateBuildStatus is the
    // atomic transition — once it succeeds the next pickNextPendingForLane
    // call won't see this row again.
    updateBuildStatus(buildId, 'running');
    running.add(buildId);

    const build = getBuild(buildId);
    if (!build) {
      // Disappeared between SELECT and getBuild — rare, but unwind gracefully.
      running.delete(buildId);
      buildCompletionResolvers.get(buildId)?.();
      buildCompletionResolvers.delete(buildId);
      continue;
    }
    const pipeline = getPipeline(row.pipeline_id);
    const project = getProject(row.project_id);
    if (!pipeline || !project) {
      // Pipeline/project deleted between enqueue and pick. Mark the build
      // failed so the UI doesn't show a permanently-running ghost, log a
      // line, and move on.
      logger.warn(
        { buildId, pipelineId: row.pipeline_id, projectId: row.project_id },
        'tick: pipeline or project missing, failing build',
      );
      try {
        appendBuildLogEntry({
          buildId,
          ts: Date.now(),
          level: 'failure',
          nodeId: null,
          stepType: null,
          message: 'Pipeline or project no longer exists — build failed.',
        });
      } catch {
        /* best-effort */
      }
      updateBuildStatus(buildId, 'failed');
      const fresh = getBuild(buildId);
      if (fresh) eventBus.publish({ type: 'buildFinished', build: fresh });
      running.delete(buildId);
      cleanupAfterBuild(buildId, row.pipeline_id);
      // Open slot — try the next pending row in this lane.
      continue;
    }

    const fromNodeId = pendingFromNode.get(buildId);
    pendingFromNode.delete(buildId);
    const pipelineIdForCleanup = row.pipeline_id;

    const runArgs: RunArgs = { pipeline, project, build, fromNodeId };
    void pipelineRunner(runArgs)
      .catch((err) => {
        logger.error({ err, buildId }, 'pipeline crashed');
      })
      .finally(() => {
        const laneRunning = runningByLane.get(laneId);
        laneRunning?.delete(buildId);
        cleanupAfterBuild(buildId, pipelineIdForCleanup);
        // Drain any further work for this lane. Self-recursion is bounded by
        // the maxConcurrency check + "no pending rows" early return above.
        tick(laneId);
      });
  }
}

function cleanupAfterBuild(buildId: string, pipelineId: string): void {
  activeChildren.delete(buildId);
  cancelledBuilds.delete(buildId);
  const s = pipelineInflight.get(pipelineId);
  if (s) {
    s.delete(buildId);
    if (s.size === 0) pipelineInflight.delete(pipelineId);
  }
  buildCompletionResolvers.get(buildId)?.();
  buildCompletionResolvers.delete(buildId);
}

// Boot recovery: a server restart while a build was 'running' would leave an
// orphan row that never finishes. We fail those rows up-front and then kick
// every lane's scheduler so pending rows pre-existing the restart get picked
// up. Safe to call multiple times.
export function initScheduler(): void {
  const db = getDb();
  const now = Date.now();
  const orphans = db
    .prepare(`SELECT id FROM builds WHERE status = 'running'`)
    .all() as { id: string }[];
  if (orphans.length > 0) {
    db.prepare(
      `UPDATE builds SET status = 'failed', finished_at = ? WHERE status = 'running'`,
    ).run(now);
    for (const { id } of orphans) {
      try {
        appendBuildLogEntry({
          buildId: id,
          ts: now,
          level: 'failure',
          nodeId: null,
          stepType: null,
          message: 'Server restarted while build was running — marked failed.',
        });
      } catch {
        /* best-effort */
      }
      const fresh = getBuild(id);
      if (fresh) eventBus.publish({ type: 'buildFinished', build: fresh });
    }
    logger.info({ count: orphans.length }, 'scheduler: failed orphaned running builds');
  }
  // Now nudge each lane so any 'pending' rows that survived the restart
  // (or rows that were inserted before initScheduler ran) get scheduled.
  for (const lane of listLanes()) {
    tick(lane.id);
  }
}

// ── Matrix parent orchestration ─────────────────────────────────────────
//
// The parent build is itself a row in the `builds` table — it surfaces in
// the UI's build list with a status of 'running' until every child has
// finished, then resolves to the aggregate worst-case status
// (failed > cancelled > success). Children share the parent's
// triggerSha/branch but get their own ids and per-cell matrixValues.
//
// We append a few synthetic log entries to the parent build so opening it
// in the dashboard shows context even before the child summary grid
// renders (legacy build-detail-page behavior is preserved when an old
// client opens a new matrix parent).
async function enqueueMatrixParent(args: RunArgs): Promise<void> {
  const { pipeline, project, build: parent } = args;
  if (!pipeline.matrix) return; // type guard — caller already checked
  const pipelineId = pipeline.id;
  const parentId = parent.id;

  // Track the parent so cancel-in-progress logic sees it.
  const set = pipelineInflight.get(pipelineId) ?? new Set<string>();
  set.add(parentId);
  pipelineInflight.set(pipelineId, set);

  const persist = (level: 'system' | 'info' | 'success' | 'failure', message: string) => {
    const entry = appendBuildLogEntry({
      buildId: parentId,
      ts: Date.now(),
      level,
      nodeId: null,
      stepType: null,
      message,
    });
    eventBus.publish({ type: 'buildLogEntry', buildId: parentId, entry });
  };

  // Flip the parent to running + announce.
  updateBuildStatus(parentId, 'running');
  parent.status = 'running';
  eventBus.publish({ type: 'buildStarted', build: parent });
  persist('system', `Matrix pipeline "${pipeline.name}" started — fanning out…`);

  let children;
  try {
    const fan = fanOutMatrix({ pipeline, parentBuild: parent, matrix: pipeline.matrix });
    children = fan.children;
    persist(
      'info',
      `matrix: ${fan.combos.length} cell${fan.combos.length === 1 ? '' : 's'} from axes ${Object.keys(pipeline.matrix.axes).join(', ')}`,
    );
    for (const child of children) {
      persist('info', `  → child ${child.id.slice(0, 8)} ${child.matrixLabel ?? ''}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    persist('failure', `matrix: fan-out failed: ${msg}`);
    updateBuildStatus(parentId, 'failed');
    parent.status = 'failed';
    parent.finishedAt = Date.now();
    eventBus.publish({ type: 'buildFinished', build: parent });
    const s = pipelineInflight.get(pipelineId);
    if (s) {
      s.delete(parentId);
      if (s.size === 0) pipelineInflight.delete(pipelineId);
    }
    return;
  }

  // Launch every child in parallel. Each child runs the pipeline with
  // matrix-interpolated step data; we intentionally bypass the per-project
  // FIFO so the cells execute concurrently (a matrix's whole point). Steps
  // that touch the working tree are the user's responsibility to make safe
  // — typically that means routing children through `remoteSsh` to distinct
  // hosts or using per-cell artifact directories.
  const childPromises = children.map((child) => {
    activeChildren.set(child.id, activeChildren.get(child.id) ?? new Set());
    return Promise.resolve()
      .then(() =>
        runPipeline({
          pipeline: interpolatePipelineForMatrix(pipeline, child.matrixValues ?? {}),
          project,
          build: child,
        }),
      )
      .catch((err) => {
        logger.error({ err, buildId: child.id }, 'matrix child crashed');
      });
  });

  await Promise.allSettled(childPromises);

  // Roll up. Re-read each child from the DB so we observe the final status
  // the engine wrote (not the in-memory copy held during run).
  const final = listChildBuilds(parentId);
  let success = 0;
  let failed = 0;
  let cancelled = 0;
  for (const c of final) {
    if (c.status === 'success') success += 1;
    else if (c.status === 'failed') failed += 1;
    else if (c.status === 'cancelled') cancelled += 1;
  }
  const total = final.length;
  const parentStatus: Build['status'] =
    cancelled > 0 && success + failed + cancelled === total && failed === 0
      ? 'cancelled'
      : failed > 0
        ? 'failed'
        : 'success';
  persist(
    parentStatus === 'success' ? 'success' : 'failure',
    `matrix: ${success}/${total} succeeded${failed > 0 ? `, ${failed} failed` : ''}${cancelled > 0 ? `, ${cancelled} cancelled` : ''}`,
  );

  // Emit the rolled-up event so notification consumers (the future
  // matrix-aware Slack/Discord forwarder) can post a single message.
  eventBus.publish({
    type: 'notifyMatrix',
    parentBuildId: parentId,
    pipelineId,
    projectId: project.id,
    total,
    success,
    failed,
    cancelled,
    children: final.map((c) => ({
      id: c.id,
      matrixLabel: c.matrixLabel ?? matrixLabel(c.matrixValues ?? {}),
      status: c.status,
    })),
  });

  updateBuildStatus(parentId, parentStatus);
  parent.status = parentStatus;
  parent.finishedAt = Date.now();
  eventBus.publish({ type: 'buildFinished', build: parent });

  const s = pipelineInflight.get(pipelineId);
  if (s) {
    s.delete(parentId);
    if (s.size === 0) pipelineInflight.delete(pipelineId);
  }
  cancelledBuilds.delete(parentId);
}

// Cluster 11.C — rerun-failed entry point. Re-uses the matrix expansion
// logic by creating new child rows for each failed cell of the previous
// parent, all attached to the SAME parent so the grid view shows the
// updated status. Returns the list of newly created children.
export async function rerunFailedMatrixChildren(parentBuildId: string): Promise<Build[]> {
  const parent = getBuild(parentBuildId);
  if (!parent) return [];
  const pipeline = getPipeline(parent.pipelineId);
  if (!pipeline) return [];
  const project = getProject(parent.projectId);
  if (!project) return [];
  const existing = listChildBuilds(parentBuildId);
  const failedCells = existing.filter(
    (c) => c.status === 'failed' || c.status === 'cancelled',
  );
  if (failedCells.length === 0) return [];

  // Create replacement child rows. They inherit the failing cell's matrix
  // values so the grid groups runs by cell over time.
  const replacements: Build[] = failedCells.map((cell) =>
    createBuild({
      pipelineId: parent.pipelineId,
      projectId: parent.projectId,
      triggerSha: parent.triggerSha,
      triggerBranch: parent.triggerBranch,
      parentBuildId,
      matrixValues: cell.matrixValues,
      matrixLabel: cell.matrixLabel,
    }),
  );

  // Flip the parent back to running so the UI reflects the new pass.
  updateBuildStatus(parentBuildId, 'running');
  eventBus.publish({
    type: 'buildStarted',
    build: { ...parent, status: 'running', finishedAt: null },
  });

  void Promise.allSettled(
    replacements.map((child) =>
      Promise.resolve().then(() =>
        runPipeline({
          pipeline: interpolatePipelineForMatrix(pipeline, child.matrixValues ?? {}),
          project,
          build: child,
        }),
      ),
    ),
  ).then(() => {
    // Recompute parent rollup over ALL children (including prior passes).
    const all = listChildBuilds(parentBuildId);
    let success = 0;
    let failed = 0;
    let cancelled = 0;
    for (const c of all) {
      if (c.status === 'success') success += 1;
      else if (c.status === 'failed') failed += 1;
      else if (c.status === 'cancelled') cancelled += 1;
    }
    const parentStatus: Build['status'] = failed > 0 ? 'failed' : cancelled > 0 ? 'cancelled' : 'success';
    updateBuildStatus(parentBuildId, parentStatus);
    const refreshed = getBuild(parentBuildId);
    if (refreshed) eventBus.publish({ type: 'buildFinished', build: refreshed });
    eventBus.publish({
      type: 'notifyMatrix',
      parentBuildId,
      pipelineId: parent.pipelineId,
      projectId: parent.projectId,
      total: all.length,
      success,
      failed,
      cancelled,
      children: all.map((c) => ({
        id: c.id,
        matrixLabel: c.matrixLabel ?? matrixLabel(c.matrixValues ?? {}),
        status: c.status,
      })),
    });
  });

  return replacements;
}

export function trackChild(buildId: string, child: ChildProcess): void {
  const set = activeChildren.get(buildId) ?? new Set<ChildProcess>();
  set.add(child);
  activeChildren.set(buildId, set);
  child.on('close', () => set.delete(child));
}

export function cancelBuild(buildId: string): { wasRunning: boolean } {
  cancelledBuilds.add(buildId);
  // Cluster 11.D — a build parked on a manual approval has no active
  // child_process to SIGTERM; instead we resolve the pending approval(s)
  // so the runner unblocks, sees `isCancelled`, and finalises the build
  // as `cancelled`. We treat the released-approval case as "wasRunning"
  // so the caller does NOT overwrite the build status — the engine's
  // finalize() will own that transition once the step throws.
  let releasedApprovals = 0;
  try {
    const released = cancelPendingApprovalsForBuild(buildId);
    releasedApprovals = released.length;
    if (released.length > 0) {
      logger.info({ buildId, released }, 'cancelled build released pending approvals');
    }
  } catch {
    /* approval bus not initialised yet — nothing to do */
  }
  const set = activeChildren.get(buildId);
  if (!set || set.size === 0) {
    return { wasRunning: releasedApprovals > 0 };
  }
  for (const c of set) {
    try {
      c.kill('SIGTERM');
    } catch {
      /* already exited */
    }
  }
  // Hard kill after a grace period in case the child ignores SIGTERM.
  setTimeout(() => {
    for (const c of set) {
      if (!c.killed) {
        try {
          c.kill('SIGKILL');
        } catch {
          /* already exited */
        }
      }
    }
  }, 3000);
  return { wasRunning: true };
}

export function isCancelled(buildId: string): boolean {
  return cancelledBuilds.has(buildId);
}

export function clearCancellation(buildId: string): void {
  cancelledBuilds.delete(buildId);
}

// List the in-flight build-ids for a pipeline so triggers can decide
// whether to cancel previous runs (rolling-build mode, Phase 4 Cluster A).
export function listInflightBuildsForPipeline(pipelineId: string): string[] {
  const set = pipelineInflight.get(pipelineId);
  return set ? [...set] : [];
}

// Reusable "trigger a build for this pipeline" helper used by the API route,
// the Telegram bot's approval flow, and the upcoming auto-trigger paths.
export async function startBuildForPipeline(
  pipelineId: string,
  opts: { fromNodeId?: string } = {},
): Promise<Build | null> {
  const pipeline = getPipeline(pipelineId);
  if (!pipeline) return null;
  const project = getProject(pipeline.projectId);
  if (!project) return null;
  const branch = await getCurrentBranch(project.path).catch(() => project.defaultBranch);
  const head = (await getHeadSha(project.path, branch)) ?? '';
  const build = createBuild({
    pipelineId: pipeline.id,
    projectId: project.id,
    triggerSha: head,
    triggerBranch: branch,
    laneId: pipeline.laneId,
  });
  void enqueueBuild({ pipeline, project, build, fromNodeId: opts.fromNodeId }).catch((err) => {
    logger.error({ err }, 'pipeline crashed');
  });
  return build;
}
