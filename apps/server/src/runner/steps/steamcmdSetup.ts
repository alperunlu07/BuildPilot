import { writeFile, mkdir, copyFile } from 'node:fs/promises';
import type { SteamcmdSetupStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// Bootstrap `steamcmd` on the agent. On Windows we drop a one-shot batch
// that downloads + extracts steamcmd.zip. On Linux/macOS we shell out via
// curl + tar. After install, optionally sideload Steam Guard sentry/ssfn
// files so subsequent `steamcmd +login` runs don't trip 2FA.
const WIN_DOWNLOAD = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';
const LIN_DOWNLOAD = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz';
const MAC_DOWNLOAD = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_osx.tar.gz';

export function buildSteamcmdSetupCommand(d: Partial<SteamcmdSetupStepData>): string {
  const platform = (d.platform ?? 'auto').toLowerCase();
  if (!d.installDir || d.installDir.trim().length === 0) {
    throw new Error('steamcmdSetup: missing "installDir"');
  }
  const dir = shellQuote(d.installDir.trim());

  if (platform === 'windows') {
    // PowerShell route — runs natively on Windows agents and on Mac/Linux
    // agents that have pwsh installed. Downloads to %TEMP%, extracts, runs.
    return `powershell -NoProfile -Command "$tmp=[IO.Path]::GetTempFileName()+'.zip'; ` +
      `Invoke-WebRequest -Uri ${WIN_DOWNLOAD} -OutFile $tmp; ` +
      `New-Item -ItemType Directory -Force -Path ${dir} | Out-Null; ` +
      `Expand-Archive -Path $tmp -DestinationPath ${dir} -Force; ` +
      `Remove-Item $tmp"`;
  }

  // POSIX route. Use curl|tar instead of wget; many CI containers ship
  // curl by default and not wget.
  const url = platform === 'macos' ? MAC_DOWNLOAD : LIN_DOWNLOAD;
  return `mkdir -p ${dir} && curl -sSL ${shellQuote(url)} | tar -xz -C ${dir}`;
}

export async function runSteamcmdSetup(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SteamcmdSetupStepData>;
  const command = buildSteamcmdSetupCommand(d);
  ctx.log(`steamcmdSetup → ${d.installDir}`);
  await execMaybeRemote({ ctx, d, command, label: 'steamcmd download/extract' });

  // Optional: sideload Steam Guard cache for headless 2FA. The user pastes
  // base64-encoded sentry/ssfn contents into the form (often easier than
  // fiddling with file uploads at MVP time). We write them into the standard
  // location ~/Steam/ssfn* / ~/Steam/config/config.vdf.
  if ((d.sentryFileBase64 && d.sentryFileBase64.length > 0) ||
      (d.ssfnFileBase64 && d.ssfnFileBase64.length > 0)) {
    if (d.steamHomeDir && d.steamHomeDir.trim().length > 0) {
      await mkdir(d.steamHomeDir, { recursive: true });
      if (d.sentryFileBase64) {
        const target = `${d.steamHomeDir.replace(/\/$/, '')}/sentry`;
        await writeFile(target, Buffer.from(d.sentryFileBase64, 'base64'));
        ctx.log(`wrote sentry cache to ${target}`);
      }
      if (d.ssfnFileBase64 && d.ssfnFileName) {
        const target = `${d.steamHomeDir.replace(/\/$/, '')}/${d.ssfnFileName}`;
        await writeFile(target, Buffer.from(d.ssfnFileBase64, 'base64'));
        ctx.log(`wrote ssfn cache to ${target}`);
      }
    } else {
      ctx.log('Steam Guard cache provided but no steamHomeDir — skipping write', 'failure');
    }
  }

  // Optional: copy a custom config.vdf in (lets users opt out of the
  // "where do I put the ssfn?" detail when their CI workspace has it
  // already).
  if (d.configVdfPath && d.configVdfPath.trim().length > 0 && d.steamHomeDir) {
    await mkdir(`${d.steamHomeDir}/config`, { recursive: true });
    await copyFile(d.configVdfPath, `${d.steamHomeDir}/config/config.vdf`);
    ctx.log(`copied config.vdf from ${d.configVdfPath}`);
  }

  ctx.log('steamcmdSetup ok', 'success');
}
