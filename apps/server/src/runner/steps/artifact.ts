import { promises as fs } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { ArtifactStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { insertBuildArtifact } from '../../store/buildArtifacts';

// Minimal "glob" support: each line is one of
//   path/to/file        → that file
//   path/to/dir         → every file directly inside the dir (one level)
//   path/to/dir/**      → recursive walk of the dir
async function expandPath(projectRoot: string, raw: string): Promise<string[]> {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('#')) return [];
  const recursive = trimmed.endsWith('/**') || trimmed.endsWith('\\**');
  const cleaned = recursive ? trimmed.slice(0, -3) : trimmed;
  const abs = isAbsolute(cleaned) ? cleaned : join(projectRoot, cleaned);

  const stat = await fs.stat(abs).catch(() => null);
  if (!stat) return [];
  if (stat.isFile()) return [abs];
  if (!stat.isDirectory()) return [];

  if (recursive) {
    const out: string[] = [];
    async function walk(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (e.isFile()) out.push(p);
      }
    }
    await walk(abs);
    return out;
  }
  const entries = await fs.readdir(abs, { withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => join(abs, e.name));
}

export async function runArtifact(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<ArtifactStepData>;
  if (!d.paths || d.paths.trim().length === 0) {
    throw new Error('artifact: missing "paths"');
  }
  let totalCount = 0;
  let totalBytes = 0;
  for (const line of d.paths.split(/\r?\n/)) {
    const matches = await expandPath(ctx.project.path, line);
    if (matches.length === 0) {
      ctx.log(`(no matches) ${line}`, 'stderr');
      continue;
    }
    for (const path of matches) {
      const stat = await fs.stat(path).catch(() => null);
      if (!stat) continue;
      insertBuildArtifact({
        buildId: ctx.build.id,
        path,
        size: stat.size,
        mtime: stat.mtimeMs,
      });
      totalCount++;
      totalBytes += stat.size;
      ctx.log(`+ ${path} (${formatBytes(stat.size)})`, 'stdout');
    }
  }
  ctx.log(`recorded ${totalCount} artifact(s), ${formatBytes(totalBytes)} total`, 'info');
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}
