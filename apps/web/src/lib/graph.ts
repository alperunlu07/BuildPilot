import type { Commit } from '@buildpilot/shared-types';

export interface GraphRow extends Commit {
  myLane: number;
  topLanes: (string | null)[];
  bottomLanes: (string | null)[];
}

export interface GraphLayout {
  rows: GraphRow[];
  width: number;
}

/**
 * Topological lane assignment. Expects commits in topological order with
 * children before parents (i.e., newest first), as produced by
 * `git log --topo-order`.
 *
 * For each commit we:
 *   - find every active lane currently expecting that commit's SHA;
 *   - park ourselves on the leftmost matching lane (others converge / null);
 *   - replace our lane's expected SHA with our first parent;
 *   - allocate fresh lanes for any additional parents (merges).
 */
export function computeGraph(commits: Commit[]): GraphLayout {
  const lanes: (string | null)[] = [];
  const rows: GraphRow[] = [];

  for (const commit of commits) {
    const matchingLanes: number[] = [];
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === commit.sha) matchingLanes.push(i);
    }

    let myLane: number;
    if (matchingLanes.length > 0) {
      myLane = matchingLanes[0]!;
      for (const i of matchingLanes.slice(1)) lanes[i] = null;
    } else {
      const emptyIdx = lanes.findIndex((l) => l === null);
      if (emptyIdx === -1) {
        myLane = lanes.length;
        lanes.push(null);
      } else {
        myLane = emptyIdx;
      }
    }

    // Snapshot the lane state at the TOP of this row, padded so myLane is reachable.
    const topLanes = [...lanes];
    while (topLanes.length <= myLane) topLanes.push(null);

    if (commit.parents.length === 0) {
      lanes[myLane] = null;
    } else {
      const firstParent = commit.parents[0]!;
      const fpInOther = lanes.findIndex((l, i) => i !== myLane && l === firstParent);
      if (fpInOther !== -1) {
        // First parent is already tracked elsewhere; surrender our lane so it can converge.
        lanes[myLane] = null;
      } else {
        lanes[myLane] = firstParent;
      }
      for (let p = 1; p < commit.parents.length; p++) {
        const pSha = commit.parents[p]!;
        if (lanes.includes(pSha)) continue;
        const emptyIdx = lanes.findIndex((l) => l === null);
        if (emptyIdx === -1) lanes.push(pSha);
        else lanes[emptyIdx] = pSha;
      }
    }

    rows.push({
      ...commit,
      myLane,
      topLanes,
      bottomLanes: [...lanes],
    });
  }

  const width = rows.reduce(
    (max, r) => Math.max(max, r.topLanes.length, r.bottomLanes.length, r.myLane + 1),
    1,
  );
  return { rows, width };
}

const LANE_COLORS = [
  '#10b981', // emerald
  '#0ea5e9', // sky
  '#a855f7', // purple
  '#f59e0b', // amber
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#6366f1', // indigo
];

export function laneColor(lane: number): string {
  return LANE_COLORS[((lane % LANE_COLORS.length) + LANE_COLORS.length) % LANE_COLORS.length]!;
}
