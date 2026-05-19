// Cluster 11.D — approval HTTP endpoints.
//
//   GET  /api/approvals                                  → all pending
//   GET  /api/builds/:id/approvals                       → for one build
//   POST /api/builds/:buildId/approvals/:approvalId/decide
//                                                        → record a decision
//
// The POST handler validates the approval is still pending, applies the
// decision (multi-approver flows aggregate; single-approver flows finalise
// immediately), publishes an SSE event, and pokes the in-process approval
// bus so the parked step runner resumes.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getApproval,
  listApprovalsForBuild,
  listPendingApprovals,
  recordApproverDecision,
} from '../store/approvals';
import { getBuild } from '../store/builds';
import { appendBuildLogEntry } from '../store/buildLogs';
import { eventBus } from '../events/bus';
import { resolveApproval } from '../runner/approvalBus';
import { logger } from '../logger';

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  inputValues: z.record(z.union([z.string(), z.boolean()])).optional(),
  actor: z.string().min(1).optional(),
});

export async function approvalsRoutes(app: FastifyInstance): Promise<void> {
  // Inbox feed — every approval currently waiting on a decision.
  // Optional `?role=foo` filter lets the UI scope to the caller's role
  // once Cluster A (auth) is wired; today it's a soft filter (matches if
  // requiredRoles is empty OR includes the role).
  app.get('/api/approvals', async (req) => {
    const q = (req.query as { role?: string }) ?? {};
    const pending = listPendingApprovals();
    if (!q.role) return pending;
    return pending.filter(
      (a) => a.requiredRoles.length === 0 || a.requiredRoles.includes(q.role!),
    );
  });

  app.get('/api/builds/:id/approvals', async (req, reply) => {
    const { id } = req.params as { id: string };
    const build = getBuild(id);
    if (!build) return reply.code(404).send({ error: 'build not found' });
    return listApprovalsForBuild(id);
  });

  app.post(
    '/api/builds/:buildId/approvals/:approvalId/decide',
    async (req, reply) => {
      const { buildId, approvalId } = req.params as {
        buildId: string;
        approvalId: string;
      };
      const parsed = decideSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const approval = getApproval(approvalId);
      if (!approval) return reply.code(404).send({ error: 'approval not found' });
      if (approval.buildId !== buildId) {
        return reply.code(400).send({ error: 'approval does not belong to build' });
      }
      if (approval.decision) {
        return reply
          .code(409)
          .send({ error: `approval already ${approval.decision}` });
      }

      // Cluster A (auth) integration point: when a session-aware request
      // hook attaches `req.user` we read it; otherwise we fall back to the
      // body-supplied actor or 'anonymous'. Multi-approver flows rely on
      // distinct actor ids — if you bypass auth in dev you should pass
      // different `actor` values per request.
      const reqUser = (req as unknown as { user?: { id?: string; role?: string } }).user;
      const actor = reqUser?.id ?? parsed.data.actor ?? 'anonymous';
      const role = reqUser?.role ?? null;

      // Soft role check — if requiredRoles is set but auth isn't enforced
      // yet, log the mismatch but still record the decision so the flow
      // works pre-auth. We write to both the server logger (so ops sees it
      // in stdout) AND the build's own log so the audit trail on
      // BuildDetailPage records who decided out-of-role.
      if (
        approval.requiredRoles.length > 0 &&
        role &&
        !approval.requiredRoles.includes(role)
      ) {
        logger.warn(
          {
            approvalId,
            actor,
            role,
            requiredRoles: approval.requiredRoles,
          },
          'approval decision recorded despite role mismatch (soft enforcement)',
        );
        const note = appendBuildLogEntry({
          buildId,
          ts: Date.now(),
          level: 'info',
          nodeId: approval.nodeId,
          stepType: 'manualApproval',
          message:
            `▸ soft role mismatch: ${actor} (role=${role}) decided ` +
            `"${parsed.data.decision}" — required roles were ` +
            `[${approval.requiredRoles.join(', ')}] (decision allowed until SSO is enforced)`,
        });
        eventBus.publish({ type: 'buildLogEntry', buildId, entry: note });
      }

      const updated = recordApproverDecision(
        approvalId,
        actor,
        parsed.data.decision,
        parsed.data.inputValues ?? null,
      );
      if (!updated) return reply.code(500).send({ error: 'failed to record decision' });

      // Settled? Wake the parked runner and publish.
      if (updated.decision) {
        resolveApproval(approvalId, updated.decision);
        eventBus.publish({
          type: 'buildApprovalDecided',
          buildId,
          approvalId,
          decision: updated.decision,
        });
      }
      return updated;
    },
  );
}
