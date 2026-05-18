import type { BuildLogEntry, StepType } from '@buildpilot/shared-types';

export interface StepDuration {
  nodeId: string;
  stepType: StepType | null;
  durationMs: number;
  status: 'running' | 'success' | 'failed';
}

// Walk a build's log entries and compute one duration per pipeline node.
// Mirrors the span logic in `StepGantt.computeSpans` but exported standalone
// so other views (build diff, step-comparison panel) can reuse it.
export function stepDurationsFromEntries(entries: BuildLogEntry[]): StepDuration[] {
  const map = new Map<string, StepDuration & { start: number; end: number }>();
  for (const e of entries) {
    if (!e.nodeId) continue;
    const cur = map.get(e.nodeId);
    if (!cur) {
      map.set(e.nodeId, {
        nodeId: e.nodeId,
        stepType: e.stepType,
        start: e.ts,
        end: e.ts,
        status: 'running',
        durationMs: 0,
      });
      continue;
    }
    cur.end = Math.max(cur.end, e.ts);
    if (e.level === 'success') cur.status = 'success';
    else if (e.level === 'failure') cur.status = 'failed';
  }
  const out: StepDuration[] = [];
  for (const span of map.values()) {
    out.push({
      nodeId: span.nodeId,
      stepType: span.stepType,
      durationMs: Math.max(0, span.end - span.start),
      status: span.status,
    });
  }
  return out;
}

export interface StepDurationDelta {
  nodeId: string;
  stepType: StepType | null;
  current: number;
  previous: number | null;
  deltaMs: number | null;
  deltaPct: number | null;
}

// Pair the current build's per-node durations against the previous build's
// by nodeId. Returns one row per node in the current set (we don't surface
// dropped steps — they're already gone from the user's pipeline view).
export function diffStepDurations(
  current: StepDuration[],
  previous: StepDuration[],
): StepDurationDelta[] {
  const prevMap = new Map(previous.map((s) => [s.nodeId, s] as const));
  return current.map((c) => {
    const p = prevMap.get(c.nodeId);
    if (!p) {
      return {
        nodeId: c.nodeId,
        stepType: c.stepType,
        current: c.durationMs,
        previous: null,
        deltaMs: null,
        deltaPct: null,
      };
    }
    const deltaMs = c.durationMs - p.durationMs;
    const deltaPct = p.durationMs > 0 ? (deltaMs / p.durationMs) * 100 : null;
    return {
      nodeId: c.nodeId,
      stepType: c.stepType,
      current: c.durationMs,
      previous: p.durationMs,
      deltaMs,
      deltaPct,
    };
  });
}
