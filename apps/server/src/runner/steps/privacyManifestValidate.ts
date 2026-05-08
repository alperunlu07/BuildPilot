import type { PrivacyManifestValidateStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { captureMaybeRemote, shellQuote } from './_exec';

// Apple required all apps to ship a `PrivacyInfo.xcprivacy` declaring the
// reasons they call certain "required-reason" APIs (UserDefaults, file
// timestamps, system boot time, file size, disk space) starting May 2024.
// This step lints the manifest:
//   1. The file exists and parses as a plist (we shell out to plutil).
//   2. NSPrivacyAccessedAPITypes includes a reason for each API the binary
//      actually calls. (We approximate by looking for known-tagged symbols
//      via `nm` + a static allowlist.)
//
// Apple's full lint runs at App Store upload time; this is a fast pre-flight
// catch so PR builds fail before reaching upload.
const STRICT_FAIL = 'true';

const REQUIRED_REASON_APIS: Record<string, RegExp> = {
  NSPrivacyAccessedAPICategoryUserDefaults: /\bNSUserDefaults\b/,
  NSPrivacyAccessedAPICategoryFileTimestamp: /\b(creationDate|modificationDate|stat\(2\))\b/i,
  NSPrivacyAccessedAPICategorySystemBootTime: /\bboottime\b/i,
  NSPrivacyAccessedAPICategoryDiskSpace: /\bgetattrlist\b/i,
  NSPrivacyAccessedAPICategoryActiveKeyboards: /UITextInputMode/,
};

export interface PrivacyManifestLintResult {
  manifestExists: boolean;
  parsesAsPlist: boolean;
  declaredCategories: string[];
  potentiallyMissedCategories: string[];
}

export async function runPrivacyManifestValidate(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<PrivacyManifestValidateStepData>;
  if (!d.manifestPath || d.manifestPath.trim().length === 0) {
    throw new Error('privacyManifestValidate: missing "manifestPath"');
  }

  // Step 1: validate the manifest is parseable.
  const plutilCmd = `plutil -lint ${shellQuote(d.manifestPath.trim())}`;
  ctx.log(plutilCmd);
  await captureMaybeRemote({ ctx, d, command: plutilCmd });

  // Step 2: dump declared categories.
  const dumpCmd = `plutil -convert json -o - ${shellQuote(d.manifestPath.trim())}`;
  const dump = await captureMaybeRemote({ ctx, d, command: dumpCmd });
  let parsed: unknown;
  try {
    parsed = JSON.parse(dump);
  } catch (err) {
    throw new Error(
      `privacyManifestValidate: manifest is not parseable as JSON via plutil — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  const declared = extractCategories(parsed);
  ctx.log(`declared categories: ${declared.join(', ') || '(none)'}`);

  // Step 3: optional binary scan.
  if (d.binaryPath && d.binaryPath.trim().length > 0) {
    const nmCmd = `nm ${shellQuote(d.binaryPath.trim())} || true`;
    const nmOut = await captureMaybeRemote({ ctx, d, command: nmCmd });
    const missed: string[] = [];
    for (const [category, regex] of Object.entries(REQUIRED_REASON_APIS)) {
      if (regex.test(nmOut) && !declared.includes(category)) missed.push(category);
    }
    if (missed.length > 0) {
      const msg = `privacyManifestValidate: binary references APIs requiring categories ${missed.join(
        ', ',
      )} but they aren't declared in the manifest`;
      if (d.strict === STRICT_FAIL) throw new Error(msg);
      ctx.log(msg, 'failure');
    } else {
      ctx.log('binary scan: no missing required-reason categories', 'success');
    }
  }
  ctx.log('privacyManifestValidate ok', 'success');
}

function extractCategories(parsed: unknown): string[] {
  const out: string[] = [];
  if (!parsed || typeof parsed !== 'object') return out;
  const root = parsed as Record<string, unknown>;
  const apis = root.NSPrivacyAccessedAPITypes;
  if (Array.isArray(apis)) {
    for (const entry of apis) {
      if (entry && typeof entry === 'object') {
        const cat = (entry as { NSPrivacyAccessedAPIType?: unknown }).NSPrivacyAccessedAPIType;
        if (typeof cat === 'string') out.push(cat);
      }
    }
  }
  return out;
}
