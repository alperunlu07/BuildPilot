import { useCallback, useRef, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';

export interface HistorySnapshot {
  nodes: Node[];
  edges: Edge[];
}

interface Options {
  capacity?: number;
}

/**
 * Lightweight undo / redo stack for the pipeline editor.
 *
 * `record(snap)` pushes the *previous* state onto the undo stack and clears
 * redo. Call it BEFORE applying a mutation, or pass the post-state and treat
 * undo as "go to previous". We use the "record on commit" model where
 * `record` snapshots the state right before a mutation lands.
 */
export function usePipelineHistory(opts: Options = {}) {
  const capacity = opts.capacity ?? 100;
  const undoStack = useRef<HistorySnapshot[]>([]);
  const redoStack = useRef<HistorySnapshot[]>([]);
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);

  const record = useCallback(
    (snap: HistorySnapshot) => {
      undoStack.current.push(cloneSnap(snap));
      if (undoStack.current.length > capacity) {
        undoStack.current.shift();
      }
      redoStack.current = [];
      bump();
    },
    [capacity],
  );

  const undo = useCallback((current: HistorySnapshot): HistorySnapshot | null => {
    const prev = undoStack.current.pop();
    if (!prev) return null;
    redoStack.current.push(cloneSnap(current));
    bump();
    return prev;
  }, []);

  const redo = useCallback((current: HistorySnapshot): HistorySnapshot | null => {
    const next = redoStack.current.pop();
    if (!next) return null;
    undoStack.current.push(cloneSnap(current));
    bump();
    return next;
  }, []);

  const reset = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    bump();
  }, []);

  return {
    record,
    undo,
    redo,
    reset,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  };
}

function cloneSnap(snap: HistorySnapshot): HistorySnapshot {
  return {
    nodes: snap.nodes.map((n) => ({ ...n, data: { ...(n.data as Record<string, unknown>) }, position: { ...n.position } })),
    edges: snap.edges.map((e) => ({ ...e, data: e.data ? { ...(e.data as Record<string, unknown>) } : undefined })),
  };
}
