import type { DistributionGroupsStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { ascErrorMessage, ascRequest, type AscCredentials } from './_asc';

// Manage TestFlight beta-group membership in bulk. The "App Center pattern"
// — instead of inviting individuals one at a time, you maintain canonical
// group → email-list mappings and run this step on schedule (or on commit
// to your tester roster file) to reconcile state.
//
// Sub-action `reconcile`:
//   - Read the desired list of testers per group from a multiline mapping.
//   - For each group, fetch current testers, diff vs desired.
//   - Add new testers (POST /v1/betaTesters with relationship to group)
//   - Optionally remove testers no longer in the desired list
//     (DELETE /v1/betaGroups/{id}/relationships/betaTesters)
//   - Re-add testers that were already invited but aren't in the group
//     (PATCH/POST relationship)
//
// The `dryRun=true` mode is a no-op except for logs. Useful for running on
// PR builds before merging tester roster changes.
type Action = 'reconcile' | 'list' | 'inviteEmail';

export interface GroupSpec {
  name: string;
  emails: string[];
}

export function parseGroupSpec(input: string): GroupSpec[] {
  const out: GroupSpec[] = [];
  let current: GroupSpec | null = null;
  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      if (current) out.push(current);
      current = { name: line.slice(1, -1).trim(), emails: [] };
      continue;
    }
    if (!current) {
      throw new Error(`distributionGroups: tester "${line}" appears before any [GroupName] header`);
    }
    current.emails.push(line);
  }
  if (current) out.push(current);
  return out;
}

async function findAppId(creds: AscCredentials, bundleId: string): Promise<string> {
  const res = await ascRequest({
    creds,
    path: '/v1/apps',
    query: { 'filter[bundleId]': bundleId, limit: 1 },
  });
  if (!res.ok) throw new Error(`distributionGroups app lookup: ${ascErrorMessage(res)}`);
  const apps = (res.data as { data?: Array<{ id: string }> } | undefined)?.data ?? [];
  const first = apps[0];
  if (!first) throw new Error(`no app found for bundleId=${bundleId}`);
  return first.id;
}

export async function runDistributionGroups(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<DistributionGroupsStepData>;
  const action = (d.action ?? 'list') as Action;
  if (!d.keyId || !d.issuerId) {
    throw new Error('distributionGroups: keyId + issuerId required');
  }
  if (!d.appBundleId) {
    throw new Error('distributionGroups: missing "appBundleId"');
  }
  const creds: AscCredentials = {
    keyId: d.keyId,
    issuerId: d.issuerId,
    privateKeyPath: d.apiKeyPath,
    privateKeyPem: d.apiKeyContents,
  };
  const appId = await findAppId(creds, d.appBundleId);
  const dryRun = d.dryRun === 'true';

  if (action === 'list') {
    const res = await ascRequest({
      creds,
      path: '/v1/betaGroups',
      query: { 'filter[app]': appId, limit: 100 },
    });
    if (!res.ok) throw new Error(`distributionGroups list: ${ascErrorMessage(res)}`);
    const groups =
      (res.data as { data?: Array<{ attributes?: { name?: string }; id?: string }> } | undefined)?.data ?? [];
    ctx.log(`${groups.length} BetaGroups on ${d.appBundleId}:`);
    for (const g of groups) {
      ctx.log(`  ${g.attributes?.name ?? '?'} (id=${g.id})`);
    }
    return;
  }

  if (!d.spec || d.spec.trim().length === 0) {
    throw new Error('distributionGroups: missing "spec" (multiline group + tester list)');
  }
  const desired = parseGroupSpec(d.spec);
  ctx.log(`${desired.length} desired group(s); dryRun=${dryRun}`);

  for (const g of desired) {
    const grpRes = await ascRequest({
      creds,
      path: '/v1/betaGroups',
      query: { 'filter[app]': appId, 'filter[name]': g.name, limit: 1 },
    });
    if (!grpRes.ok) throw new Error(`distributionGroups group lookup ${g.name}: ${ascErrorMessage(grpRes)}`);
    let groupId = (grpRes.data as { data?: Array<{ id: string }> } | undefined)?.data?.[0]?.id;
    if (!groupId) {
      if (!dryRun) {
        const createRes = await ascRequest({
          creds,
          method: 'POST',
          path: '/v1/betaGroups',
          body: {
            data: {
              type: 'betaGroups',
              attributes: { name: g.name },
              relationships: { app: { data: { type: 'apps', id: appId } } },
            },
          },
        });
        if (!createRes.ok) throw new Error(`distributionGroups create ${g.name}: ${ascErrorMessage(createRes)}`);
        groupId = (createRes.data as { data?: { id?: string } } | undefined)?.data?.id;
      }
      ctx.log(`+ group ${g.name}${dryRun ? ' (dry-run)' : ''}`, 'success');
    }
    if (!groupId) continue; // dry-run case — can't enumerate further

    // Fetch current testers
    const currentRes = await ascRequest({
      creds,
      path: `/v1/betaGroups/${encodeURIComponent(groupId)}/betaTesters`,
      query: { limit: 200 },
    });
    if (!currentRes.ok) throw new Error(`distributionGroups list testers ${g.name}: ${ascErrorMessage(currentRes)}`);
    const current =
      (currentRes.data as { data?: Array<{ id: string; attributes?: { email?: string } }> } | undefined)?.data ?? [];
    const currentByEmail = new Map(
      current
        .filter((t) => typeof t.attributes?.email === 'string')
        .map((t) => [t.attributes!.email!.toLowerCase(), t.id]),
    );

    const toAdd = g.emails.filter((e) => !currentByEmail.has(e.toLowerCase()));
    const toRemove = d.removeStrangers === 'true'
      ? [...currentByEmail.entries()].filter(([email]) => !g.emails.some((e) => e.toLowerCase() === email))
      : [];

    for (const email of toAdd) {
      ctx.log(`+ ${email} → ${g.name}${dryRun ? ' (dry-run)' : ''}`);
      if (dryRun) continue;
      const inviteRes = await ascRequest({
        creds,
        method: 'POST',
        path: '/v1/betaTesters',
        body: {
          data: {
            type: 'betaTesters',
            attributes: { email },
            relationships: {
              apps: { data: [{ type: 'apps', id: appId }] },
              betaGroups: { data: [{ type: 'betaGroups', id: groupId }] },
            },
          },
        },
      });
      if (!inviteRes.ok && inviteRes.status !== 409) {
        throw new Error(`distributionGroups invite ${email}: ${ascErrorMessage(inviteRes)}`);
      }
    }
    for (const [email, testerId] of toRemove) {
      ctx.log(`- ${email} ← ${g.name}${dryRun ? ' (dry-run)' : ''}`);
      if (dryRun) continue;
      const delRes = await ascRequest({
        creds,
        method: 'DELETE',
        path: `/v1/betaGroups/${encodeURIComponent(groupId)}/relationships/betaTesters`,
        body: { data: [{ type: 'betaTesters', id: testerId }] },
      });
      if (!delRes.ok) {
        throw new Error(`distributionGroups remove ${email}: ${ascErrorMessage(delRes)}`);
      }
    }
    ctx.log(`reconciled ${g.name}: +${toAdd.length} / -${toRemove.length}`, 'success');
  }
}
