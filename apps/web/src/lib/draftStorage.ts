import type { Matrix, Pipeline, PipelineEdge, PipelineNode, PipelineWatch } from '@buildpilot/shared-types';

// One key per pipeline so drafts don't collide. The prefix lets us iterate
// + clean up later if we ever grow a "discard all drafts" affordance.
const KEY_PREFIX = 'buildpilot.draft.pipeline.';

export interface PipelineDraft {
  name: string;
  watch: PipelineWatch;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  // Cluster 11.C — declarative build matrix, null when not set.
  matrix?: Matrix | null;
  savedAt: number;
}

function keyFor(pipelineId: string): string {
  return `${KEY_PREFIX}${pipelineId}`;
}

export function writeDraft(pipelineId: string, draft: PipelineDraft): void {
  try {
    localStorage.setItem(keyFor(pipelineId), JSON.stringify(draft));
  } catch {
    // localStorage can throw in quota or private-mode browsers — swallowing
    // here is intentional: the editor still has the in-memory state.
  }
}

export function readDraft(pipelineId: string): PipelineDraft | null {
  try {
    const raw = localStorage.getItem(keyFor(pipelineId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PipelineDraft;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(pipelineId: string): void {
  try {
    localStorage.removeItem(keyFor(pipelineId));
  } catch {
    // ignore
  }
}

// True when the draft contains material changes vs. the server-side pipeline.
// Pure structural compare — JSON.stringify is good enough since the editor
// always serializes the same field ordering.
export function draftDiffersFromPipeline(
  draft: PipelineDraft,
  pipeline: Pipeline,
): boolean {
  const a = JSON.stringify({
    name: draft.name,
    watch: draft.watch,
    nodes: draft.nodes,
    edges: draft.edges,
    matrix: draft.matrix ?? null,
  });
  const b = JSON.stringify({
    name: pipeline.name,
    watch: pipeline.watch,
    nodes: pipeline.nodes,
    edges: pipeline.edges,
    matrix: pipeline.matrix ?? null,
  });
  return a !== b;
}
