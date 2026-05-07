import { shellQuote } from './_exec';

// Whitespace-split an `additionalArgs` text field into shell-quoted tokens.
// Empty / whitespace-only input returns []. Used by the dozen+ step runners
// that surface a free-form "extra args" textbox.
export function splitAdditionalArgs(s: string | undefined): string[] {
  if (!s || s.trim().length === 0) return [];
  return s.split(/\s+/).filter(Boolean).map(shellQuote);
}

// Newline-split a multiline `paths` field into shell-quoted tokens. Trims
// each line and drops blanks. Used by swiftlint / swiftFormat / artifact /
// any step where the user types one path per line.
export function splitMultilinePaths(s: string | undefined): string[] {
  if (!s || s.trim().length === 0) return [];
  return s
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(shellQuote);
}

// Append `--workspace <path>` OR `--project <path>` (or `-workspace` /
// `-project` for xcodebuild's older flag style) onto an argv array. Centralises
// the "exactly one of workspacePath / projectPath" alternation that recurs
// in every step that drives xcodebuild / xcov / periphery / slather.
//
// Throws if neither field is set when `requireOne` is true. Mutates `parts`
// in place; returns nothing for chaining-friendly call sites that just
// pipe the array forward.
export function pushWorkspaceOrProject(
  parts: string[],
  d: { workspacePath?: string; projectPath?: string },
  opts: { workspaceFlag: string; projectFlag: string; requireOne?: boolean; stepName?: string },
): void {
  const ws = d.workspacePath?.trim();
  const proj = d.projectPath?.trim();
  if (ws && ws.length > 0) {
    parts.push(opts.workspaceFlag, shellQuote(ws));
  } else if (proj && proj.length > 0) {
    parts.push(opts.projectFlag, shellQuote(proj));
  } else if (opts.requireOne) {
    const name = opts.stepName ?? 'step';
    throw new Error(`${name}: requires either "workspacePath" or "projectPath"`);
  }
}
