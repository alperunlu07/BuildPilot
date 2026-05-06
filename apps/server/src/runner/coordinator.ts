import type { ChildProcess } from 'node:child_process';
import type { Build, Pipeline, Project } from '@buildpilot/shared-types';
import { runPipeline } from './engine';
import { logger } from '../logger';

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

export function enqueueBuild(args: RunArgs): Promise<void> {
  const projectId = args.project.id;
  const prev = projectQueues.get(projectId) ?? Promise.resolve();
  const next = prev
    .catch(() => null)
    .then(() => runPipeline(args))
    .catch((err) => {
      logger.error({ err, buildId: args.build.id }, 'pipeline crashed');
    });
  projectQueues.set(projectId, next);
  void next.finally(() => {
    if (projectQueues.get(projectId) === next) {
      projectQueues.delete(projectId);
    }
    activeChildren.delete(args.build.id);
    cancelledBuilds.delete(args.build.id);
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
  const set = activeChildren.get(buildId);
  if (!set || set.size === 0) return { wasRunning: false };
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
