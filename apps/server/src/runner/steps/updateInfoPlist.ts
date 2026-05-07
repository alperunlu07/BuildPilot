import type { UpdateInfoPlistStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// Pure builder for the test suite. Wraps `/usr/libexec/PlistBuddy -c <cmd>
// <plistPath>`. The inner -c command is one of:
//   • Set <key> <value>           (errors if key is missing)
//   • Add <key> string <value>    (errors if key already exists)
//   • Delete <key>                (errors if key is missing)
export function buildUpdateInfoPlistCommand(d: Partial<UpdateInfoPlistStepData>): string {
  if (!d.plistPath || d.plistPath.trim().length === 0) {
    throw new Error('updateInfoPlist: missing "plistPath"');
  }
  if (!d.key || d.key.trim().length === 0) {
    throw new Error('updateInfoPlist: missing "key"');
  }
  const operation = d.operation ?? 'set';
  let inner: string;
  if (operation === 'set') {
    if (!d.value || d.value.length === 0) {
      throw new Error('updateInfoPlist: missing "value"');
    }
    inner = `Set ${d.key} ${d.value}`;
  } else if (operation === 'add-string') {
    if (!d.value || d.value.length === 0) {
      throw new Error('updateInfoPlist: missing "value"');
    }
    inner = `Add ${d.key} string ${d.value}`;
  } else if (operation === 'delete') {
    inner = `Delete ${d.key}`;
  } else {
    throw new Error(`updateInfoPlist: invalid operation "${operation}"`);
  }
  return `/usr/libexec/PlistBuddy -c ${shellQuote(inner)} ${shellQuote(d.plistPath)}`;
}

export async function runUpdateInfoPlist(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<UpdateInfoPlistStepData>;
  const command = buildUpdateInfoPlistCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: command,
  });
}
