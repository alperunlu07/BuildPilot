import { promises as fs } from 'node:fs';
import { extname, isAbsolute, join } from 'node:path';
import type { PlayConsoleUploadStepData } from '@buildpilot/shared-types';
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

interface ResolvedPlayInputs {
  packageName: string;
  binaryAbs: string;
  binaryKind: 'apk' | 'aab';
  track: string;
  status: string;
  userFraction?: number;
  releaseNotes: Array<{ language: string; text: string }>;
}

// Pure validator + normaliser. Exposed so unit tests can assert the
// validation rules without needing a service account or real binary.
export function resolvePlayInputs(
  d: Partial<PlayConsoleUploadStepData>,
  projectRoot: string,
): ResolvedPlayInputs {
  if (!d.packageName || d.packageName.trim().length === 0) {
    throw new Error('playConsoleUpload: missing "packageName"');
  }
  if (!d.binaryPath || d.binaryPath.trim().length === 0) {
    throw new Error('playConsoleUpload: missing "binaryPath"');
  }
  const ext = extname(d.binaryPath).toLowerCase();
  let binaryKind: 'apk' | 'aab';
  if (ext === '.aab') binaryKind = 'aab';
  else if (ext === '.apk') binaryKind = 'apk';
  else {
    throw new Error(`playConsoleUpload: binaryPath must end in .aab or .apk (got "${ext}")`);
  }
  const track = (d.track && d.track.trim().length > 0 ? d.track.trim() : 'internal').toLowerCase();
  if (!VALID_TRACKS.has(track)) {
    throw new Error(`playConsoleUpload: invalid track "${track}"`);
  }
  const status = d.status && d.status.trim().length > 0 ? d.status.trim() : 'completed';
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`playConsoleUpload: invalid status "${status}"`);
  }
  if (status === 'inProgress') {
    if (
      d.userFraction === undefined ||
      d.userFraction === null ||
      d.userFraction <= 0 ||
      d.userFraction > 1
    ) {
      throw new Error('playConsoleUpload: status=inProgress requires userFraction in (0, 1]');
    }
  }
  const binaryAbs = isAbsolute(d.binaryPath) ? d.binaryPath : join(projectRoot, d.binaryPath);
  return {
    packageName: d.packageName.trim(),
    binaryAbs,
    binaryKind,
    track,
    status,
    userFraction: status === 'inProgress' ? d.userFraction : undefined,
    releaseNotes: parseReleaseNotes(d.releaseNotes),
  };
}

// Standard Play 4-step edit flow:
//   1. POST   /androidpublisher/v3/applications/{pkg}/edits         → editId
//   2. POST   /upload/.../edits/{id}/(bundles|apks)                  → uploaded, versionCode
//   3. PUT    /edits/{id}/tracks/{track}                             → set release on track
//   4. POST   /edits/{id}:commit                                    → publish
//
// We POST/PUT JSON for the metadata steps and POST the raw .aab/.apk for
// the binary upload. The upload host is a different sub-API
// (`upload.googleapis.com`) — playRequest's PLAY_BASE doesn't cover it, so
// we hit fetch directly for step 2.
export async function runPlayConsoleUpload(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<PlayConsoleUploadStepData>;
  const inputs = resolvePlayInputs(d, ctx.project.path);
  ctx.log(
    `play: uploading ${inputs.binaryKind} → ${inputs.packageName} (track=${inputs.track}, status=${inputs.status})`,
  );

  const key = await loadServiceAccountKey({
    serviceAccountJsonPath: d.serviceAccountJsonPath,
    playServiceAccountJson: d.playServiceAccountJson,
  });
  const stat = await fs.stat(inputs.binaryAbs).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw new Error(`playConsoleUpload: binary not found at ${inputs.binaryAbs}`);
  }
  const binary = await fs.readFile(inputs.binaryAbs);
  ctx.log(`play: read ${binary.length} bytes from ${inputs.binaryAbs}`);

  const accessToken = await getPlayAccessToken(key);
  ctx.log('play: OAuth access token acquired');

  // 1. Open an edit.
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

  // 2. Upload the binary against /upload (the multipart-or-resumable host).
  // For files under ~100 MiB the simple media upload is fine; for larger
  // files Play recommends the resumable path. We use the simple path for
  // both — failures surface as 4xx with a clear message.
  const uploadPath = inputs.binaryKind === 'aab'
    ? `/upload/androidpublisher/v3/applications/${encodeURIComponent(inputs.packageName)}/edits/${encodeURIComponent(editId)}/bundles?uploadType=media`
    : `/upload/androidpublisher/v3/applications/${encodeURIComponent(inputs.packageName)}/edits/${encodeURIComponent(editId)}/apks?uploadType=media`;
  const uploadUrl = 'https://androidpublisher.googleapis.com' + uploadPath;
  const uploadContentType = inputs.binaryKind === 'aab'
    ? 'application/octet-stream'
    : 'application/vnd.android.package-archive';
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': uploadContentType,
    },
    body: new Uint8Array(binary),
  });
  const uploadText = await uploadRes.text();
  if (!uploadRes.ok) {
    throw new Error(`play: binary upload failed: HTTP ${uploadRes.status} ${uploadText.slice(0, 300)}`);
  }
  const uploadParsed = (() => {
    try {
      return JSON.parse(uploadText) as { versionCode?: number };
    } catch {
      return {} as { versionCode?: number };
    }
  })();
  const versionCode = uploadParsed.versionCode;
  if (versionCode === undefined) {
    throw new Error(`play: upload response missing versionCode — ${uploadText.slice(0, 200)}`);
  }
  ctx.log(`play: uploaded ${inputs.binaryKind} (versionCode=${versionCode})`);

  // 3. Update the track to release the freshly-uploaded versionCode.
  const release: Record<string, unknown> = {
    status: inputs.status,
    versionCodes: [String(versionCode)],
  };
  if (inputs.releaseNotes.length > 0) {
    release.releaseNotes = inputs.releaseNotes;
  }
  if (inputs.userFraction !== undefined) {
    release.userFraction = inputs.userFraction;
  }
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

  // 4. Commit.
  const commitRes = await playRequest({
    accessToken,
    method: 'POST',
    path: `/androidpublisher/v3/applications/${encodeURIComponent(inputs.packageName)}/edits/${encodeURIComponent(editId)}:commit`,
  });
  if (!commitRes.ok) {
    throw new Error(`play: commit failed: ${playErrorMessage(commitRes)}`);
  }
  ctx.log(`play: edit committed — versionCode ${versionCode} live on track ${inputs.track}`);
}
