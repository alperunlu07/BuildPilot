import { writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SteamUploadStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote } from './_exec';
import {
  buildAppBuildVdf,
  buildSteamcmdUploadCommand,
  type SteamAppBuildModel,
  type SteamDepot,
} from './_steam';

// Drives `steamcmd +login +run_app_build` against a generated or provided
// VDF script. Two operating modes:
//   - vdfPath supplied  → use that file as-is
//   - vdfPath blank     → generate VDF from form fields (appId, depots,
//                         contentRoot, branch, description) and drop it
//                         into a temp dir; pass to steamcmd; clean up.
//
// Captures the post-upload BuildID from steamcmd stdout so a downstream
// `steamSetLive` step can target it.
export interface SteamDepotInput {
  id: string;
  // ContentRoot-relative wildcard, typically "*" for "everything".
  // Multiline mappings are supported via the textarea field.
  pattern?: string;
  // 'true' (default) — recursive copy.
  recursive?: string;
}

export function parseDepotsField(input: string | undefined): SteamDepot[] {
  if (!input || input.trim().length === 0) return [];
  const out: SteamDepot[] = [];
  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    // Format: "<depotId>:<localPath>[:<depotPath>][:<recursive>]"
    const parts = line.split(':');
    const id = parts[0]?.trim();
    if (!id || !/^\d+$/.test(id)) {
      throw new Error(`steamUpload: depot line "${line}" — first field must be numeric depot id`);
    }
    const localPath = (parts[1] ?? '*').trim();
    const depotPath = (parts[2] ?? '.').trim();
    const recursive = parts[3]?.trim() === 'false' ? false : true;
    out.push({ id, fileMappings: [{ localPath, depotPath, recursive }] });
  }
  if (out.length === 0) {
    throw new Error('steamUpload: no depots parsed');
  }
  return out;
}

export async function runSteamUpload(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SteamUploadStepData>;
  if (!d.username || !d.password) {
    throw new Error('steamUpload: username + password required');
  }

  // Resolve VDF — either user-provided path or generated from inputs.
  let vdfPath: string;
  let cleanupVdf = false;
  if (d.vdfPath && d.vdfPath.trim().length > 0) {
    vdfPath = d.vdfPath.trim();
    ctx.log(`using user-provided VDF ${vdfPath}`);
  } else {
    if (!d.appId) throw new Error('steamUpload: appId required when vdfPath is empty');
    if (!d.contentRoot) throw new Error('steamUpload: contentRoot required when vdfPath is empty');
    const depots = parseDepotsField(d.depots);
    const model: SteamAppBuildModel = {
      appId: d.appId,
      description: d.description ?? `BuildPilot upload ${ctx.build.id}`,
      contentRoot: d.contentRoot,
      depots,
    };
    if (d.setLive && d.setLive.trim().length > 0) model.setLive = d.setLive.trim();
    if (d.preview === 'true') model.preview = true;
    if (d.buildOutput && d.buildOutput.trim().length > 0) model.buildOutput = d.buildOutput.trim();

    const vdf = buildAppBuildVdf(model);
    const dir = join(tmpdir(), `buildpilot-steam-${ctx.build.id}`);
    await mkdir(dir, { recursive: true });
    vdfPath = join(dir, `app_build_${d.appId}.vdf`);
    await writeFile(vdfPath, vdf, 'utf-8');
    cleanupVdf = true;
    ctx.log(`generated VDF at ${vdfPath} (${vdf.length} bytes)`);
  }

  const cmd = buildSteamcmdUploadCommand({
    steamcmdPath: d.steamcmdPath,
    username: d.username,
    password: d.password,
    steamGuardCode: d.steamGuardCode,
    vdfPath,
  });
  try {
    await execMaybeRemote({ ctx, d, command: cmd, label: `steamcmd +run_app_build ${vdfPath}` });
  } finally {
    if (cleanupVdf) {
      try {
        const { rm } = await import('node:fs/promises');
        await rm(vdfPath, { force: true });
      } catch {
        // ignore
      }
    }
  }
}
