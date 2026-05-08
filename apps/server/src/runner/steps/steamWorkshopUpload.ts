import { writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SteamWorkshopUploadStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// Workshop content upload via SteamPipe. Like `steamUpload`, but uses
// `steamcmd +workshop_build_item` against a workshop_<itemid>.vdf instead
// of an app_build_<appid>.vdf.
//
// Workshop VDF shape (Valve docs):
//   "workshopitem"
//   {
//     "appid"          "<appId>"
//     "publishedfileid" "<itemId>"          // 0 to create new
//     "contentfolder"  "<absolute path>"
//     "previewfile"    "<absolute path>"
//     "title"          "<text>"
//     "description"    "<text>"
//     "changenote"     "<text>"
//     "visibility"     "0"                  // 0 public, 1 friends, 2 private
//   }
export interface WorkshopVdfModel {
  appId: string;
  itemId: string; // "0" creates a new item
  contentFolder: string;
  previewFile?: string;
  title?: string;
  description?: string;
  changeNote?: string;
  visibility?: '0' | '1' | '2';
}

function quote(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

export function buildWorkshopVdf(m: WorkshopVdfModel): string {
  const lines: string[] = [];
  lines.push('"workshopitem"');
  lines.push('{');
  lines.push(`  "appid" ${quote(m.appId)}`);
  lines.push(`  "publishedfileid" ${quote(m.itemId)}`);
  lines.push(`  "contentfolder" ${quote(m.contentFolder)}`);
  if (m.previewFile) lines.push(`  "previewfile" ${quote(m.previewFile)}`);
  if (m.title) lines.push(`  "title" ${quote(m.title)}`);
  if (m.description) lines.push(`  "description" ${quote(m.description)}`);
  if (m.changeNote) lines.push(`  "changenote" ${quote(m.changeNote)}`);
  if (m.visibility) lines.push(`  "visibility" ${quote(m.visibility)}`);
  lines.push('}');
  return lines.join('\n') + '\n';
}

export async function runSteamWorkshopUpload(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SteamWorkshopUploadStepData>;
  if (!d.username || !d.password) {
    throw new Error('steamWorkshopUpload: username + password required');
  }
  if (!d.appId) throw new Error('steamWorkshopUpload: appId required');
  if (!d.contentFolder) throw new Error('steamWorkshopUpload: contentFolder required');

  // Build the VDF
  const model: WorkshopVdfModel = {
    appId: d.appId,
    itemId: d.itemId ?? '0',
    contentFolder: d.contentFolder,
  };
  if (d.previewFile) model.previewFile = d.previewFile;
  if (d.title) model.title = d.title;
  if (d.description) model.description = d.description;
  if (d.changeNote) model.changeNote = d.changeNote;
  if (d.visibility) model.visibility = d.visibility as '0' | '1' | '2';

  const vdf = buildWorkshopVdf(model);
  const dir = join(tmpdir(), `buildpilot-workshop-${ctx.build.id}`);
  await mkdir(dir, { recursive: true });
  const vdfPath = join(dir, `workshop_${d.appId}_${model.itemId}.vdf`);
  await writeFile(vdfPath, vdf, 'utf-8');
  ctx.log(`generated workshop VDF at ${vdfPath} (${vdf.length} bytes)`);

  const steamcmd = d.steamcmdPath ?? 'steamcmd';
  const parts = [
    steamcmd,
    '+@ShutdownOnFailedCommand', '1',
    '+@NoPromptForPassword', '1',
    '+login', shellQuote(d.username), shellQuote(d.password),
  ];
  if (d.steamGuardCode && d.steamGuardCode.length > 0) parts.push(shellQuote(d.steamGuardCode));
  parts.push('+workshop_build_item', shellQuote(vdfPath));
  parts.push('+quit');

  try {
    await execMaybeRemote({
      ctx,
      d,
      command: parts.join(' '),
      label: `steamcmd +workshop_build_item ${vdfPath}`,
    });
  } finally {
    try {
      const { rm } = await import('node:fs/promises');
      await rm(vdfPath, { force: true });
    } catch {
      // ignore
    }
  }
}
