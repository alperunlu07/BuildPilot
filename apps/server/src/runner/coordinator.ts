import type { ChildProcess } from 'node:child_process';
import type { Build, Pipeline, Project } from '@buildpilot/shared-types';
import { runPipeline } from './engine';
import { logger } from '../logger';
import { getPipeline } from '../store/pipelines';
import { getProject } from '../store/projects';
import { createBuild } from '../store/builds';
import { getCurrentBranch, getHeadSha } from '../git/operations';
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
  });
  void enqueueBuild({ pipeline, project, build, fromNodeId: opts.fromNodeId }).catch((err) => {
    logger.error({ err }, 'pipeline crashed');
  });
  return build;
}
