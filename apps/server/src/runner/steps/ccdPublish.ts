import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { CcdPublishStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import {
  catalogBundleNames,
  listEntryNames,
  newestMatching,
  resolveUnderProject,
  runUgs,
  runUgsJson,
  ugsPathArg,
  ugsTargetArgs,
} from './_ccd';

const CATALOG_JSON_RE = /^catalog_.*\.json$/i;

export interface ResolvedCcdPublish {
  contentDirAbs: string;
  uploadScope: 'catalogReferenced' | 'allFiles';
  catalogFile?: string;
  createRelease: boolean;
  releaseNotes?: string;
  badge?: string;
}

// Pure validator, exposed so the rules can be tested without a bucket.
export function resolveCcdPublishInputs(
  d: Partial<CcdPublishStepData>,
  projectRoot: string,
): ResolvedCcdPublish {
  if (!d.bucketName || d.bucketName.trim().length === 0) {
    throw new Error('ccdPublish: missing "bucketName"');
  }
  if (!d.contentDir || d.contentDir.trim().length === 0) {
    throw new Error('ccdPublish: missing "contentDir"');
  }
  const scope = (d.uploadScope ?? 'catalogReferenced').trim();
  if (scope !== 'catalogReferenced' && scope !== 'allFiles') {
    throw new Error(`ccdPublish: invalid uploadScope "${scope}"`);
  }
  const notes = d.releaseNotes?.trim();
  const badge = d.badge?.trim();
  return {
    contentDirAbs: resolveUnderProject(projectRoot, d.contentDir.trim()),
    uploadScope: scope,
    catalogFile: d.catalogFile?.trim() || undefined,
    createRelease: (d.createRelease ?? 'true').trim() !== 'false',
    releaseNotes: notes && notes.length > 0 ? notes : undefined,
    badge: badge && badge.length > 0 ? badge : undefined,
  };
}

// CCD release notes are a single-line field. Collapsing here (rather than
// rejecting multi-line input) keeps a pipeline that pastes the store notes in
// from failing at the very last step of a publish.
export function flattenReleaseNotes(notes: string): string {
  return notes.replace(/\s+/g, ' ').trim().slice(0, 255);
}

async function fileNamesIn(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => e.name);
}

export async function runCcdPublish(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<CcdPublishStepData>;
  const inputs = resolveCcdPublishInputs(d, ctx.project.path);
  const bucket = d.bucketName!.trim();

  const dirStat = await fs.stat(inputs.contentDirAbs).catch(() => null);
  if (!dirStat?.isDirectory()) {
    throw new Error(`ccdPublish: content directory not found at ${inputs.contentDirAbs}`);
  }

  // Decide the upload set. In catalogReferenced mode the catalog is the
  // manifest: whatever it names is what a player will ask for, and everything
  // else in the directory is a previous build's leftovers.
  let wanted: string[];
  let catalogName: string | null = null;
  if (inputs.uploadScope === 'catalogReferenced') {
    catalogName =
      inputs.catalogFile ?? (await newestMatching(inputs.contentDirAbs, CATALOG_JSON_RE));
    if (!catalogName) {
      throw new Error(`ccdPublish: no catalog_*.json found in ${inputs.contentDirAbs}`);
    }
    const raw = await fs.readFile(join(inputs.contentDirAbs, catalogName), 'utf8');
    const referenced = catalogBundleNames(JSON.parse(raw));
    // Local-group bundles are compiled into the player, so they are listed in
    // the catalog but never written to the CCD output directory. Presence on
    // disk is the discriminator.
    const present: string[] = [];
    for (const name of referenced) {
      const st = await fs.stat(join(inputs.contentDirAbs, name)).catch(() => null);
      if (st?.isFile()) present.push(name);
    }
    const hashName = catalogName.replace(/\.json$/i, '.hash');
    wanted = [...present, catalogName, hashName];
    ctx.log(
      `ccd: ${catalogName} references ${referenced.length} bundles — ` +
        `${present.length} remote, ${referenced.length - present.length} shipped in the player`,
    );
  } else {
    wanted = await fileNamesIn(inputs.contentDirAbs);
    ctx.log(`ccd: ${wanted.length} files in ${inputs.contentDirAbs}`);
  }

  const existing = await listEntryNames(ctx, d, bucket);
  ctx.log(`ccd: bucket "${bucket}" holds ${existing.size} entries`);

  // The catalog pair is re-uploaded even when the names already exist: a
  // rebuild of the same player version reuses the file name while its contents
  // (and hash) change, and a stale catalog is exactly the failure this step is
  // meant to prevent.
  const alwaysUpload = new Set(
    catalogName ? [catalogName, catalogName.replace(/\.json$/i, '.hash')] : [],
  );
  const missing = wanted.filter((n) => alwaysUpload.has(n) || !existing.has(n));
  if (missing.length === 0) {
    ctx.log('ccd: bucket already holds every referenced entry — nothing to upload');
  }

  let uploaded = 0;
  let bytes = 0;
  for (const name of missing) {
    const abs = join(inputs.contentDirAbs, name);
    const st = await fs.stat(abs).catch(() => null);
    if (!st?.isFile()) {
      throw new Error(`ccdPublish: ${name} is referenced by the catalog but missing from disk`);
    }
    await runUgs(
      ctx,
      d,
      ['ccd', 'entries', 'copy', ugsPathArg(abs), name, '-b', bucket, ...ugsTargetArgs(d)],
      { quiet: true },
    );
    uploaded++;
    bytes += st.size;
    ctx.log(`ccd: uploaded ${name} (${st.size} bytes) [${uploaded}/${missing.length}]`);
  }
  if (uploaded > 0) {
    ctx.log(`ccd: uploaded ${uploaded} entries, ${(bytes / 1048576).toFixed(1)} MB`);
  }

  if (!inputs.createRelease) {
    ctx.log('ccd: createRelease=false — entries staged, no release cut');
    return;
  }

  const releaseArgs = ['ccd', 'releases', 'create', '-b', bucket, ...ugsTargetArgs(d)];
  if (inputs.releaseNotes) {
    releaseArgs.push('-n', flattenReleaseNotes(inputs.releaseNotes));
  }
  const release = (await runUgsJson(ctx, d, releaseArgs)) as
    | { ReleaseId?: string; ReleaseNum?: number }
    | undefined;
  if (!release?.ReleaseId) {
    throw new Error('ccd: release create returned no ReleaseId');
  }
  ctx.log(`ccd: created release ${release.ReleaseNum ?? '?'} (${release.ReleaseId})`);

  if (inputs.badge) {
    if (release.ReleaseNum === undefined) {
      throw new Error(`ccd: release create returned no ReleaseNum — cannot move badge "${inputs.badge}"`);
    }
    // `badges create` both creates and moves, so it is also the update path.
    await runUgs(ctx, d, [
      'ccd',
      'badges',
      'create',
      String(release.ReleaseNum),
      inputs.badge,
      '-b',
      bucket,
      ...ugsTargetArgs(d),
    ]);
    ctx.log(`ccd: badge "${inputs.badge}" now points at release ${release.ReleaseNum}`);
  }
}
