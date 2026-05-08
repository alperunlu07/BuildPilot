import type { TestflightPublicLinkStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { ascErrorMessage, ascRequest, type AscCredentials } from './_asc';

// Generates / fetches the public TestFlight beta link for a build.
//
// The public link is a property of the BetaGroup, not the build directly. The
// flow:
//   1. Find the app by bundleId.
//   2. Find an existing public-enabled BetaGroup (or create one with
//      `publicLinkEnabled=true`).
//   3. Add the build to that group.
//   4. Read `publicLink` off the group.
//
// We expose the link via the build log so downstream notify steps
// (slackNotify / telegramNotify) can include it.
export async function runTestflightPublicLink(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<TestflightPublicLinkStepData>;
  if (!d.keyId || !d.issuerId) {
    throw new Error('testflightPublicLink: keyId + issuerId required');
  }
  if (!d.appBundleId) {
    throw new Error('testflightPublicLink: missing "appBundleId"');
  }
  const creds: AscCredentials = {
    keyId: d.keyId,
    issuerId: d.issuerId,
    privateKeyPath: d.apiKeyPath,
    privateKeyPem: d.apiKeyContents,
  };

  // Resolve appId
  const appsRes = await ascRequest({
    creds,
    path: '/v1/apps',
    query: { 'filter[bundleId]': d.appBundleId, limit: 1 },
  });
  if (!appsRes.ok) {
    throw new Error(`testflightPublicLink: app lookup failed: ${ascErrorMessage(appsRes)}`);
  }
  const apps = (appsRes.data as { data?: Array<{ id: string }> } | undefined)?.data ?? [];
  const firstApp = apps[0];
  if (!firstApp) {
    throw new Error(`testflightPublicLink: no app found for bundleId=${d.appBundleId}`);
  }
  const appId = firstApp.id;

  // Find or create a public-enabled BetaGroup
  const groupName = d.groupName ?? 'Public';
  const groupsRes = await ascRequest({
    creds,
    path: '/v1/betaGroups',
    query: {
      'filter[app]': appId,
      'filter[name]': groupName,
      limit: 1,
    },
  });
  if (!groupsRes.ok) {
    throw new Error(`testflightPublicLink: group lookup failed: ${ascErrorMessage(groupsRes)}`);
  }
  let groupId =
    (groupsRes.data as {
      data?: Array<{ id: string; attributes?: { publicLinkEnabled?: boolean; publicLink?: string } }>;
    } | undefined)?.data?.[0]?.id;

  if (!groupId) {
    const createRes = await ascRequest({
      creds,
      method: 'POST',
      path: '/v1/betaGroups',
      body: {
        data: {
          type: 'betaGroups',
          attributes: { name: groupName, publicLinkEnabled: true },
          relationships: { app: { data: { type: 'apps', id: appId } } },
        },
      },
    });
    if (!createRes.ok) {
      throw new Error(`testflightPublicLink: group create failed: ${ascErrorMessage(createRes)}`);
    }
    groupId = (createRes.data as { data?: { id?: string } } | undefined)?.data?.id;
    if (!groupId) {
      throw new Error('testflightPublicLink: ASC did not return new group id');
    }
    ctx.log(`asc created BetaGroup ${groupId} "${groupName}"`);
  }

  // Optionally attach the build to the group
  if (d.buildId && d.buildId.trim().length > 0) {
    const attachRes = await ascRequest({
      creds,
      method: 'POST',
      path: `/v1/betaGroups/${encodeURIComponent(groupId)}/relationships/builds`,
      body: { data: [{ type: 'builds', id: d.buildId }] },
    });
    // 422 Conflict when already attached is fine.
    if (!attachRes.ok && attachRes.status !== 422 && attachRes.status !== 409) {
      throw new Error(`testflightPublicLink: build attach failed: ${ascErrorMessage(attachRes)}`);
    }
    ctx.log(`asc build ${d.buildId} attached to group ${groupId}`);
  }

  // Read the public link
  const fetchRes = await ascRequest({
    creds,
    path: `/v1/betaGroups/${encodeURIComponent(groupId)}`,
  });
  if (!fetchRes.ok) {
    throw new Error(`testflightPublicLink: group fetch failed: ${ascErrorMessage(fetchRes)}`);
  }
  const link = (fetchRes.data as {
    data?: { attributes?: { publicLink?: string; publicLinkEnabled?: boolean } };
  } | undefined)?.data?.attributes?.publicLink;
  if (!link) {
    throw new Error('testflightPublicLink: group has no publicLink — is it public-enabled?');
  }
  ctx.log(`testflight public link: ${link}`, 'success');
}
