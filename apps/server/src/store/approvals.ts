import { randomUUID } from 'node:crypto';
import type {
  ApprovalDecision,
  ApprovalInputSpec,
  BuildApproval,
} from '@buildpilot/shared-types';
import { getDb } from './db';

interface ApprovalRow {
  id: string;
  build_id: string;
  pipeline_id: string;
  project_id: string;
  node_id: string;
  message: string;
  inputs_spec_json: string;
  required_approvers: number;
  required_roles_json: string;
  timeout_minutes: number;
  requested_at: number;
  decision: string | null;
  decided_by: string | null;
  decided_at: number | null;
  inputs_values_json: string | null;
  approvers_json: string;
}

function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function rowToApproval(row: ApprovalRow): BuildApproval {
  return {
    id: row.id,
    buildId: row.build_id,
    pipelineId: row.pipeline_id,
    projectId: row.project_id,
    nodeId: row.node_id,
    message: row.message,
    inputsSpec: parseJsonArray<ApprovalInputSpec>(row.inputs_spec_json),
    requiredApprovers: row.required_approvers,
    requiredRoles: parseJsonArray<string>(row.required_roles_json),
    timeoutMinutes: row.timeout_minutes,
    requestedAt: row.requested_at,
    decision: (row.decision ?? null) as ApprovalDecision | null,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    inputsValues: row.inputs_values_json
      ? (() => {
          try {
            return JSON.parse(row.inputs_values_json) as Record<string, string | boolean>;
          } catch {
            return null;
          }
        })()
      : null,
    approvers: parseJsonArray(row.approvers_json),
  };
}

export interface CreateApprovalInput {
  buildId: string;
  pipelineId: string;
  projectId: string;
  nodeId: string;
  message: string;
  inputsSpec: ApprovalInputSpec[];
  requiredApprovers: number;
  requiredRoles: string[];
  timeoutMinutes: number;
}

export function createApproval(input: CreateApprovalInput): BuildApproval {
  const id = randomUUID();
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO build_approvals
         (id, build_id, pipeline_id, project_id, node_id, message,
          inputs_spec_json, required_approvers, required_roles_json,
          timeout_minutes, requested_at, decision, decided_by,
          decided_at, inputs_values_json, approvers_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, '[]')`,
    )
    .run(
      id,
      input.buildId,
      input.pipelineId,
      input.projectId,
      input.nodeId,
      input.message,
      JSON.stringify(input.inputsSpec ?? []),
      Math.max(1, Math.floor(input.requiredApprovers || 1)),
      JSON.stringify(input.requiredRoles ?? []),
      Math.max(0, Math.floor(input.timeoutMinutes ?? 1440)),
      now,
    );
  return {
    id,
    buildId: input.buildId,
    pipelineId: input.pipelineId,
    projectId: input.projectId,
    nodeId: input.nodeId,
    message: input.message,
    inputsSpec: input.inputsSpec,
    requiredApprovers: Math.max(1, Math.floor(input.requiredApprovers || 1)),
    requiredRoles: input.requiredRoles ?? [],
    timeoutMinutes: Math.max(0, Math.floor(input.timeoutMinutes ?? 1440)),
    requestedAt: now,
    decision: null,
    decidedBy: null,
    decidedAt: null,
    inputsValues: null,
    approvers: [],
  };
}

export function getApproval(id: string): BuildApproval | null {
  const row = getDb()
    .prepare('SELECT * FROM build_approvals WHERE id = ?')
    .get(id) as ApprovalRow | undefined;
  return row ? rowToApproval(row) : null;
}

export function listApprovalsForBuild(buildId: string): BuildApproval[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM build_approvals WHERE build_id = ? ORDER BY requested_at ASC',
    )
    .all(buildId) as ApprovalRow[];
  return rows.map(rowToApproval);
}

// Used by the inbox + by the server on boot to recover pending approvals.
export function listPendingApprovals(): BuildApproval[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM build_approvals WHERE decision IS NULL ORDER BY requested_at ASC',
    )
    .all() as ApprovalRow[];
  return rows.map(rowToApproval);
}

// Atomic "add an individual decision and maybe resolve" — used by
// requiredApprovers > 1 flows. Returns the updated approval. The caller
// inspects approval.decision to decide whether to release the runner.
export function recordApproverDecision(
  approvalId: string,
  actor: string,
  decision: 'approve' | 'reject',
  inputValues: Record<string, string | boolean> | null,
): BuildApproval | null {
  const cur = getApproval(approvalId);
  if (!cur) return null;
  if (cur.decision) return cur; // already settled

  // Each distinct actor only counts once. If the same actor decides
  // again we overwrite the previous entry.
  const approvers = cur.approvers.filter((a) => a.actor !== actor);
  approvers.push({ actor, decision, at: Date.now() });

  let finalDecision: ApprovalDecision | null = null;
  if (decision === 'reject') {
    finalDecision = 'reject';
  } else {
    const approvalsCount = approvers.filter((a) => a.decision === 'approve').length;
    if (approvalsCount >= cur.requiredApprovers) {
      finalDecision = 'approve';
    }
  }

  const decidedBy = finalDecision
    ? approvers
        .filter((a) =>
          finalDecision === 'reject' ? a.decision === 'reject' : a.decision === 'approve',
        )
        .map((a) => a.actor)
        .join(',')
    : null;
  const decidedAt = finalDecision ? Date.now() : null;
  const mergedValues = inputValues
    ? { ...(cur.inputsValues ?? {}), ...inputValues }
    : cur.inputsValues;

  getDb()
    .prepare(
      `UPDATE build_approvals SET
         approvers_json = ?,
         inputs_values_json = ?,
         decision = ?,
         decided_by = ?,
         decided_at = ?
       WHERE id = ?`,
    )
    .run(
      JSON.stringify(approvers),
      mergedValues ? JSON.stringify(mergedValues) : null,
      finalDecision,
      decidedBy,
      decidedAt,
      approvalId,
    );

  return getApproval(approvalId);
}

// Marker used by the timeout path. Sets a final timeout decision without
// recording an actor.
export function markApprovalTimedOut(approvalId: string): BuildApproval | null {
  const cur = getApproval(approvalId);
  if (!cur || cur.decision) return cur;
  const now = Date.now();
  getDb()
    .prepare(
      `UPDATE build_approvals SET decision = 'timeout', decided_at = ? WHERE id = ?`,
    )
    .run(now, approvalId);
  return getApproval(approvalId);
}
