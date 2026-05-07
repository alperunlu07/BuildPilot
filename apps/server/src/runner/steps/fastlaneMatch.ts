import type { FastlaneMatchStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

const VALID_TYPES = new Set([
  'appstore',
  'adhoc',
  'development',
  'enterprise',
  'developer_id',
]);

// Pure argv builder — exported for the test suite. Returns a fully
// shell-quoted string ready to be handed to execMaybeRemote. Note the
// MATCH_PASSWORD prefix: fastlane match reads its decryption password
// from that env var. We pass it inline so it doesn't show up in `ps`
// (running shells filter env from output, but values on argv are public).
export function buildFastlaneMatchCommand(d: Partial<FastlaneMatchStepData>): string {
  if (!d.matchType) throw new Error('fastlaneMatch: missing "matchType"');
  if (!VALID_TYPES.has(d.matchType)) {
    throw new Error(`fastlaneMatch: invalid matchType "${d.matchType}"`);
  }

  const parts: string[] = [];
  if (d.password && d.password.length > 0) {
    // bash-style env prefix — works on both bash and zsh which is what
    // every macOS / typical Linux shell defaults to.
    parts.push(`MATCH_PASSWORD=${shellQuote(d.password)}`);
  }
  parts.push('fastlane', 'match', d.matchType);

  const flag = (name: string, value: string) => {
    parts.push(name, shellQuote(value));
  };

  if (d.appIdentifier && d.appIdentifier.trim().length > 0) {
    flag('--app_identifier', d.appIdentifier.trim());
  }
  if (d.gitUrl && d.gitUrl.trim().length > 0) flag('--git_url', d.gitUrl.trim());
  if (d.gitBranch && d.gitBranch.trim().length > 0) flag('--git_branch', d.gitBranch.trim());
  if (d.keychainName && d.keychainName.trim().length > 0) {
    flag('--keychain_name', d.keychainName.trim());
  }
  if (d.keychainPassword && d.keychainPassword.length > 0) {
    flag('--keychain_password', d.keychainPassword);
  }
  if (d.readonly === 'true') parts.push('--readonly');

  if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
    parts.push(...d.additionalArgs.split(/\s+/).filter(Boolean).map(shellQuote));
  }

  return parts.join(' ');
}

export async function runFastlaneMatch(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<FastlaneMatchStepData>;
  const command = buildFastlaneMatchCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: `fastlane match ${d.matchType}${d.readonly === 'true' ? ' --readonly' : ''}`,
  });
}
