import type { TestflightManageStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { ascErrorMessage, ascRequest, type AscCredentials } from './_asc';

// Tester / group / changelog management on TestFlight via ASC API.
// Sub-actions:
//   - inviteTester       POST /v1/betaTesters
//   - removeTester       DELETE /v1/betaTesters/{id}
//   - addToGroup         POST /v1/betaGroups/{groupId}/relationships/betaTesters
//   - removeFromGroup    DELETE /v1/betaGroups/{groupId}/relationships/betaTesters
//   - listTesters        GET /v1/betaTesters?filter[apps]=…
//   - setBuildChangelog  PATCH /v1/betaBuildLocalizations (alias for whatsNew)
//
// The runner picks the action from `action` and validates the required fields
// for that action — invalid combinations throw with a specific message.

type Action = NonNullable<TestflightManageStepData['action']>;

interface BaseInputs {
  creds: AscCredentials;
  d: Partial<TestflightManageStepData>;
}

async function findAppId(creds: AscCredentials, bundleId: string): Promise<string> {
  const res = await ascRequest({
    creds,
    path: '/v1/apps',
    query: { 'filter[bundleId]': bundleId, limit: 1 },
  });
  if (!res.ok) throw new Error(`asc app lookup: ${ascErrorMessage(res)}`);
  const apps = (res.data as { data?: Array<{ id: string }> } | undefined)?.data ?? [];
  const first = apps[0];
  if (!first) throw new Error(`no app found for bundleId=${bundleId}`);
  return first.id;
}

async function findGroupId(
  creds: AscCredentials,
  appId: string,
  groupName: string,
): Promise<string> {
  const res = await ascRequest({
    creds,
    path: '/v1/betaGroups',
    query: { 'filter[app]': appId, 'filter[name]': groupName, limit: 1 },
  });
  if (!res.ok) throw new Error(`asc group lookup: ${ascErrorMessage(res)}`);
  const groups = (res.data as { data?: Array<{ id: string }> } | undefined)?.data ?? [];
  const first = groups[0];
  if (!first) throw new Error(`no betaGroup "${groupName}" on app ${appId}`);
  return first.id;
}

async function findTesterId(creds: AscCredentials, email: string): Promise<string | undefined> {
  const res = await ascRequest({
    creds,
    path: '/v1/betaTesters',
    query: { 'filter[email]': email, limit: 1 },
  });
  if (!res.ok) throw new Error(`asc tester lookup: ${ascErrorMessage(res)}`);
  const testers = (res.data as { data?: Array<{ id: string }> } | undefined)?.data ?? [];
  return testers[0]?.id;
}

async function inviteTester(ctx: StepContext, { creds, d }: BaseInputs): Promise<void> {
  if (!d.testerEmail) throw new Error('testflightManage: inviteTester needs testerEmail');
  if (!d.appBundleId) throw new Error('testflightManage: inviteTester needs appBundleId');
  const appId = await findAppId(creds, d.appBundleId);
  const groupRel = d.groupName
    ? { betaGroups: { data: [{ type: 'betaGroups', id: await findGroupId(creds, appId, d.groupName) }] } }
    : undefined;
  const res = await ascRequest({
    creds,
    method: 'POST',
    path: '/v1/betaTesters',
    body: {
      data: {
        type: 'betaTesters',
        attributes: {
          email: d.testerEmail,
          firstName: d.testerFirstName ?? '',
          lastName: d.testerLastName ?? '',
        },
        relationships: {
          apps: { data: [{ type: 'apps', id: appId }] },
          ...(groupRel ?? {}),
        },
      },
    },
  });
  if (!res.ok) throw new Error(`testflightManage inviteTester: ${ascErrorMessage(res)}`);
  ctx.log(`invited ${d.testerEmail} to ${d.appBundleId}`, 'success');
}

async function removeTester(ctx: StepContext, { creds, d }: BaseInputs): Promise<void> {
  if (!d.testerEmail) throw new Error('testflightManage: removeTester needs testerEmail');
  const testerId = await findTesterId(creds, d.testerEmail);
  if (!testerId) {
    ctx.log(`no tester ${d.testerEmail} found — nothing to remove`, 'info');
    return;
  }
  const res = await ascRequest({
    creds,
    method: 'DELETE',
    path: `/v1/betaTesters/${encodeURIComponent(testerId)}`,
  });
  if (!res.ok) throw new Error(`testflightManage removeTester: ${ascErrorMessage(res)}`);
  ctx.log(`removed tester ${d.testerEmail}`, 'success');
}

async function listTesters(ctx: StepContext, { creds, d }: BaseInputs): Promise<void> {
  if (!d.appBundleId) throw new Error('testflightManage: listTesters needs appBundleId');
  const appId = await findAppId(creds, d.appBundleId);
  const res = await ascRequest({
    creds,
    path: '/v1/betaTesters',
    query: { 'filter[apps]': appId, limit: 100 },
  });
  if (!res.ok) throw new Error(`testflightManage listTesters: ${ascErrorMessage(res)}`);
  const testers =
    (res.data as { data?: Array<{ attributes?: { email?: string; inviteType?: string } }> } | undefined)
      ?.data ?? [];
  ctx.log(`${testers.length} testers:`);
  for (const t of testers) {
    ctx.log(`  ${t.attributes?.email ?? '?'} (${t.attributes?.inviteType ?? '?'})`);
  }
}

async function addToGroup(ctx: StepContext, { creds, d }: BaseInputs): Promise<void> {
  if (!d.testerEmail) throw new Error('testflightManage: addToGroup needs testerEmail');
  if (!d.appBundleId || !d.groupName) {
    throw new Error('testflightManage: addToGroup needs appBundleId + groupName');
  }
  const appId = await findAppId(creds, d.appBundleId);
  const groupId = await findGroupId(creds, appId, d.groupName);
  const testerId = await findTesterId(creds, d.testerEmail);
  if (!testerId) throw new Error(`tester ${d.testerEmail} not found`);
  const res = await ascRequest({
    creds,
    method: 'POST',
    path: `/v1/betaGroups/${encodeURIComponent(groupId)}/relationships/betaTesters`,
    body: { data: [{ type: 'betaTesters', id: testerId }] },
  });
  if (!res.ok) throw new Error(`testflightManage addToGroup: ${ascErrorMessage(res)}`);
  ctx.log(`added ${d.testerEmail} to group ${d.groupName}`, 'success');
}

async function removeFromGroup(ctx: StepContext, { creds, d }: BaseInputs): Promise<void> {
  if (!d.testerEmail) throw new Error('testflightManage: removeFromGroup needs testerEmail');
  if (!d.appBundleId || !d.groupName) {
    throw new Error('testflightManage: removeFromGroup needs appBundleId + groupName');
  }
  const appId = await findAppId(creds, d.appBundleId);
  const groupId = await findGroupId(creds, appId, d.groupName);
  const testerId = await findTesterId(creds, d.testerEmail);
  if (!testerId) {
    ctx.log(`no tester ${d.testerEmail} found — nothing to remove from group`, 'info');
    return;
  }
  const res = await ascRequest({
    creds,
    method: 'DELETE',
    path: `/v1/betaGroups/${encodeURIComponent(groupId)}/relationships/betaTesters`,
    body: { data: [{ type: 'betaTesters', id: testerId }] },
  });
  if (!res.ok) throw new Error(`testflightManage removeFromGroup: ${ascErrorMessage(res)}`);
  ctx.log(`removed ${d.testerEmail} from group ${d.groupName}`, 'success');
}

const ACTIONS: Record<Action, (ctx: StepContext, base: BaseInputs) => Promise<void>> = {
  inviteTester,
  removeTester,
  listTesters,
  addToGroup,
  removeFromGroup,
};

export function listSupportedActions(): readonly Action[] {
  return Object.keys(ACTIONS) as Action[];
}

export async function runTestflightManage(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<TestflightManageStepData>;
  if (!d.keyId || !d.issuerId) {
    throw new Error('testflightManage: keyId + issuerId required');
  }
  const action = (d.action ?? 'listTesters') as Action;
  const handler = ACTIONS[action];
  if (!handler) throw new Error(`testflightManage: unknown action "${action}"`);
  const creds: AscCredentials = {
    keyId: d.keyId,
    issuerId: d.issuerId,
    privateKeyPath: d.apiKeyPath,
    privateKeyPem: d.apiKeyContents,
  };
  ctx.log(`asc testflightManage.${action}`);
  await handler(ctx, { creds, d });
}
