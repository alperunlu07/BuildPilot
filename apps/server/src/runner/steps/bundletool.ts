import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { BundletoolStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { insertBuildArtifact } from '../../store/buildArtifacts';

// Pure argv builder for unit tests. Returns the args after the resolved
// bundletool binary — callers prepend the binary name themselves.
export function buildBundletoolArgs(d: Partial<BundletoolStepData>): string[] {
  const action = d.action ?? 'build-apks';
  if (!d.apksPath || d.apksPath.trim().length === 0) {
    throw new Error('bundletool: missing "apksPath"');
  }
  if (action === 'build-apks') {
    if (!d.bundlePath || d.bundlePath.trim().length === 0) {
      throw new Error('bundletool build-apks: missing "bundlePath"');
    }
    const args = ['build-apks', `--bundle=${d.bundlePath.trim()}`, `--output=${d.apksPath.trim()}`];
    if (d.universalMode === 'true') args.push('--mode=universal');
    if (d.keystorePath && d.keystorePath.trim().length > 0) {
      args.push(`--ks=${d.keystorePath.trim()}`);
      if (d.androidKeystorePassword) {
        args.push(`--ks-pass=pass:${d.androidKeystorePassword}`);
      }
      if (d.keyAlias && d.keyAlias.trim().length > 0) {
        args.push(`--ks-key-alias=${d.keyAlias.trim()}`);
      }
      if (d.androidKeyPassword) {
        args.push(`--key-pass=pass:${d.androidKeyPassword}`);
      }
    }
    if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
      args.push(...d.additionalArgs.split(/\s+/).filter(Boolean));
    }
    return args;
  }
  if (action === 'install-apks') {
    const args = ['install-apks', `--apks=${d.apksPath.trim()}`];
    if (d.serial && d.serial.trim().length > 0) {
      args.push(`--device-id=${d.serial.trim()}`);
    }
    if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
      args.push(...d.additionalArgs.split(/\s+/).filter(Boolean));
    }
    return args;
  }
  throw new Error(`bundletool: invalid action "${action}"`);
}

// Resolve `bundletoolPath` — empty falls back to "bundletool" on PATH, which
// matches the homebrew / pip wrappers most users have. Operators on a raw
// .jar set bundletoolPath to e.g. "java -jar bundletool-all.jar"; we don't
// shell-split that for them (would break -ks-pass=pass: literals with
// spaces). Use `additionalArgs` if you need extra java flags.
function resolveBundletool(s?: string): { bin: string; preArgs: string[] } {
  const v = s?.trim();
  if (!v || v.length === 0) return { bin: 'bundletool', preArgs: [] };
  // Allow "java -jar bundletool-all.jar" without further parsing — split on
  // single spaces. Users with paths-with-spaces should symlink first.
  const tokens = v.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { bin: 'bundletool', preArgs: [] };
  return { bin: tokens[0]!, preArgs: tokens.slice(1) };
}

export async function runBundletool(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<BundletoolStepData>;
  const subArgs = buildBundletoolArgs(d);
  const { bin, preArgs } = resolveBundletool(d.bundletoolPath);
  const args = [...preArgs, ...subArgs];

  // Mask password flags before logging the command. Keep the literal in args
  // so bundletool sees the real value — only the displayed line is redacted.
  const redacted = args.map((a) =>
    a.startsWith('--ks-pass=pass:') || a.startsWith('--key-pass=pass:')
      ? a.replace(/=pass:.*/, '=pass:••••')
      : a,
  );
  ctx.log(`${bin} ${redacted.join(' ')}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { env: process.env });
    ctx.attachProcess(child);
    child.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        reject(new Error(`${bin} not found — install bundletool or set "bundletoolPath"`));
      } else {
        reject(err);
      }
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`bundletool exited with code ${code}`));
    });
  });

  // Register the produced .apks as a build artifact on the build-apks path,
  // mirroring gradleBuild's behaviour for downstream s3Upload / install steps.
  if ((d.action ?? 'build-apks') === 'build-apks') {
    const raw = d.apksPath!.trim();
    const abs = isAbsolute(raw) ? raw : join(ctx.project.path, raw);
    const stat = await fs.stat(abs).catch(() => null);
    if (stat?.isFile()) {
      insertBuildArtifact({
        buildId: ctx.build.id,
        path: abs,
        size: stat.size,
        mtime: stat.mtimeMs,
      });
      ctx.log(`+ artifact ${abs} (${stat.size} bytes)`, 'stdout');
    } else {
      ctx.log(`(bundletool produced no file at ${abs})`, 'stderr');
    }
  }
}
