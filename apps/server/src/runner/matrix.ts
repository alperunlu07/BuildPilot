import type {
  Build,
  Matrix,
  Pipeline,
  PipelineNode,
} from '@buildpilot/shared-types';
import { createBuild, listChildBuilds } from '../store/builds';
import { logger } from '../logger';

// Cluster 11.C — matrix fan-out.
//
// A `Matrix` declares one or more named axes (e.g. xcode=[15,16],
// scheme=[Free,Pro]). The runner expands the cross product into N child
// builds, each with `matrixValues` baked in and `${{ matrix.<axis> }}`
// placeholders interpolated into every step's `data`.
//
// Stable ordering: axis names are sorted alphabetically for matrixLabel
// generation so the same matrix declaration always produces the same
// human-readable label regardless of object-key insertion order. The
// cross-product itself follows the axis-name iteration order on `axes`
// (Object.keys, which is insertion order for string keys) — the order
// users typed axes in the editor is preserved end-to-end.

// ── Cross-product expansion ─────────────────────────────────────────────
// expandMatrix(matrix) returns the list of {axis: value} permutations in a
// deterministic order: the first axis varies slowest, the last axis varies
// fastest — i.e. an odometer with the leftmost wheel ticking slowest.
//
// Example: { xcode: [15, 16], scheme: [Free, Pro] } yields, in order:
//   { xcode: "15", scheme: "Free" }
//   { xcode: "15", scheme: "Pro" }
//   { xcode: "16", scheme: "Free" }
//   { xcode: "16", scheme: "Pro" }
export function expandMatrix(matrix: Matrix): Array<Record<string, string>> {
  const axisNames = Object.keys(matrix.axes);
  if (axisNames.length === 0) return [];
  for (const name of axisNames) {
    const vals = matrix.axes[name];
    if (!Array.isArray(vals) || vals.length === 0) return [];
  }
  const combos: Array<Record<string, string>> = [{}];
  for (const name of axisNames) {
    const next: Array<Record<string, string>> = [];
    for (const acc of combos) {
      for (const v of matrix.axes[name]!) {
        next.push({ ...acc, [name]: String(v) });
      }
    }
    combos.length = 0;
    combos.push(...next);
  }
  return combos;
}

// Stable label like "xcode=15, scheme=Free". Axis names sorted so the
// label doesn't shift if the matrix is re-saved with a different key
// order. (Matters for log readability and "rerun failed" affordances.)
export function matrixLabel(values: Record<string, string>): string {
  return Object.keys(values)
    .sort()
    .map((k) => `${k}=${values[k]}`)
    .join(', ');
}

// ── Interpolation ───────────────────────────────────────────────────────
// `${{ matrix.foo }}` → matrixValues.foo. We deliberately keep this
// separate from the (future) secrets interpolation: namespaces don't
// overlap, so the two can coexist without conflict.
//
// Replacement is greedy and tolerant of whitespace inside the braces.
// Unknown placeholders pass through untouched so a typo doesn't silently
// blank out a field.
const MATRIX_PLACEHOLDER = /\$\{\{\s*matrix\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function interpolateMatrixString(
  input: string,
  values: Record<string, string>,
): string {
  return input.replace(MATRIX_PLACEHOLDER, (raw, axis: string) => {
    if (Object.prototype.hasOwnProperty.call(values, axis)) {
      return values[axis] ?? '';
    }
    return raw;
  });
}

// Recursive deep clone + interpolate. We only touch strings; numbers,
// booleans, nulls, and arrays-of-non-strings round-trip unchanged. The
// engine's step data is always plain JSON so circular references are not
// a concern.
export function interpolateMatrixData<T>(
  data: T,
  values: Record<string, string>,
): T {
  if (typeof data === 'string') {
    return interpolateMatrixString(data, values) as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map((item) => interpolateMatrixData(item, values)) as unknown as T;
  }
  if (data && typeof data === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      out[k] = interpolateMatrixData(v, values);
    }
    return out as unknown as T;
  }
  return data;
}

// Apply matrix interpolation to every node's data field, returning a new
// pipeline object that the engine can run as if it were authored with the
// resolved values inline.
export function interpolatePipelineForMatrix(
  pipeline: Pipeline,
  values: Record<string, string>,
): Pipeline {
  const nodes: PipelineNode[] = pipeline.nodes.map((n) => ({
    ...n,
    data: interpolateMatrixData(n.data, values),
  }));
  return { ...pipeline, nodes };
}

// ── Fan-out helper ─────────────────────────────────────────────────────
// Given a parent build (already created in pending state) and the matrix,
// create one child Build row per cross-product combination. Returns the
// child builds in expansion order so the caller can enqueue them.
export interface MatrixFanOutInput {
  pipeline: Pipeline;
  parentBuild: Build;
  matrix: Matrix;
}

export interface MatrixFanOutResult {
  children: Build[];
  // Convenience copy of expandMatrix(matrix) so callers don't have to
  // recompute it for logging.
  combos: Array<Record<string, string>>;
}

export function fanOutMatrix(input: MatrixFanOutInput): MatrixFanOutResult {
  const combos = expandMatrix(input.matrix);
  const children: Build[] = combos.map((values) => {
    const label = matrixLabel(values);
    return createBuild({
      pipelineId: input.parentBuild.pipelineId,
      projectId: input.parentBuild.projectId,
      triggerSha: input.parentBuild.triggerSha,
      triggerBranch: input.parentBuild.triggerBranch,
      parentBuildId: input.parentBuild.id,
      matrixValues: values,
      matrixLabel: label,
    });
  });
  logger.info(
    {
      parentBuildId: input.parentBuild.id,
      pipelineId: input.parentBuild.pipelineId,
      n: children.length,
    },
    'matrix: fanned out children',
  );
  return { children, combos };
}

// Re-export for the API + UI side so the "rerun failed cells" path can
// list the failures without duplicating the SQL.
export function listMatrixChildren(parentBuildId: string): Build[] {
  return listChildBuilds(parentBuildId);
}
