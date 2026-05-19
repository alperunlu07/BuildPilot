// Cluster 11.D — in-process event bus that lets a running `manualApproval`
// step block on a decision arriving via the HTTP API.
//
// Design: each pending approval registers a resolver keyed by approvalId.
// When the API decides() the approval to a terminal state, it calls
// `resolveApproval(approvalId, decision)` which fires the resolver and the
// step runner resumes. A bounded poll fallback handles edge cases
// (server restart, lost event) by re-checking the DB.

import type { ApprovalDecision } from '@buildpilot/shared-types';

type Resolver = (decision: ApprovalDecision) => void;

const resolvers = new Map<string, Resolver>();
const approvalsByBuild = new Map<string, Set<string>>();

export function registerApproval(approvalId: string, buildId: string): Promise<ApprovalDecision> {
  const set = approvalsByBuild.get(buildId) ?? new Set<string>();
  set.add(approvalId);
  approvalsByBuild.set(buildId, set);
  return new Promise<ApprovalDecision>((resolve) => {
    resolvers.set(approvalId, (decision) => {
      resolvers.delete(approvalId);
      const s = approvalsByBuild.get(buildId);
      if (s) {
        s.delete(approvalId);
        if (s.size === 0) approvalsByBuild.delete(buildId);
      }
      resolve(decision);
    });
  });
}

export function resolveApproval(approvalId: string, decision: ApprovalDecision): void {
  const r = resolvers.get(approvalId);
  if (r) r(decision);
}

export function hasPendingApprovalListener(approvalId: string): boolean {
  return resolvers.has(approvalId);
}

// Called from coordinator.cancelBuild() so a build sitting on a manual
// approval can be force-killed via the Cancel button. We resolve every
// pending listener with 'timeout' (DB row is left as NULL — the cancelled
// build's status will be the source of truth).
export function cancelPendingApprovalsForBuild(buildId: string): string[] {
  const ids = [...(approvalsByBuild.get(buildId) ?? [])];
  for (const id of ids) resolveApproval(id, 'timeout');
  return ids;
}
