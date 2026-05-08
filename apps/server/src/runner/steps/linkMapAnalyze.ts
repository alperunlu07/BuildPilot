import { readFile } from 'node:fs/promises';
import type { LinkMapAnalyzeStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';

// Parse a link map (`-Wl,-map,<file>` or Xcode "Write Link Map File"
// build setting) and emit per-module byte attribution. Sums object-file
// sizes by their first path component (typically the module / framework
// name); produces a Caliper-/EmergeTools-style top-N table.
export interface ModuleSize {
  module: string;
  bytes: number;
  objectCount: number;
}

const FILE_SECTION = /^# Object files:\s*$/;
const FILE_LINE = /^\[\s*\d+\]\s+(.+)$/;
const SYM_SECTION = /^# Symbols:\s*$/;
const SYM_LINE = /^0x[0-9A-Fa-f]+\s+0x([0-9A-Fa-f]+)\s+\[\s*(\d+)\s*\]\s+(.+)$/;

export function parseLinkMap(content: string): ModuleSize[] {
  const fileNames = new Map<number, string>();
  const lines = content.split(/\r?\n/);
  let mode: 'header' | 'files' | 'symbols' = 'header';
  for (const raw of lines) {
    const line = raw;
    if (FILE_SECTION.test(line)) {
      mode = 'files';
      continue;
    }
    if (SYM_SECTION.test(line)) {
      mode = 'symbols';
      continue;
    }
    if (mode === 'files') {
      const m = FILE_LINE.exec(line.trim());
      if (m && m[1]) {
        const idxMatch = /^\[\s*(\d+)\]/.exec(line.trim());
        if (idxMatch && idxMatch[1]) fileNames.set(Number.parseInt(idxMatch[1], 10), m[1].trim());
      }
    }
  }

  // Pass 2: walk symbols, attribute size to each file's module.
  const tally = new Map<string, ModuleSize>();
  mode = 'header';
  for (const raw of lines) {
    if (FILE_SECTION.test(raw)) {
      mode = 'files';
      continue;
    }
    if (SYM_SECTION.test(raw)) {
      mode = 'symbols';
      continue;
    }
    if (mode !== 'symbols') continue;
    const m = SYM_LINE.exec(raw);
    if (!m || !m[1] || !m[2]) continue;
    const size = Number.parseInt(m[1], 16);
    const fileIdx = Number.parseInt(m[2], 10);
    const file = fileNames.get(fileIdx);
    if (!file) continue;
    const moduleName = extractModule(file);
    let entry = tally.get(moduleName);
    if (!entry) {
      entry = { module: moduleName, bytes: 0, objectCount: 0 };
      tally.set(moduleName, entry);
    }
    entry.bytes += size;
    entry.objectCount += 1;
  }
  return [...tally.values()].sort((a, b) => b.bytes - a.bytes);
}

export function extractModule(path: string): string {
  // CocoaPods / Carthage / SPM modules sit at .../ModuleName.framework/...
  // or .../ModuleName.build/Objects-normal/arm64/Foo.o
  const fwk = /\/([^/]+)\.framework\//.exec(path);
  if (fwk && fwk[1]) return fwk[1];
  const build = /\/([^/]+)\.build\//.exec(path);
  if (build && build[1]) return build[1];
  // Pod sources
  const pods = /\/Pods\/([^/]+)\//.exec(path);
  if (pods && pods[1]) return pods[1];
  // App's own object files — bucketed under "(App)"
  const ofile = /\/([^/]+\.o)$/.exec(path);
  if (ofile && ofile[1]) return '(App)';
  return path.split('/').pop() ?? path;
}

export async function runLinkMapAnalyze(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<LinkMapAnalyzeStepData>;
  if (!d.mapPath || d.mapPath.trim().length === 0) {
    throw new Error('linkMapAnalyze: missing "mapPath"');
  }
  const content = await readFile(d.mapPath, 'utf-8');
  const modules = parseLinkMap(content);
  const top = d.topN ? Number(d.topN) : 20;
  ctx.log(`top ${Math.min(top, modules.length)} modules by binary contribution:`);
  for (const m of modules.slice(0, top)) {
    ctx.log(`  ${(m.bytes / 1024).toFixed(1).padStart(10)} KB  ${m.module}  (${m.objectCount} objs)`);
  }
  ctx.log(`total binary: ${(modules.reduce((acc, m) => acc + m.bytes, 0) / 1024 / 1024).toFixed(2)} MB`, 'success');
}
