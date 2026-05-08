import type { PrivacyManifestAggregateStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { captureMaybeRemote, shellQuote } from './_exec';

// `find <pods> -name PrivacyInfo.xcprivacy` + plist-merge the categories
// from each dependency's manifest into the app's manifest. Avoids a
// hand-maintained list of required-reason categories that drifts out of date
// every time a dependency is added or upgraded.
export async function runPrivacyManifestAggregate(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<PrivacyManifestAggregateStepData>;
  if (!d.scanRoot || d.scanRoot.trim().length === 0) {
    throw new Error('privacyManifestAggregate: missing "scanRoot"');
  }
  if (!d.outputPath || d.outputPath.trim().length === 0) {
    throw new Error('privacyManifestAggregate: missing "outputPath"');
  }

  // 1. Find all dependency manifests.
  const findCmd = `find ${shellQuote(d.scanRoot.trim())} -name 'PrivacyInfo.xcprivacy' -type f`;
  ctx.log(findCmd);
  const found = await captureMaybeRemote({ ctx, d, command: findCmd });
  const paths = found
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  ctx.log(`discovered ${paths.length} privacy manifests`);

  // 2. plutil-convert each one + merge the categories. We assemble the
  // aggregate as JSON, then plutil-convert back to xml1.
  const aggregate: {
    NSPrivacyAccessedAPITypes: Array<{ NSPrivacyAccessedAPIType: string; NSPrivacyAccessedAPITypeReasons: string[] }>;
    NSPrivacyTracking: boolean;
    NSPrivacyTrackingDomains: string[];
    NSPrivacyCollectedDataTypes: unknown[];
  } = {
    NSPrivacyAccessedAPITypes: [],
    NSPrivacyTracking: false,
    NSPrivacyTrackingDomains: [],
    NSPrivacyCollectedDataTypes: [],
  };
  const seenApiTypes = new Map<string, Set<string>>();

  for (const p of paths) {
    const dump = await captureMaybeRemote({
      ctx,
      d,
      command: `plutil -convert json -o - ${shellQuote(p)}`,
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(dump);
    } catch {
      ctx.log(`skipping unparseable manifest: ${p}`, 'failure');
      continue;
    }
    if (!parsed || typeof parsed !== 'object') continue;
    const root = parsed as Record<string, unknown>;
    const apis = Array.isArray(root.NSPrivacyAccessedAPITypes) ? root.NSPrivacyAccessedAPITypes : [];
    for (const entry of apis as Array<Record<string, unknown>>) {
      const cat = entry.NSPrivacyAccessedAPIType;
      if (typeof cat !== 'string') continue;
      const reasons = Array.isArray(entry.NSPrivacyAccessedAPITypeReasons)
        ? (entry.NSPrivacyAccessedAPITypeReasons as string[])
        : [];
      let bucket = seenApiTypes.get(cat);
      if (!bucket) {
        bucket = new Set();
        seenApiTypes.set(cat, bucket);
      }
      for (const r of reasons) bucket.add(r);
    }
  }

  for (const [cat, reasons] of seenApiTypes) {
    aggregate.NSPrivacyAccessedAPITypes.push({
      NSPrivacyAccessedAPIType: cat,
      NSPrivacyAccessedAPITypeReasons: [...reasons],
    });
  }

  // 3. Drop the merged plist alongside the project's own manifest. We avoid
  // overwriting an existing manifest unless overwrite=true — manual
  // additions in the existing file would otherwise be silently lost.
  const overwrite = d.overwrite === 'true';
  const writeJsonCmd =
    `cat > ${shellQuote(d.outputPath.trim())} << 'BUILDPILOT_PLIST_EOF'\n` +
    JSON.stringify(aggregate, null, 2) +
    `\nBUILDPILOT_PLIST_EOF\n` +
    `plutil -convert xml1 ${shellQuote(d.outputPath.trim())}`;
  // Skip if file exists and not overwriting.
  const guarded = overwrite
    ? writeJsonCmd
    : `if [ -e ${shellQuote(d.outputPath.trim())} ]; then echo 'aggregate exists; not overwriting'; exit 0; fi\n${writeJsonCmd}`;
  await captureMaybeRemote({ ctx, d, command: guarded });
  ctx.log(`wrote aggregated manifest to ${d.outputPath}`, 'success');
}
