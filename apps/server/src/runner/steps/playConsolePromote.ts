import type { PlayConsolePromoteStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import {
  getPlayAccessToken,
  loadServiceAccountKey,
  parseReleaseNotes,
  playErrorMessage,
  playRequest,
} from './_play';

const VALID_TRACKS = new Set(['internal', 'alpha', 'beta', 'production']);
const VALID_STATUSES = new Set(['completed', 'inProgress', 'halted', 'draft']);

interface ResolvedPromoteInputs {
  packageName: string;
  versionCode: number;
  track: string;
  status: string;
  userFraction?: number;
  releaseName?: string;
  releaseNotes: Array<{ language: string; text: string }>;
}

// Pure validator + normaliser, mirroring resolvePlayInputs so both Play steps
// reject bad config the same way before any network call.
export function resolvePromoteInputs(
  d: Partial<PlayConsolePromoteStepData>,
): ResolvedPromoteInputs {
  if (!d.packageName || d.packageName.trim().length === 0) {
    throw new Error('playConsolePromote: missing "packageName"');
  }
  // The form hands numbers back as strings, so coerce before validating.
  const rawVersion = typeof d.versionCode === 'string' ? Number(d.versionCode) : d.versionCode;
  if (
    rawVersion === undefined ||
    rawVersion === null ||
    !Number.isInteger(rawVersion) ||
    rawVersion <= 0
  ) {
    throw new Error('playConsolePromote: "versionCode" must be a positive integer');
  }
  // No default track: unlike an upload, promoting picks the audience, and a
  // silent 'internal' would look like a no-op while a silent 'production'
  // would be a disaster.
  if (!d.track || d.track.trim().length === 0) {
    throw new Error('playConsolePromote: missing "track"');
  }
  const track = d.track.trim().toLowerCase();
  if (!VALID_TRACKS.has(track)) {
    throw new Error(`playConsolePromote: invalid track "${track}"`);
  }
  const status = d.status && d.status.trim().length > 0 ? d.status.trim() : 'completed';
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`playConsolePromote: invalid status "${status}"`);
  }
  if (status === 'inProgress') {
    if (
      d.userFraction === undefined ||
      d.userFraction === null ||
      d.userFraction <= 0 ||
      d.userFraction > 1
    ) {
      throw new Error('playConsolePromote: status=inProgress requires userFraction in (0, 1]');
    }
  }
  const releaseName = d.releaseName && d.releaseName.trim().length > 0 ? d.releaseName.trim() : undefined;
  return {
    packageName: d.packageName.trim(),
    versionCode: rawVersion,
    track,
    status,
    userFraction: status === 'inProgress' ? d.userFraction : undefined,
    releaseName,
    releaseNotes: parseReleaseNotes(d.releaseNotes),
  };
}

// Confirm the version code exists before writing the track. tracks.update
// accepts an unknown code and only fails at :commit with a message that does
// not name the code, so checking first turns a confusing late failure into a
// clear early one — and costs a single GET.
async function assertVersionCodeExists(opts: {
  accessToken: string;
  packageName: string;
  editId: string;
  versionCode: number;
}): Promise<void> {
  const known: number[] = [];
  for (const kind of ['bundles', 'apks'] as const) {
    const res = await playRequest({
      accessToken: opts.accessToken,
      path: `/androidpublisher/v3/applications/${encodeURIComponent(opts.packageName)}/edits/${encodeURIComponent(opts.editId)}/${kind}`,
    });
    // A brand-new app has no bundles yet; treat a failed listing as "nothing
    // of this kind" rather than aborting the promote.
    if (!res.ok) continue;
    const list = (res.data as Record<string, Array<{ versionCode?: number }>> | undefined)?.[kind];
    for (const item of list ?? []) {
      if (typeof item.versionCode === 'number') known.push(item.versionCode);
    }
  }
  if (known.includes(opts.versionCode)) return;
  const sorted = [...new Set(known)].sort((a, b) => a - b);
  throw new Error(
    `playConsolePromote: version code ${opts.versionCode} does not exist in ${opts.packageName}. ` +
      `Known version codes: ${sorted.length > 0 ? sorted.join(', ') : '(none)'}`,
  );
}

// The Edits flow minus the upload:
//   1. POST /androidpublisher/v3/applications/{pkg}/edits   → editId
//   2. GET  /edits/{id}/(bundles|apks)                      → verify versionCode
//   3. PUT  /edits/{id}/tracks/{track}                      → set the release
//   4. POST /edits/{id}:commit                              → publish
//
// Step 3 replaces the track's release list outright, which is what makes a
// promote supersede whatever the track was serving before.
export async function runPlayConsolePromote(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<PlayConsolePromoteStepData>;
  const inputs = resolvePromoteInputs(d);
  ctx.log(
    `play: promoting versionCode ${inputs.versionCode} → ${inputs.packageName} (track=${inputs.track}, status=${inputs.status})`,
  );

  const key = await loadServiceAccountKey({
    serviceAccountJsonPath: d.serviceAccountJsonPath,
    playServiceAccountJson: d.playServiceAccountJson,
  });
  const accessToken = await getPlayAccessToken(key);
  ctx.log('play: OAuth access token acquired');

  const editRes = await playRequest({
    accessToken,
    method: 'POST',
    path: `/androidpublisher/v3/applications/${encodeURIComponent(inputs.packageName)}/edits`,
    body: {},
  });
  if (!editRes.ok) throw new Error(`play: failed to open edit — ${playErrorMessage(editRes)}`);
  const editId = (editRes.data as { id?: string } | undefined)?.id;
  if (!editId) throw new Error(`play: edit response missing id — ${editRes.text.slice(0, 200)}`);
  ctx.log(`play: opened edit ${editId}`);

  await assertVersionCodeExists({
    accessToken,
    packageName: inputs.packageName,
    editId,
    versionCode: inputs.versionCode,
  });

  const release: Record<string, unknown> = {
    status: inputs.status,
    versionCodes: [String(inputs.versionCode)],
  };
  if (inputs.releaseName !== undefined) release.name = inputs.releaseName;
  if (inputs.releaseNotes.length > 0) release.releaseNotes = inputs.releaseNotes;
  if (inputs.userFraction !== undefined) release.userFraction = inputs.userFraction;

  const trackRes = await playRequest({
    accessToken,
    method: 'PUT',
    path: `/androidpublisher/v3/applications/${encodeURIComponent(inputs.packageName)}/edits/${encodeURIComponent(editId)}/tracks/${encodeURIComponent(inputs.track)}`,
    body: { track: inputs.track, releases: [release] },
  });
  if (!trackRes.ok) {
    throw new Error(`play: track update failed: ${playErrorMessage(trackRes)}`);
  }
  ctx.log(`play: updated track ${inputs.track}`);

  const commitRes = await playRequest({
    accessToken,
    method: 'POST',
    path: `/androidpublisher/v3/applications/${encodeURIComponent(inputs.packageName)}/edits/${encodeURIComponent(editId)}:commit`,
  });
  if (!commitRes.ok) {
    throw new Error(`play: commit failed: ${playErrorMessage(commitRes)}`);
  }
  // 'draft' stages the release without serving it, so don't call it rolled out.
  const outcome =
    inputs.status === 'draft'
      ? `staged as a draft on track ${inputs.track}`
      : inputs.status === 'halted'
        ? `halted on track ${inputs.track}`
        : inputs.userFraction !== undefined
          ? `rolling out to ${Math.round(inputs.userFraction * 100)}% of track ${inputs.track}`
          : `rolled out on track ${inputs.track}`;
  ctx.log(`play: edit committed — versionCode ${inputs.versionCode} ${outcome}`);
}
