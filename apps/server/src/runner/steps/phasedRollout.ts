import type { PhasedRolloutStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { ascErrorMessage, ascRequest, type AscCredentials } from './_asc';

// Configures App Store phased release for an appStoreVersion. ASC exposes
// this as a child resource: GET/POST/PATCH /v1/appStoreVersionPhasedReleases
// linked by relationship to the version. We support `start`, `pause`, and
// `complete` actions that map to phasedReleaseState transitions
// (INACTIVE → ACTIVE → PAUSED → COMPLETE).
const VALID_ACTIONS = new Set(['start', 'pause', 'resume', 'complete']);

const STATE_BY_ACTION: Record<string, string> = {
  start: 'ACTIVE',
  pause: 'PAUSED',
  resume: 'ACTIVE',
  complete: 'COMPLETE',
};

export async function runPhasedRollout(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<PhasedRolloutStepData>;
  const action = d.action ?? 'start';
  if (!VALID_ACTIONS.has(action)) {
    throw new Error(`phasedRollout: invalid action "${action}"`);
  }
  if (!d.keyId || !d.issuerId) {
    throw new Error('phasedRollout: keyId + issuerId required');
  }
  if (!d.appStoreVersionId || d.appStoreVersionId.trim().length === 0) {
    throw new Error('phasedRollout: missing "appStoreVersionId"');
  }
  const creds: AscCredentials = {
    keyId: d.keyId,
    issuerId: d.issuerId,
    privateKeyPath: d.apiKeyPath,
    privateKeyPem: d.apiKeyContents,
  };

  // Look up the existing phasedRelease for this version, if any.
  const lookupRes = await ascRequest({
    creds,
    path: `/v1/appStoreVersions/${encodeURIComponent(d.appStoreVersionId)}/appStoreVersionPhasedRelease`,
  });
  const existing =
    lookupRes.ok && lookupRes.data
      ? (lookupRes.data as { data?: { id?: string } | null }).data?.id
      : undefined;

  const targetState = STATE_BY_ACTION[action];
  if (!existing) {
    if (action !== 'start') {
      throw new Error(
        `phasedRollout: action="${action}" but no phased release exists for version ${d.appStoreVersionId}. Use action="start" first.`,
      );
    }
    const createRes = await ascRequest({
      creds,
      method: 'POST',
      path: '/v1/appStoreVersionPhasedReleases',
      body: {
        data: {
          type: 'appStoreVersionPhasedReleases',
          attributes: { phasedReleaseState: targetState },
          relationships: {
            appStoreVersion: { data: { type: 'appStoreVersions', id: d.appStoreVersionId } },
          },
        },
      },
    });
    if (!createRes.ok) {
      throw new Error(`phasedRollout: create failed: ${ascErrorMessage(createRes)}`);
    }
    ctx.log(`asc created phasedRelease (state=${targetState})`, 'success');
    return;
  }

  const patchRes = await ascRequest({
    creds,
    method: 'PATCH',
    path: `/v1/appStoreVersionPhasedReleases/${encodeURIComponent(existing)}`,
    body: {
      data: {
        type: 'appStoreVersionPhasedReleases',
        id: existing,
        attributes: { phasedReleaseState: targetState },
      },
    },
  });
  if (!patchRes.ok) {
    throw new Error(`phasedRollout: PATCH failed: ${ascErrorMessage(patchRes)}`);
  }
  ctx.log(`asc updated phasedRelease ${existing} → ${targetState}`, 'success');
}
