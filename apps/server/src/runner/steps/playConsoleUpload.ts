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

const EOCD_SIG = 0x06054b50;
const CD_ENTRY_SIG = 0x02014b50;
const EOCD_MIN_SIZE = 22;
const MAX_ZIP_COMMENT = 0xffff;

// Walk a zip's central directory and return every entry name. Returns null —
// meaning "could not determine" — for anything we don't decode, including
// ZIP64, so callers can wave the archive through instead of blocking on a
// layout quirk.
function readZipEntryNames(buf: Buffer): Set<string> | null {
  const scanLimit = Math.min(buf.length, EOCD_MIN_SIZE + MAX_ZIP_COMMENT);
  let eocd = -1;
  for (let i = buf.length - EOCD_MIN_SIZE; i >= buf.length - scanLimit && i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entryCount = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  // 0xffff/0xffffffff are the ZIP64 "look in the 64-bit record" sentinels.
  if (entryCount === 0xffff || cdOffset === 0xffffffff) return null;
  const names = new Set<string>();
  let p = cdOffset;
  for (let n = 0; n < entryCount; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CD_ENTRY_SIG) return null;
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    if (p + 46 + nameLen > buf.length) return null;
    names.add(buf.toString('utf8', p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

// Play accepts the upload of anything zip-shaped and only discovers a format
// mismatch deep in server-side processing, where it surfaces as a bare HTTP
// 500 — after the entire binary has gone over the wire (~3 min for a 180 MiB
// bundle). Unity is the usual source: with EditorUserBuildSettings.buildAppBundle
// off it emits an APK regardless of what the output file is named, so an
// "*.aab" that is really an APK is the common failure.
//
// APK and AAB are both zip containers; the structural marker that separates
// them is `BundleConfig.pb`, which only an App Bundle carries.
export function assertBinaryMatchesKind(buf: Buffer, kind: 'apk' | 'aab'): void {
  const names = readZipEntryNames(buf);
  if (names === null) return; // undecodable — let Play be the judge
  const isBundle = names.has('BundleConfig.pb');
  if (kind === 'aab' && !isBundle) {
    throw new Error(
      'playConsoleUpload: file is named .aab but contains no "BundleConfig.pb" — ' +
        'it is an APK with an .aab name, which Play rejects with an opaque HTTP 500. ' +
        'In Unity, set EditorUserBuildSettings.buildAppBundle = true before building.',
    );
  }
  if (kind === 'apk' && isBundle) {
    throw new Error(
      'playConsoleUpload: file is named .apk but contains "BundleConfig.pb" — ' +
        'it is an App Bundle with an .apk name. Rename the artifact to .aab.',
    );
  }
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
  assertBinaryMatchesKind(binary, inputs.binaryKind);

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
  // The single-shot `uploadType=media` POST is only reliable under ~100 MiB;
  // above that Google's simple-upload path intermittently returns a bare
  // HTTP 500 instead of a clear error (seen in practice on a 182 MiB AAB).
  // Play's documented fix is the resumable protocol: initiate a session
  // (get a Location URI back), then PUT the full body to that URI.
  const uploadBasePath = inputs.binaryKind === 'aab'
    ? `/upload/androidpublisher/v3/applications/${encodeURIComponent(inputs.packageName)}/edits/${encodeURIComponent(editId)}/bundles`
    : `/upload/androidpublisher/v3/applications/${encodeURIComponent(inputs.packageName)}/edits/${encodeURIComponent(editId)}/apks`;
  const uploadContentType = inputs.binaryKind === 'aab'
    ? 'application/octet-stream'
    : 'application/vnd.android.package-archive';
  const initiateRes = await fetch(
    `https://androidpublisher.googleapis.com${uploadBasePath}?uploadType=resumable`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': uploadContentType,
        'X-Upload-Content-Length': String(binary.length),
      },
      body: '{}',
    },
  );
  if (!initiateRes.ok) {
    const initiateText = await initiateRes.text();
    throw new Error(
      `play: failed to start resumable upload session: HTTP ${initiateRes.status} ${initiateText.slice(0, 300)}`,
    );
  }
  const sessionUri = initiateRes.headers.get('location');
  if (!sessionUri) {
    throw new Error('play: resumable upload session response is missing a Location header');
  }
  const uploadRes = await fetch(sessionUri, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': uploadContentType,
      'Content-Length': String(binary.length),
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
