import type { TestflightSetWhatToTestStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { ascErrorMessage, ascRequest, type AscCredentials } from './_asc';

// Sets the "What to Test" notes on a TestFlight build via the ASC API.
//
// Flow:
//   1. Resolve the build id (input as buildId OR look it up by app bundle id +
//      build number + version).
//   2. Find or create a betaBuildLocalization for the requested locale.
//   3. PATCH (or POST) with the whatsNew text.
//
// This is the deferred "testflightUpload whatToTest" feature from Phase 2.5
// Cluster A — split out as its own step so the upload step doesn't need to
// poll for build processing completion before the localization request.
export async function findBuildId(
  creds: AscCredentials,
  appBundleId: string,
  version: string,
  buildNumber: string,
): Promise<string> {
  // Step 1a: resolve appId from bundle id.
  const appsRes = await ascRequest({
    creds,
    path: '/v1/apps',
    query: { 'filter[bundleId]': appBundleId, limit: 1 },
  });
  if (!appsRes.ok) {
    throw new Error(`testflightSetWhatToTest: app lookup failed: ${ascErrorMessage(appsRes)}`);
  }
  const apps = (appsRes.data as { data?: Array<{ id: string }> } | undefined)?.data ?? [];
  const firstApp = apps[0];
  if (!firstApp) {
    throw new Error(`testflightSetWhatToTest: no app found for bundleId=${appBundleId}`);
  }
  const appId = firstApp.id;
  // Step 1b: find the build by version + buildNumber. ASC names the
  // user-visible "build number" as "version" in the API and the marketing
  // version is on the related preReleaseVersion → just filter both.
  const buildsRes = await ascRequest({
    creds,
    path: '/v1/builds',
    query: {
      'filter[app]': appId,
      'filter[version]': buildNumber,
      'filter[preReleaseVersion.version]': version,
      limit: 1,
    },
  });
  if (!buildsRes.ok) {
    throw new Error(`testflightSetWhatToTest: build lookup failed: ${ascErrorMessage(buildsRes)}`);
  }
  const builds = (buildsRes.data as { data?: Array<{ id: string }> } | undefined)?.data ?? [];
  const firstBuild = builds[0];
  if (!firstBuild) {
    throw new Error(
      `testflightSetWhatToTest: no build found for ${appBundleId} ${version}(${buildNumber}) — ` +
        'still processing? Try re-running the step in a few minutes.',
    );
  }
  return firstBuild.id;
}

export async function findOrCreateLocalization(
  creds: AscCredentials,
  buildId: string,
  locale: string,
  whatsNew: string,
): Promise<{ id: string; created: boolean }> {
  const listRes = await ascRequest({
    creds,
    path: `/v1/builds/${encodeURIComponent(buildId)}/betaBuildLocalizations`,
    query: { 'filter[locale]': locale, limit: 1 },
  });
  if (!listRes.ok) {
    throw new Error(`testflightSetWhatToTest: localization list failed: ${ascErrorMessage(listRes)}`);
  }
  const existing =
    (listRes.data as { data?: Array<{ id: string }> } | undefined)?.data?.[0]?.id;
  if (existing) {
    const patchRes = await ascRequest({
      creds,
      method: 'PATCH',
      path: `/v1/betaBuildLocalizations/${encodeURIComponent(existing)}`,
      body: {
        data: {
          type: 'betaBuildLocalizations',
          id: existing,
          attributes: { whatsNew },
        },
      },
    });
    if (!patchRes.ok) {
      throw new Error(`testflightSetWhatToTest: PATCH failed: ${ascErrorMessage(patchRes)}`);
    }
    return { id: existing, created: false };
  }
  const createRes = await ascRequest({
    creds,
    method: 'POST',
    path: '/v1/betaBuildLocalizations',
    body: {
      data: {
        type: 'betaBuildLocalizations',
        attributes: { locale, whatsNew },
        relationships: {
          build: { data: { type: 'builds', id: buildId } },
        },
      },
    },
  });
  if (!createRes.ok) {
    throw new Error(`testflightSetWhatToTest: POST failed: ${ascErrorMessage(createRes)}`);
  }
  const newId = (createRes.data as { data?: { id?: string } } | undefined)?.data?.id;
  if (!newId) {
    throw new Error('testflightSetWhatToTest: ASC did not return new localization id');
  }
  return { id: newId, created: true };
}

export async function runTestflightSetWhatToTest(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<TestflightSetWhatToTestStepData>;
  if (!d.keyId || !d.issuerId) {
    throw new Error('testflightSetWhatToTest: keyId + issuerId required');
  }
  if (!d.whatsNew || d.whatsNew.trim().length === 0) {
    throw new Error('testflightSetWhatToTest: missing "whatsNew"');
  }
  const creds: AscCredentials = {
    keyId: d.keyId,
    issuerId: d.issuerId,
    privateKeyPath: d.apiKeyPath,
    privateKeyPem: d.apiKeyContents,
  };
  const locale = d.locale ?? 'en-US';
  let buildId = d.buildId?.trim();
  if (!buildId || buildId.length === 0) {
    if (!d.appBundleId || !d.version || !d.buildNumber) {
      throw new Error(
        'testflightSetWhatToTest: provide either buildId OR (appBundleId + version + buildNumber)',
      );
    }
    ctx.log(`asc lookup: ${d.appBundleId} ${d.version}(${d.buildNumber})`);
    buildId = await findBuildId(creds, d.appBundleId, d.version, d.buildNumber);
    ctx.log(`asc resolved buildId=${buildId}`);
  }
  const result = await findOrCreateLocalization(creds, buildId, locale, d.whatsNew);
  ctx.log(
    `asc ${result.created ? 'created' : 'updated'} betaBuildLocalization ${result.id} (${locale})`,
    'success',
  );
}
