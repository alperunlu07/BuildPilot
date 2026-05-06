import type { NotarizeStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// Pure argv builder split out so the test suite can exercise auth-method
// branching without xcrun present. The first element is always the
// command name (`xcrun`); the second is the subcommand (`notarytool`,
// `submit`); the rest are flags + value pairs already shell-quoted.
export function buildNotarizeArgs(d: Partial<NotarizeStepData>): string[] {
  if (!d.bundlePath || d.bundlePath.trim().length === 0) {
    throw new Error('notarize: missing "bundlePath"');
  }
  const auth = d.authMethod ?? 'apiKey';
  const wait = d.wait === 'false' ? false : true;

  const args: string[] = ['xcrun', 'notarytool', 'submit', shellQuote(d.bundlePath)];
  if (wait) args.push('--wait');

  if (auth === 'apiKey') {
    if (!d.apiKeyPath || !d.apiKeyId || !d.apiIssuerId) {
      throw new Error('notarize: apiKeyPath + apiKeyId + apiIssuerId required for apiKey auth');
    }
    args.push('--key', shellQuote(d.apiKeyPath));
    args.push('--key-id', shellQuote(d.apiKeyId));
    args.push('--issuer', shellQuote(d.apiIssuerId));
  } else {
    if (!d.appleId || !d.appPassword || !d.teamId) {
      throw new Error('notarize: appleId + appPassword + teamId required for appleId auth');
    }
    args.push('--apple-id', shellQuote(d.appleId));
    args.push('--password', shellQuote(d.appPassword));
    args.push('--team-id', shellQuote(d.teamId));
  }

  if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
    args.push(...d.additionalArgs.split(/\s+/).filter(Boolean).map(shellQuote));
  }
  return args;
}

export async function runNotarize(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<NotarizeStepData>;
  const args = buildNotarizeArgs(d);
  const command = args.join(' ');
  await execMaybeRemote({
    ctx,
    d,
    command,
    label: `xcrun notarytool submit ${d.bundlePath} (${d.authMethod ?? 'apiKey'})`,
  });
}
