import type { AppStoreCreateStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { ascErrorMessage, ascRequest, type AscCredentials } from './_asc';

// Bootstrap a new app on App Store Connect via ASC API.
// Replaces `fastlane produce` in non-interactive contexts. POST /v1/apps with
// the bundle id + name + sku + primary locale; ASC returns the app id which
// we stash in the build log for downstream steps.
//
// NOTE: ASC also requires registering the app id on the Developer Portal
// before this call succeeds. That's a separate flow (POST /v1/bundleIds).
export async function runAppStoreCreate(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<AppStoreCreateStepData>;
  if (!d.keyId || !d.issuerId) {
    throw new Error('appStoreCreate: keyId + issuerId required');
  }
  if (!d.bundleId || !d.name || !d.sku || !d.primaryLocale) {
    throw new Error('appStoreCreate: bundleId + name + sku + primaryLocale required');
  }
  const creds: AscCredentials = {
    keyId: d.keyId,
    issuerId: d.issuerId,
    privateKeyPath: d.apiKeyPath,
    privateKeyPem: d.apiKeyContents,
  };

  // Step 1: ensure the bundle id is registered on the Developer Portal.
  // GET /v1/bundleIds?filter[identifier]=… returns 0 or 1 matches.
  const bidRes = await ascRequest({
    creds,
    path: '/v1/bundleIds',
    query: { 'filter[identifier]': d.bundleId, limit: 1 },
  });
  if (!bidRes.ok) throw new Error(`appStoreCreate bundleId lookup: ${ascErrorMessage(bidRes)}`);
  const existingBid =
    (bidRes.data as { data?: Array<{ id: string }> } | undefined)?.data?.[0]?.id;
  let bundleIdRecordId = existingBid;
  if (!bundleIdRecordId) {
    if (d.registerBundleId !== 'true') {
      throw new Error(
        `appStoreCreate: bundleId "${d.bundleId}" is not registered on the Developer Portal. ` +
          'Set registerBundleId="true" to register it now.',
      );
    }
    const regRes = await ascRequest({
      creds,
      method: 'POST',
      path: '/v1/bundleIds',
      body: {
        data: {
          type: 'bundleIds',
          attributes: {
            identifier: d.bundleId,
            name: d.name,
            platform: d.platform ?? 'IOS',
          },
        },
      },
    });
    if (!regRes.ok) throw new Error(`appStoreCreate bundleId register: ${ascErrorMessage(regRes)}`);
    bundleIdRecordId = (regRes.data as { data?: { id?: string } } | undefined)?.data?.id;
    ctx.log(`registered bundleId ${d.bundleId}`);
  }

  // Step 2: POST /v1/apps. Some ASC accounts also require the bundleId
  // record id on the relationships side; pass it when we have it.
  const platforms = (d.platforms ?? d.platform ?? 'IOS').split(',').map((p) => p.trim()).filter(Boolean);
  const body: Record<string, unknown> = {
    data: {
      type: 'apps',
      attributes: {
        bundleId: d.bundleId,
        name: d.name,
        sku: d.sku,
        primaryLocale: d.primaryLocale,
      },
    },
  };
  // Whether bundleId is sent as an attribute or a relationship varies between
  // ASC account configs — most modern accounts accept the attribute form.
  ctx.log(`asc POST /v1/apps ${d.bundleId} (${platforms.join(',')})`);
  const res = await ascRequest({ creds, method: 'POST', path: '/v1/apps', body });
  if (!res.ok) throw new Error(`appStoreCreate POST /v1/apps: ${ascErrorMessage(res)}`);
  const appId = (res.data as { data?: { id?: string } } | undefined)?.data?.id;
  ctx.log(`asc created app ${appId} bundleId=${d.bundleId} bundleIdRecord=${bundleIdRecordId ?? 'n/a'}`, 'success');
}
