// Cluster 11.D — `manualApproval` step.
//
// Pauses the build mid-run and waits for an in-app decision. On approve the
// runner continues; on reject / timeout the step throws which surfaces as a
// failed step (so downstream conditional edges apply just like any other
// failure). The pending approval is persisted to `build_approvals` so a
// server restart doesn't lose it.

import type {
  ApprovalDecision,
  ApprovalInputSpec,
  ManualApprovalStepData,
} from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import {
  createApproval,
  getApproval,
  markApprovalTimedOut,
} from '../../store/approvals';
import { updateBuildStatus } from '../../store/builds';
import { eventBus } from '../../events/bus';
import { registerApproval } from '../approvalBus';
import { isCancelled } from '../coordinator';

function parseInputs(raw: unknown): ApprovalInputSpec[] {
  if (Array.isArray(raw)) {
    return (raw as ApprovalInputSpec[]).filter(
      (x) =>
        x &&
        typeof x === 'object' &&
        typeof x.name === 'string' &&
        typeof x.label === 'string',
    );
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parseInputs(parsed);
    } catch {
      // ignore — falls through to empty list
    }
  }
  return [];
}

function parseRoles(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((r): r is string => typeof r === 'string');
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

function parsePositiveNumber(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export async function runManualApproval(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<ManualApprovalStepData> & Record<string, unknown>;
  const message = typeof d.message === 'string' ? d.message : '';
  if (!message || message.trim().length === 0) {
    throw new Error('manualApproval: missing "message"');
  }
  const inputsSpec = parseInputs(d.inputs);
  const requiredApprovers = Math.max(
    1,
    Math.floor(parsePositiveNumber(d.requiredApprovers, 1)),
  );
  const timeoutMinutes = Math.max(0, parsePositiveNumber(d.timeoutMinutes, 1440));
  const requiredRoles = parseRoles(d.requiredRoles);

  const approval = createApproval({
    buildId: ctx.build.id,
    pipelineId: ctx.build.pipelineId,
    projectId: ctx.build.projectId,
    nodeId: ctx.nodeId,
    message,
    inputsSpec,
    requiredApprovers,
    requiredRoles,
    timeoutMinutes,
  });

  // Mark the build as awaiting approval so the dashboard can surface the
  // ApprovalCard at the top of BuildDetailPage. We restore 'running' on
  // resume below.
  updateBuildStatus(ctx.build.id, 'awaiting_approval');
  ctx.build.status = 'awaiting_approval';
  eventBus.publish({
    type: 'buildAwaitingApproval',
    buildId: ctx.build.id,
    approval,
  });

  ctx.log(
    `▸ awaiting manual approval (${requiredApprovers} approver${requiredApprovers === 1 ? '' : 's'}` +
      (requiredRoles.length > 0 ? `, roles: ${requiredRoles.join(', ')}` : '') +
      (timeoutMinutes > 0 ? `, timeout: ${timeoutMinutes}m` : ', no timeout') +
      ')',
    'system',
  );

  const decision = await waitForDecision(approval.id, ctx.build.id, timeoutMinutes);

  // Pull the latest row so the log line records who decided.
  const final = getApproval(approval.id);
  const decidedBy = final?.decidedBy ?? 'system';

  // Restore the build status — finalize() at the end of runPipeline will
  // set the terminal status; we just need to leave 'running' here so any
  // subsequent step or the engine itself can act normally. Skip if the
  // build was cancelled while parked (the cancelBuild path already wrote
  // 'cancelled').
  if (!isCancelled(ctx.build.id)) {
    updateBuildStatus(ctx.build.id, 'running');
    ctx.build.status = 'running';
  }
  eventBus.publish({
    type: 'buildApprovalDecided',
    buildId: ctx.build.id,
    approvalId: approval.id,
    decision,
  });

  if (decision === 'approve') {
    ctx.log(`✔ approved by ${decidedBy}`, 'success');
    return;
  }
  if (decision === 'reject') {
    throw new Error(`manualApproval: rejected by ${decidedBy}`);
  }
  // timeout
  throw new Error(
    `manualApproval: timed out after ${timeoutMinutes} minute${timeoutMinutes === 1 ? '' : 's'} with no decision`,
  );
}

async function waitForDecision(
  approvalId: string,
  buildId: string,
  timeoutMinutes: number,
): Promise<ApprovalDecision> {
  const promises: Promise<ApprovalDecision>[] = [registerApproval(approvalId, buildId)];
  // Bounded poll: on the off chance the in-process listener was lost
  // (server restart, multiple workers, etc) re-check the DB every 15s.
  let pollCancel: NodeJS.Timeout | null = null;
  promises.push(
    new Promise<ApprovalDecision>((resolve) => {
      pollCancel = setInterval(() => {
        const row = getApproval(approvalId);
        if (row?.decision) resolve(row.decision);
      }, 15_000);
    }),
  );

  let timeoutHandle: NodeJS.Timeout | null = null;
  if (timeoutMinutes > 0) {
    promises.push(
      new Promise<ApprovalDecision>((resolve) => {
        timeoutHandle = setTimeout(
          () => {
            const updated = markApprovalTimedOut(approvalId);
            resolve(updated?.decision ?? 'timeout');
          },
          timeoutMinutes * 60 * 1000,
        );
      }),
    );
  }

  try {
    return await Promise.race(promises);
  } finally {
    if (pollCancel) clearInterval(pollCancel);
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
