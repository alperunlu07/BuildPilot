import type { ChildProcess } from 'node:child_process';
import type { Build, Pipeline, Project } from '@buildpilot/shared-types';
import { runPipeline } from './engine';
import { logger } from '../logger';
import { getPipeline } from '../store/pipelines';
import { getProject } from '../store/projects';
import { createBuild, getBuild, listChildBuilds, updateBuildStatus } from '../store/builds';
import { getCurrentBranch, getHeadSha } from '../git/operations';
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

// One FIFO queue per project so two builds against the same working tree
// don't race on git operations or output files.
const projectQueues = new Map<string, Promise<unknown>>();

// Active child processes keyed by build id, used for hard-kill on cancel.
const activeChildren = new Map<string, Set<ChildProcess>>();

// Cancellation flags. Engine consults this between steps and turns the run
// into a 'cancelled' final status instead of 'failed'.
const cancelledBuilds = new Set<string>();

// Pipeline-id → currently in-flight build-ids (pending or running). Used by
// the rolling-build trigger (Phase 4 Cluster A) so a new commit can cancel
// the previous build for the same pipeline before queuing the new one.
const pipelineInflight = new Map<string, Set<string>>();

export function enqueueBuild(args: RunArgs): Promise<void> {
  const projectId = args.project.id;
  const pipelineId = args.pipeline.id;
  const buildId = args.build.id;

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

  // Track this build as in-flight for its pipeline so cancelInProgressForPipeline
  // can find it on the next commit. We add eagerly (pre-runPipeline) so a
  // queued-but-not-yet-running build is still cancellable.
  const set = pipelineInflight.get(pipelineId) ?? new Set<string>();
  set.add(buildId);
  pipelineInflight.set(pipelineId, set);

  const prev = projectQueues.get(projectId) ?? Promise.resolve();
  const next = prev
    .catch(() => null)
    .then(() => runPipeline(args))
    .catch((err) => {
      logger.error({ err, buildId }, 'pipeline crashed');
    });
  projectQueues.set(projectId, next);
  void next.finally(() => {
    if (projectQueues.get(projectId) === next) {
      projectQueues.delete(projectId);
    }
    activeChildren.delete(buildId);
    cancelledBuilds.delete(buildId);
    const s = pipelineInflight.get(pipelineId);
    if (s) {
      s.delete(buildId);
      if (s.size === 0) pipelineInflight.delete(pipelineId);
    }
  });
  return next;
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
