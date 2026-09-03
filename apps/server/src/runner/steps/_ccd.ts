import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { CcdTargetFields } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';

// Public read host Addressables players fetch content from. The management
// API (`ugs`) addresses buckets by UUID, and so does this URL — which is why
// resolveBucketId exists even though pipelines are authored with bucket names.
const CCD_CLIENT_HOST = 'client-api.unity3dusercontent.com';

export const DEFAULT_ENVIRONMENT = 'production';
export const DEFAULT_BADGE = 'latest';

// npm ships `ugs` as a launcher that re-concatenates its argv into a single
// shell string. Concatenation is not quoting, so `-n release notes` arrives
// as three arguments and the CLI rejects the last two. Wrapping the value in
// literal quotes survives that round-trip: the shell we spawn strips its own
// layer, the launcher concatenates what's left, and the CLI's parser sees a
// properly quoted token.
//
// A real (non-npm) `ugs` binary parses argv directly and would take those
// quotes as part of the value, hence the 'native' escape hatch.
// These commands run through `spawn(..., { shell: true })`, so every argument
// is shell syntax until it is quoted. Two rules keep that honest:
//
// BARE_TOKEN is the set that may be emitted unquoted. Quoting used to depend
// on whitespace alone, which let a value like `a&calc.bundle` through raw —
// and bundle names are NOT hand-authored, they come off the filesystem and out
// of the catalog's m_InternalIds, so "the pipeline author would have to type
// it" is not a defence. Anything outside the set is quoted instead.
//
// EXPANDS_INSIDE_QUOTES is what no quoting can save us from: POSIX expands
// ` and $ inside double quotes, cmd.exe expands %VAR%, and a newline ends the
// command outright. We spawn whichever shell the platform gives us, so there
// is no single escaping that covers both — such a value is refused rather
// than silently rewritten into something that runs.
const BARE_TOKEN = /^[A-Za-z0-9._+=:@/,-]+$/;
const EXPANDS_INSIDE_QUOTES = /[`$%\r\n]/;

function assertNoShellExpansion(value: string, what: string): void {
  if (!EXPANDS_INSIDE_QUOTES.test(value)) return;
  const shown = value.length > 60 ? `${value.slice(0, 59)}…` : value;
  throw new Error(
    `ccd: refusing to build a ugs command — ${what} contains a backtick, "$", "%" or a newline, ` +
      `which stays live inside shell quotes on Windows or POSIX (value: ${shown})`,
  );
}

export function ugsQuote(value: string, mode: string | undefined): string {
  assertNoShellExpansion(value, 'an argument');
  const cleaned = value.replace(/"/g, '');
  if (BARE_TOKEN.test(cleaned)) return cleaned;
  const native = (mode ?? 'shim') === 'native';
  return native ? `"${cleaned}"` : `"\\"${cleaned}\\""`;
}

export function buildUgsCommand(d: Partial<CcdTargetFields>, args: readonly string[]): string {
  const launcher = d.ugsPath && d.ugsPath.trim().length > 0 ? d.ugsPath.trim() : 'ugs';
  assertNoShellExpansion(launcher, '"ugsPath"');
  // The launcher is consumed by the shell itself, never by the npm shim's
  // argv re-concatenation, so it takes plain quotes in both modes.
  const cleanedLauncher = launcher.replace(/"/g, '');
  const quotedLauncher = BARE_TOKEN.test(cleanedLauncher)
    ? cleanedLauncher
    : `"${cleanedLauncher}"`;
  return [quotedLauncher, ...args.map((a) => ugsQuote(a, d.argQuoting))].join(' ');
}

// Common `-p/-e` tail. Both are optional: `ugs` falls back to the logged-in
// defaults, which is the normal case on a builder that ran `ugs login` once.
export function ugsTargetArgs(d: Partial<CcdTargetFields>): string[] {
  const args: string[] = [];
  const env = d.environmentName?.trim();
  args.push('-e', env && env.length > 0 ? env : DEFAULT_ENVIRONMENT);
  const project = d.ugsProjectId?.trim();
  if (project && project.length > 0) args.push('-p', project);
  return args;
}

// `ugs --json` prints the payload array and then a second array of
// informational messages ("Listing items 1-100/1303"). JSON.parse chokes on
// the pair, so decode successive values instead and hand back the first —
// the payload — with the rest discarded.
export function parseUgsJson(stdout: string): unknown {
  const values: unknown[] = [];
  let rest = stdout;
  while (rest.trim().length > 0) {
    const start = rest.search(/[[{]/);
    if (start < 0) break;
    rest = rest.slice(start);
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let i = 0; i < rest.length; i++) {
      const ch = rest[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = !inString;
      if (inString) continue;
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end < 0) break;
    try {
      values.push(JSON.parse(rest.slice(0, end)));
    } catch {
      // Not JSON after all (a stray warning line) — skip past it and retry.
    }
    rest = rest.slice(end);
  }
  if (values.length === 0) {
    throw new Error(`ugs: no JSON in output — ${stdout.slice(0, 200)}`);
  }
  return values[0];
}

// Run a `ugs` command and return stdout. Node's deprecation warnings from the
// npm launcher go to stderr and are not worth surfacing per call, so stderr is
// only reported when the command fails.
export async function runUgs(
  ctx: StepContext,
  d: Partial<CcdTargetFields>,
  args: readonly string[],
  opts?: { quiet?: boolean },
): Promise<string> {
  const command = buildUgsCommand(d, args);
  if (!opts?.quiet) ctx.log(`ccd: ${command}`);
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, { shell: true, cwd: ctx.project.path, env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      const detail = [stdout, stderr]
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .join('\n')
        .slice(0, 500);
      reject(new Error(`ugs exited with code ${code}${detail ? `: ${detail}` : ''}`));
    });
  });
}

export async function runUgsJson(
  ctx: StepContext,
  d: Partial<CcdTargetFields>,
  args: readonly string[],
  opts?: { quiet?: boolean },
): Promise<unknown> {
  return parseUgsJson(await runUgs(ctx, d, [...args, '-j'], opts));
}

export async function resolveBucketId(
  ctx: StepContext,
  d: Partial<CcdTargetFields>,
): Promise<string> {
  const bucket = d.bucketName?.trim();
  if (!bucket || bucket.length === 0) throw new Error('ccd: missing "bucketName"');
  const list = (await runUgsJson(ctx, d, ['ccd', 'buckets', 'list', ...ugsTargetArgs(d)])) as
    | Array<{ Id?: string; Name?: string }>
    | undefined;
  const hit = Array.isArray(list) ? list.find((b) => b.Name === bucket) : undefined;
  if (!hit?.Id) {
    const names = Array.isArray(list) ? list.map((b) => b.Name).join(', ') : '(none)';
    throw new Error(`ccd: no bucket named "${bucket}" — buckets in this project: ${names}`);
  }
  return hit.Id;
}

// Paginate `entries list` into a name set. The API caps per-page at 100, so a
// bucket holding a few thousand entries needs a walk; the loop stops on a
// short page rather than trusting the reported total.
export async function listEntryNames(
  ctx: StepContext,
  d: Partial<CcdTargetFields>,
  bucket: string,
): Promise<Set<string>> {
  const names = new Set<string>();
  const perPage = 100;
  for (let page = 1; page <= 200; page++) {
    const rows = (await runUgsJson(
      ctx,
      d,
      ['ccd', 'entries', 'list', '-b', bucket, '-pp', String(perPage), '-pa', String(page), ...ugsTargetArgs(d)],
      { quiet: true },
    )) as Array<{ Name?: string }> | undefined;
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const r of rows) if (r.Name) names.add(r.Name);
    if (rows.length < perPage) break;
  }
  return names;
}

export function resolveUnderProject(projectRoot: string, p: string): string {
  return isAbsolute(p) ? p : join(projectRoot, p);
}

// `ugs` resolves a local path argument against the process working directory,
// which for a step is the project root — not the content directory — so paths
// handed to it must be absolute.
//
// Forward slashes on purpose: .NET accepts them on Windows, and they keep a
// path clear of the backslash-versus-quote interaction that a spaced project
// directory would otherwise run into once ugsQuote wraps the value.
export function ugsPathArg(absolutePath: string): string {
  return absolutePath.replace(/\\/g, '/');
}

// Newest file matching a pattern, by mtime. Addressables names catalogs after
// the player version (catalog_0.0.53.json), so "newest" — not "highest" — is
// the honest pick: a version can be rebuilt, and a rollback lowers the number.
export async function newestMatching(dir: string, re: RegExp): Promise<string | null> {
  const names = await fs.readdir(dir);
  const matches = names.filter((n) => re.test(n));
  let best: { name: string; mtime: number } | null = null;
  for (const name of matches) {
    const st = await fs.stat(join(dir, name)).catch(() => null);
    if (!st?.isFile()) continue;
    if (!best || st.mtimeMs > best.mtime) best = { name, mtime: st.mtimeMs };
  }
  return best?.name ?? null;
}

// Bundle file names an Addressables catalog resolves at runtime. Local-group
// bundles ship inside the player and appear here too; callers filter those out
// by checking which ones actually exist in the CCD output directory.
export function catalogBundleNames(catalog: unknown): string[] {
  const ids = (catalog as { m_InternalIds?: unknown })?.m_InternalIds;
  if (!Array.isArray(ids)) {
    throw new Error('ccd: catalog has no "m_InternalIds" array — not an Addressables catalog?');
  }
  const out = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string' || !id.toLowerCase().endsWith('.bundle')) continue;
    const base = id.split(/[\\/]/).pop();
    if (base) out.add(base);
  }
  return [...out].sort();
}

export function ccdContentUrl(opts: {
  projectId: string;
  environmentName: string;
  bucketId: string;
  badge: string;
  path: string;
}): string {
  const { projectId, environmentName, bucketId, badge, path } = opts;
  return (
    `https://${projectId}.${CCD_CLIENT_HOST}/client_api/v1/environments/` +
    `${encodeURIComponent(environmentName)}/buckets/${encodeURIComponent(bucketId)}` +
    `/release_by_badge/${encodeURIComponent(badge)}/entry_by_path/content/?path=/${encodeURIComponent(path)}`
  );
}

// The project id is part of the public content hostname, so it has to be known
// even when the pipeline leaves it blank for `ugs` to default.
export async function resolveProjectId(
  ctx: StepContext,
  d: Partial<CcdTargetFields>,
): Promise<string> {
  const explicit = d.ugsProjectId?.trim();
  if (explicit && explicit.length > 0) return explicit;
  const out = await runUgs(ctx, d, ['config', 'get', 'project-id'], { quiet: true });
  const id = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^[0-9a-f-]{36}$/i.test(l));
  if (!id) {
    throw new Error('ccd: could not determine the UGS project id — set "ugsProjectId" on the step');
  }
  return id;
}
