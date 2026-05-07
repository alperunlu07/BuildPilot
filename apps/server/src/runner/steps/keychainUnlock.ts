import type { KeychainUnlockStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// `security unlock-keychain` keeps the keychain open for the duration of the
// build run so subsequent codesign/xcodebuild steps don't pop a UI prompt on
// the Mac. Pair with `security set-keychain-settings -lut <sec>` to bound how
// long the unlocked state persists; we expose that as `unlockTimeoutSec`.
export async function runKeychainUnlock(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<KeychainUnlockStepData>;
  if (!d.password || d.password.length === 0) {
    throw new Error('keychainUnlock: missing "password"');
  }
  const keychain = d.keychain && d.keychain.trim().length > 0 ? d.keychain.trim() : 'login.keychain-db';

  // Build the shell command. The password is sneaked through stdin via a
  // here-doc so it doesn't show up in `ps aux`.
  const lines: string[] = [];
  if (typeof d.unlockTimeoutSec === 'number' && d.unlockTimeoutSec > 0) {
    lines.push(`security set-keychain-settings -lut ${Math.floor(d.unlockTimeoutSec)} ${shellQuote(keychain)}`);
  }
  lines.push(`security unlock-keychain -p ${shellQuote(d.password)} ${shellQuote(keychain)}`);
  const command = lines.join(' && ');

  await execMaybeRemote({
    ctx,
    d,
    command,
    label: `security unlock-keychain ${keychain}`,
  });
}
