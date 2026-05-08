import type { SecurityKeychainImportStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// `security import <file> -k <keychain> -P <password> -A` followed by
// `security set-key-partition-list -S apple-tool:,apple: -k <keychain>` to
// suppress the codesign UI prompt that appears on macOS 10.12+ when the
// signing identity is used the first time. The #1 cause of "this build
// works on my Mac but fails in CI with `security: no identity found`".
export interface SecurityKeychainArgs {
  importCommand: string;
  partitionListCommand: string;
}

export function buildSecurityKeychainCommands(
  d: Partial<SecurityKeychainImportStepData>,
): SecurityKeychainArgs {
  if (!d.filePath || d.filePath.trim().length === 0) {
    throw new Error('securityKeychainImport: missing "filePath"');
  }
  const keychain = d.keychain ?? 'login.keychain-db';
  const importParts = ['security', 'import', shellQuote(d.filePath.trim())];
  importParts.push('-k', shellQuote(keychain));
  if (d.filePassword && d.filePassword.length > 0) {
    importParts.push('-P', shellQuote(d.filePassword));
  }
  if (d.allowAccess !== 'false') importParts.push('-A');
  if (d.allowedTools && d.allowedTools.trim().length > 0) {
    for (const tool of d.allowedTools.split(/[,\n]+/).map((t) => t.trim()).filter(Boolean)) {
      importParts.push('-T', shellQuote(tool));
    }
  }
  if (d.fileType && d.fileType.trim().length > 0) {
    importParts.push('-t', shellQuote(d.fileType.trim()));
  }
  if (d.fileFormat && d.fileFormat.trim().length > 0) {
    importParts.push('-f', shellQuote(d.fileFormat.trim()));
  }

  // The partition-list command needs the keychain unlocked; we expect the
  // caller to chain a keychainUnlock step before this one.
  const partitionParts = ['security', 'set-key-partition-list'];
  partitionParts.push('-S', shellQuote(d.partitionList ?? 'apple-tool:,apple:'));
  if (d.keychainPassword && d.keychainPassword.length > 0) {
    partitionParts.push('-s', '-k', shellQuote(d.keychainPassword));
  } else {
    partitionParts.push('-s');
  }
  partitionParts.push(shellQuote(keychain));
  return {
    importCommand: importParts.join(' '),
    partitionListCommand: partitionParts.join(' '),
  };
}

export async function runSecurityKeychainImport(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SecurityKeychainImportStepData>;
  const cmds = buildSecurityKeychainCommands(d);
  await execMaybeRemote({ ctx, d, command: cmds.importCommand, label: `security import ${d.filePath}` });
  if (d.skipPartitionList !== 'true') {
    await execMaybeRemote({
      ctx,
      d,
      command: cmds.partitionListCommand,
      label: 'security set-key-partition-list',
    });
  }
}
