import { useCallback } from 'react';
import type { Edge, Node } from '@xyflow/react';

const KEY = 'buildpilot:editor:clipboard';

export interface ClipboardPayload {
  nodes: Node[];
  edges: Edge[];
}

function read(): ClipboardPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClipboardPayload;
    if (!Array.isArray(parsed.nodes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(payload: ClipboardPayload | null) {
  if (typeof window === 'undefined') return;
  if (payload === null) {
    window.localStorage.removeItem(KEY);
    return;
  }
  window.localStorage.setItem(KEY, JSON.stringify(payload));
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

/**
 * Shared editor-wide clipboard for copying selected nodes (and the edges
 * between them) across pipelines. Backed by localStorage so it survives
 * page navigation within the SPA.
 */
export function usePipelineClipboard() {
  const copy = useCallback((nodes: Node[], edges: Edge[]) => {
    if (nodes.length === 0) {
      write(null);
      return;
    }
    const ids = new Set(nodes.map((n) => n.id));
    const filteredEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    // Strip transient runtime status so it doesn't carry across pipelines.
    const cleanNodes = nodes.map((n) => {
      const data = n.data as Record<string, unknown> & {
        runtimeStatus?: unknown;
        runtimeStartedAt?: unknown;
        runtimeFinishedAt?: unknown;
      };
      const { runtimeStatus: _s, runtimeStartedAt: _a, runtimeFinishedAt: _b, ...rest } = data;
      void _s;
      void _a;
      void _b;
      return { ...n, data: rest, selected: false };
    });
    write({ nodes: cleanNodes, edges: filteredEdges });
  }, []);

  const paste = useCallback(
    (offset: { x: number; y: number } = { x: 40, y: 40 }): ClipboardPayload | null => {
      const payload = read();
      if (!payload) return null;
      const idMap = new Map<string, string>();
      const nodes = payload.nodes.map((n) => {
        const fresh = newId('n');
        idMap.set(n.id, fresh);
        return {
          ...n,
          id: fresh,
          position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
          selected: false,
        };
      });
      const edges = payload.edges.map((e) => ({
        ...e,
        id: newId('e'),
        source: idMap.get(e.source) ?? e.source,
        target: idMap.get(e.target) ?? e.target,
      }));
      return { nodes, edges };
    },
    [],
  );

  const hasClipboard = useCallback(() => read() !== null, []);

  return { copy, paste, hasClipboard };
}
