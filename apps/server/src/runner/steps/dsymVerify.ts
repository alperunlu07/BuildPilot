import type { DsymVerifyStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { captureMaybeRemote, shellQuote } from './_exec';

// `dwarfdump --uuid <binary>` — extracts the per-arch UUID(s) of a Mach-O
// binary. We capture stdout from both the binary and the dSYM and compare
// UUID sets. Mismatch = the dSYM was generated from a different build, which
// makes symbolication unreliable. Used as a gate before dsymUpload.
export function parseDwarfdumpUuids(stdout: string): Set<string> {
  // Lines look like:
  //   UUID: 12345678-…-DEADBEEF (arm64) build/MyApp.app/MyApp
  const uuids = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    const m = /UUID:\s*([A-F0-9-]+)/i.exec(line.trim());
    if (m && m[1]) uuids.add(m[1].toUpperCase());
  }
  return uuids;
}

export async function runDsymVerify(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<DsymVerifyStepData>;
  if (!d.binaryPath || d.binaryPath.trim().length === 0) {
    throw new Error('dsymVerify: missing "binaryPath"');
  }
  if (!d.dsymPath || d.dsymPath.trim().length === 0) {
    throw new Error('dsymVerify: missing "dsymPath"');
  }
  const binCmd = `dwarfdump --uuid ${shellQuote(d.binaryPath.trim())}`;
  const dsymCmd = `dwarfdump --uuid ${shellQuote(d.dsymPath.trim())}`;
  ctx.log(`dwarfdump --uuid ${d.binaryPath}`);
  const binOut = await captureMaybeRemote({ ctx, d, command: binCmd });
  const binUuids = parseDwarfdumpUuids(binOut);
  ctx.log(`binary UUIDs: ${[...binUuids].join(', ') || '(none)'}`);

  ctx.log(`dwarfdump --uuid ${d.dsymPath}`);
  const dsymOut = await captureMaybeRemote({ ctx, d, command: dsymCmd });
  const dsymUuids = parseDwarfdumpUuids(dsymOut);
  ctx.log(`dSYM UUIDs:   ${[...dsymUuids].join(', ') || '(none)'}`);

  // Match if every binary UUID has a corresponding dSYM UUID. (dSYM may
  // contain MORE — e.g. when a fat dSYM was produced and the .ipa was
  // architecture-thinned — that's fine.)
  const missing = [...binUuids].filter((u) => !dsymUuids.has(u));
  if (missing.length > 0) {
    throw new Error(
      `dsymVerify: dSYM is missing UUID(s) ${missing.join(', ')} present in the binary. ` +
        'Symbolication will fail. Re-archive with the matching dSYM bundle.',
    );
  }
  ctx.log(`dsymVerify: all ${binUuids.size} binary UUID(s) present in dSYM`, 'success');
}
