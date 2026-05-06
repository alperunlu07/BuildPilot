import { promises as fs } from 'node:fs';
import { isAbsolute, join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import type {
  ProvisioningProfileInstallStepData,
  RemoteSshStepData,
} from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { isRemote, execMaybeRemote, shellQuote } from './_exec';
import { runSftpUpload } from './sftpUpload';

const REMOTE_PROFILES_DIR = '~/Library/MobileDevice/Provisioning\\ Profiles';

// Drops a .mobileprovision into ~/Library/MobileDevice/Provisioning Profiles
// (locally OR on a remote Mac). For remote installs we SFTP the file into a
// scratch /tmp path first, then `mv` it into the profiles dir — the
// directory contains a literal space which is awkward to round-trip through
// shell command lines, so the move-then-rename keeps the path-with-space
// confined to a single quoted command.
export async function runProvisioningProfileInstall(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<ProvisioningProfileInstallStepData>;
  if (!d.profilePath) throw new Error('provisioningProfileInstall: missing "profilePath"');

  const localAbs = isAbsolute(d.profilePath)
    ? d.profilePath
    : join(ctx.project.path, d.profilePath);
  const stat = await fs.stat(localAbs);
  if (!stat.isFile()) throw new Error(`profile not a file: ${localAbs}`);

  if (isRemote(d)) {
    // Step 1: SFTP the .mobileprovision to /tmp/<random>.mobileprovision
    const remoteName = `${randomBytes(8).toString('hex')}-${basename(localAbs)}`;
    const remoteScratch = `/tmp/${remoteName}`;
    ctx.log(`uploading profile to ${remoteScratch}`);
    await runSftpUpload(ctx, {
      hostId: d.hostId,
      host: d.host,
      identityFile: d.identityFile,
      password: d.password,
      skipStrictHostKey: d.skipStrictHostKey,
      localPath: localAbs,
      remotePath: remoteScratch,
    } satisfies Partial<RemoteSshStepData> & { localPath: string; remotePath: string });

    // Step 2: ensure profiles dir exists, then move the file into place.
    const command =
      `mkdir -p ${REMOTE_PROFILES_DIR} && mv ${shellQuote(remoteScratch)} ${REMOTE_PROFILES_DIR}/`;
    await execMaybeRemote({
      ctx,
      d,
      command,
      label: `install profile -> ${REMOTE_PROFILES_DIR}/`,
    });
    return;
  }

  // Local install — just copy.
  const localProfilesDir = expandLocalProfilesDir();
  await fs.mkdir(localProfilesDir, { recursive: true });
  const dest = join(localProfilesDir, basename(localAbs));
  await fs.copyFile(localAbs, dest);
  ctx.log(`installed: ${dest}`, 'success');
}

function expandLocalProfilesDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) throw new Error('cannot resolve $HOME for profile install');
  return join(home, 'Library', 'MobileDevice', 'Provisioning Profiles');
}
