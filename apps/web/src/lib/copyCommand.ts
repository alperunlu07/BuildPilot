import type { BuildLogEntry, StepType } from '@buildpilot/shared-types';
import { stripAnsi } from './ansi';

// Step types whose `info`-level log entries reliably contain the literal
// shell command the engine executed. Each step prefixes the command line
// itself — `shell` uses `$ `, others log the binary + args directly.
const COMMAND_BEARING_STEPS: Partial<Record<StepType, true>> = {
  shell: true,
  xcodebuild: true,
  xcodebuildAnalyze: true,
  gradleBuild: true,
  remoteSsh: true,
  pull: true,
  fastlaneMatch: true,
  cocoapodsInstall: true,
  swiftPackageResolve: true,
  unityBatch: true,
  bundletool: true,
  androidSign: true,
  swiftlint: true,
  swiftFormat: true,
  notarize: true,
  stapleNotarization: true,
  buildAppGym: true,
  steamUpload: true,
};

// Heuristic: returns the command to copy, or null if the entry doesn't
// look like an executed shell line. Only acts on `info` entries (where
// the engine emits its command echo) plus shell-style `$ ` lines that
// some steps push at any level.
export function commandFromEntry(entry: BuildLogEntry): string | null {
  if (!entry.nodeId) return null;
  const plain = stripAnsi(entry.message).trimEnd();
  if (plain.length === 0) return null;
  // shell step: `$ <cmd>` — strip prefix.
  if (plain.startsWith('$ ')) return plain.slice(2);
  // Don't trigger for cwd / informational lines.
  if (/^cwd:\s/.test(plain)) return null;
  if (/^remote:\s/.test(plain)) return plain.slice('remote:'.length).trim();
  if (entry.level !== 'info') return null;
  if (!entry.stepType || !COMMAND_BEARING_STEPS[entry.stepType]) return null;
  // For commandlike steps the info line starts with the binary name —
  // e.g. `xcodebuild …`, `gradlew …`. Anything else (e.g. `cwd: /tmp`)
  // wouldn't survive the `cwd:` filter above. Some steps also log
  // status updates ("opened edit abc"); reject lines without an obvious
  // binary token.
  if (!/^\s*[\w./-]+(\s|$)/.test(plain)) return null;
  // Status-update guard: bail when the line reads like prose ("opened",
  // "wrote", "captured", "installed"). The engine prefixes these with
  // a verb in lower-case and a noun. A literal command always has the
  // binary first; the second token rarely is `: `.
  if (/^\s*\w+:\s/.test(plain)) return null;
  return plain;
}
