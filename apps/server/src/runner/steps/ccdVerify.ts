import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { CcdVerifyStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import {
  DEFAULT_BADGE,
  DEFAULT_ENVIRONMENT,
  catalogBundleNames,
  ccdContentUrl,
  newestMatching,
  resolveBucketId,
  resolveProjectId,
  resolveUnderProject,
} from './_ccd';
import { readZipEntry } from './_zip';

const CATALOG_HASH_RE = /^catalog_.*\.hash$/i;

export interface ResolvedCcdVerify {
  contentDirAbs: string;
  catalogHashFile?: string;
  badge: string;
  environmentName: string;
  sampleBundles: number;
  binaryAbs?: string;
}

export function resolveCcdVerifyInputs(
  d: Partial<CcdVerifyStepData>,
  projectRoot: string,
): ResolvedCcdVerify {
  if (!d.bucketName || d.bucketName.trim().length === 0) {
    throw new Error('ccdVerify: missing "bucketName"');
  }
  if (!d.contentDir || d.contentDir.trim().length === 0) {
    throw new Error('ccdVerify: missing "contentDir"');
  }
  const sample = d.sampleBundles === undefined || d.sampleBundles === null ? 3 : Number(d.sampleBundles);
  if (!Number.isFinite(sample) || sample < 0) {
    throw new Error(`ccdVerify: sampleBundles must be 0 or greater (got "${d.sampleBundles}")`);
  }
  const badge = d.badge?.trim();
  const env = d.environmentName?.trim();
  const binary = d.binaryPath?.trim();
  return {
    contentDirAbs: resolveUnderProject(projectRoot, d.contentDir.trim()),
    catalogHashFile: d.catalogHashFile?.trim() || undefined,
    badge: badge && badge.length > 0 ? badge : DEFAULT_BADGE,
    environmentName: env && env.length > 0 ? env : DEFAULT_ENVIRONMENT,
    sampleBundles: Math.floor(sample),
    binaryAbs: binary && binary.length > 0 ? resolveUnderProject(projectRoot, binary) : undefined,
  };
}

interface PlayerCcdTarget {
  environmentName?: string;
  bucketId?: string;
  badge?: string;
}

// Unity bakes the bucket the player will talk to into assets/aa/settings.json
// as m_CcdManagedData. Reading it back out of the archive is the only way to
// prove the binary about to ship and the bucket just verified are the same
// place — a profile switched between the content build and the player build
// otherwise passes every other check here.
export function readPlayerCcdTarget(settingsJson: string): PlayerCcdTarget {
  const parsed = JSON.parse(settingsJson) as {
    m_CcdManagedData?: { EnvironmentName?: string; BucketId?: string; Badge?: string };
  };
  const managed = parsed.m_CcdManagedData;
  if (!managed) return {};
  return {
    environmentName: managed.EnvironmentName,
    bucketId: managed.BucketId,
    badge: managed.Badge,
  };
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.text()).trim();
}

export async function runCcdVerify(ctx: StepContext, data: Record<string, unknown>): Promise<void> {
  const d = data as Partial<CcdVerifyStepData>;
  const inputs = resolveCcdVerifyInputs(d, ctx.project.path);
  const bucket = d.bucketName!.trim();

  const hashName =
    inputs.catalogHashFile ?? (await newestMatching(inputs.contentDirAbs, CATALOG_HASH_RE));
  if (!hashName) {
    throw new Error(`ccdVerify: no catalog_*.hash found in ${inputs.contentDirAbs}`);
  }
  const localHash = (await fs.readFile(join(inputs.contentDirAbs, hashName), 'utf8')).trim();
  ctx.log(`ccd: local ${hashName} = ${localHash}`);

  const projectId = await resolveProjectId(ctx, d);
  const bucketId = await resolveBucketId(ctx, d);

  const url = ccdContentUrl({
    projectId,
    environmentName: inputs.environmentName,
    bucketId,
    badge: inputs.badge,
    path: hashName,
  });
  let remoteHash: string;
  try {
    remoteHash = await fetchText(url);
  } catch (err) {
    throw new Error(
      `ccdVerify: badge "${inputs.badge}" does not serve ${hashName} (${(err as Error).message}) — ` +
        'the bucket is behind the player that was just built. Publish content before shipping the binary.',
    );
  }
  if (remoteHash !== localHash) {
    throw new Error(
      `ccdVerify: catalog hash mismatch — badge "${inputs.badge}" serves ${remoteHash}, ` +
        `the build produced ${localHash}. Players would load the wrong content catalog.`,
    );
  }
  ctx.log(`ccd: badge "${inputs.badge}" serves the matching catalog hash`);

  if (inputs.sampleBundles > 0) {
    const catalogJsonName = hashName.replace(/\.hash$/i, '.json');
    const catalogAbs = join(inputs.contentDirAbs, catalogJsonName);
    const raw = await fs.readFile(catalogAbs, 'utf8').catch(() => null);
    if (raw === null) {
      ctx.log(`ccd: ${catalogJsonName} not on disk — skipping the bundle sample`);
    } else {
      const referenced = catalogBundleNames(JSON.parse(raw));
      // Only remote bundles are worth sampling; the rest ship in the player.
      const remote: Array<{ name: string; size: number }> = [];
      for (const name of referenced) {
        const st = await fs.stat(join(inputs.contentDirAbs, name)).catch(() => null);
        if (st?.isFile()) remote.push({ name, size: st.size });
      }
      // Largest first: a truncated upload shows up on a big bundle long before
      // it shows up on a 40 KB localization table.
      remote.sort((a, b) => b.size - a.size);
      const sample = remote.slice(0, inputs.sampleBundles);
      for (const { name, size } of sample) {
        const res = await fetch(
          ccdContentUrl({
            projectId,
            environmentName: inputs.environmentName,
            bucketId,
            badge: inputs.badge,
            path: name,
          }),
          { redirect: 'follow' },
        );
        if (!res.ok) {
          throw new Error(`ccdVerify: ${name} is not served by badge "${inputs.badge}" (HTTP ${res.status})`);
        }
        const served = (await res.arrayBuffer()).byteLength;
        if (served !== size) {
          throw new Error(
            `ccdVerify: ${name} is ${size} bytes locally but ${served} bytes on CCD — ` +
              'the entry was released before its content finished uploading.',
          );
        }
        ctx.log(`ccd: ${name} served intact (${served} bytes)`);
      }
      if (sample.length < inputs.sampleBundles) {
        ctx.log(`ccd: only ${sample.length} remote bundles exist — sampled all of them`);
      }
    }
  }

  if (inputs.binaryAbs) {
    const settings = await readZipEntry(inputs.binaryAbs, [
      'base/assets/aa/settings.json',
      'assets/aa/settings.json',
    ]);
    if (settings === null) {
      throw new Error(
        `ccdVerify: no Addressables settings.json inside ${inputs.binaryAbs} — ` +
          'is this an Addressables build?',
      );
    }
    const target = readPlayerCcdTarget(settings.toString('utf8'));
    const mismatches: string[] = [];
    if (target.bucketId && target.bucketId !== bucketId) {
      mismatches.push(`bucket ${target.bucketId} (verified ${bucketId})`);
    }
    if (target.environmentName && target.environmentName !== inputs.environmentName) {
      mismatches.push(`environment ${target.environmentName} (verified ${inputs.environmentName})`);
    }
    if (target.badge && target.badge !== inputs.badge) {
      mismatches.push(`badge ${target.badge} (verified ${inputs.badge})`);
    }
    if (mismatches.length > 0) {
      throw new Error(
        `ccdVerify: the player resolves content from a different target — ${mismatches.join('; ')}`,
      );
    }
    ctx.log(
      `ccd: player targets env=${target.environmentName ?? '?'} bucket=${target.bucketId ?? '?'} ` +
        `badge=${target.badge ?? '?'} — matches`,
    );
  }
}
