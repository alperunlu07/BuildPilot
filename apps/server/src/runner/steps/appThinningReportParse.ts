import { readFile } from 'node:fs/promises';
import type { AppThinningReportParseStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';

// Parse `App Thinning Size Report.txt` produced by `xcodebuild -exportArchive
// -exportOptionsPlist <plist-with-thinning>`. Emits per-variant download/
// install sizes and gates the build on a configurable size delta vs a
// baseline file (typically the previous build's report committed to the repo
// or fetched from S3).
export interface VariantSize {
  name: string;
  appSizeBytes: number;
  downloadSizeBytes: number;
}

const SIZE_LINE = /^\s*(?:App size|Download size|App\s+size|Download\s+size)\s*[:\-]\s*([\d,]+(?:\.\d+)?)\s*(KB|MB|GB|bytes)?/i;
const VARIANT_HEADER = /^Variant: (.+)$/;

function toBytes(num: number, unit: string | undefined): number {
  const u = (unit ?? 'bytes').toLowerCase();
  if (u === 'kb') return Math.round(num * 1024);
  if (u === 'mb') return Math.round(num * 1024 * 1024);
  if (u === 'gb') return Math.round(num * 1024 * 1024 * 1024);
  return Math.round(num);
}

export function parseAppThinningReport(content: string): VariantSize[] {
  const out: VariantSize[] = [];
  let current: VariantSize | null = null;
  let lastWas: 'app' | 'download' | null = null;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const variantMatch = VARIANT_HEADER.exec(line);
    if (variantMatch && variantMatch[1]) {
      if (current) out.push(current);
      current = { name: variantMatch[1].trim(), appSizeBytes: 0, downloadSizeBytes: 0 };
      lastWas = null;
      continue;
    }
    if (!current) continue;
    if (/^app size/i.test(line)) {
      const m = SIZE_LINE.exec(line);
      if (m && m[1]) current.appSizeBytes = toBytes(parseFloat(m[1].replace(/,/g, '')), m[2]);
      lastWas = 'app';
      continue;
    }
    if (/^download size/i.test(line)) {
      const m = SIZE_LINE.exec(line);
      if (m && m[1]) current.downloadSizeBytes = toBytes(parseFloat(m[1].replace(/,/g, '')), m[2]);
      lastWas = 'download';
      continue;
    }
    void lastWas;
  }
  if (current) out.push(current);
  return out;
}

export interface SizeDelta {
  variant: string;
  appDeltaBytes: number;
  downloadDeltaBytes: number;
  appPctChange: number;
  downloadPctChange: number;
}

export function diffReports(current: VariantSize[], baseline: VariantSize[]): SizeDelta[] {
  const baseMap = new Map(baseline.map((v) => [v.name, v]));
  const out: SizeDelta[] = [];
  for (const v of current) {
    const base = baseMap.get(v.name);
    if (!base) continue;
    const appDelta = v.appSizeBytes - base.appSizeBytes;
    const downloadDelta = v.downloadSizeBytes - base.downloadSizeBytes;
    out.push({
      variant: v.name,
      appDeltaBytes: appDelta,
      downloadDeltaBytes: downloadDelta,
      appPctChange: base.appSizeBytes > 0 ? (appDelta / base.appSizeBytes) * 100 : 0,
      downloadPctChange: base.downloadSizeBytes > 0 ? (downloadDelta / base.downloadSizeBytes) * 100 : 0,
    });
  }
  return out;
}

export async function runAppThinningReportParse(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<AppThinningReportParseStepData>;
  if (!d.reportPath || d.reportPath.trim().length === 0) {
    throw new Error('appThinningReportParse: missing "reportPath"');
  }
  const content = await readFile(d.reportPath, 'utf-8');
  const variants = parseAppThinningReport(content);
  ctx.log(`${variants.length} variant(s):`);
  for (const v of variants) {
    ctx.log(
      `  ${v.name}: app=${(v.appSizeBytes / 1024 / 1024).toFixed(2)} MB, download=${(v.downloadSizeBytes / 1024 / 1024).toFixed(2)} MB`,
    );
  }
  if (d.baselineReportPath && d.baselineReportPath.trim().length > 0) {
    const baseContent = await readFile(d.baselineReportPath, 'utf-8');
    const baseline = parseAppThinningReport(baseContent);
    const deltas = diffReports(variants, baseline);
    let worst = 0;
    for (const dlt of deltas) {
      ctx.log(
        `  ${dlt.variant}: Δapp=${(dlt.appDeltaBytes / 1024 / 1024).toFixed(2)} MB (${dlt.appPctChange.toFixed(1)}%), ` +
          `Δdownload=${(dlt.downloadDeltaBytes / 1024 / 1024).toFixed(2)} MB (${dlt.downloadPctChange.toFixed(1)}%)`,
      );
      if (dlt.appPctChange > worst) worst = dlt.appPctChange;
    }
    const limit = d.maxAppGrowthPct ? Number(d.maxAppGrowthPct) : NaN;
    if (Number.isFinite(limit) && worst > limit) {
      throw new Error(
        `appThinningReportParse: worst variant grew ${worst.toFixed(1)}% (limit ${limit}%)`,
      );
    }
  }
  ctx.log('appThinningReportParse ok', 'success');
}
