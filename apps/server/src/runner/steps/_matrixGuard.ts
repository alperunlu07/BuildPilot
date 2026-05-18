import type { StepContext } from '../engine';
import { getPipeline } from '../../store/pipelines';

// Cluster 11.C — matrix-aware notifications guard.
//
// When a notify step runs inside a matrix CHILD build AND the parent
// pipeline has `watch.matrixSummary` set (default true), suppress the
// per-cell notification. The parent build's coordinator emits a single
// `notifyMatrix` event with the rolled-up tally so downstream consumers
// can post one message per matrix instead of N.
//
// Returns true when the notify step should noop. Callers should log a
// "skipped" line so the per-build log makes the suppression visible.
export function suppressForMatrixSummary(ctx: StepContext): boolean {
  if (!ctx.build.parentBuildId) return false; // Not a matrix child.
  const pipeline = getPipeline(ctx.build.pipelineId);
  if (!pipeline) return false;
  // Default to true when the column is unset (legacy row) — matches the
  // documented "opt-in flag, default true" behavior.
  return pipeline.watch.matrixSummary !== false;
}
