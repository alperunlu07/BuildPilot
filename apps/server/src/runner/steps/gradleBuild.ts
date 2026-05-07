import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { GradleBuildStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { insertBuildArtifact } from '../../store/buildArtifacts';

// Pure argv-builder split out of the runner so it can be exercised by unit
// tests without invoking gradle. Returns the task list (no flags from
// gradleArgs) — the caller appends gradleArgs verbatim.
export function buildGradleArgs(d: Partial<GradleBuildStepData>): string[] {
  const output = d.output ?? 'apk';
  const variant = (d.variant && d.variant.trim().length > 0 ? d.variant : 'Release').trim();
  const moduleRaw = d.module === undefined ? ':app' : d.module.trim();

  const args: string[] = [];

  if (output === 'custom') {
    const task = d.gradleTask?.trim();
    if (!task || task.length === 0) {
      throw new Error('gradleBuild: output=custom requires "gradleTask"');
    }
    args.push(task);
  } else {
    const verb = output === 'aab' ? 'bundle' : 'assemble';
    const taskName = `${verb}${variant}`;
    args.push(moduleRaw.length > 0 ? `${moduleRaw}:${taskName}` : taskName);
  }

  if (d.gradleArgs && d.gradleArgs.trim().length > 0) {
    args.push(...d.gradleArgs.split(/\s+/).filter(Boolean));
  }
  return args;
}

// Walk app/build/outputs (or the equivalent under any module's build dir) for
// freshly-produced APKs/AABs whose mtime is at or after `since`. We don't
// trust gradle to print a stable absolute path in stdout — easier to stat
// the standard output dirs after the fact.
async function findFreshArtifacts(
  projectRoot: string,
  moduleSegment: string,
  output: 'apk' | 'aab' | 'custom',
  since: number,
): Promise<string[]> {
  // ":app" → "app", ":lib:foo" → "lib/foo", "" (root) → ""
  const modPath = moduleSegment.replace(/^:/, '').split(':').filter(Boolean).join('/');
  const buildDir = modPath.length > 0
    ? join(projectRoot, modPath, 'build', 'outputs')
    : join(projectRoot, 'build', 'outputs');

  const stat = await fs.stat(buildDir).catch(() => null);
  if (!stat || !stat.isDirectory()) return [];

  const exts = output === 'aab' ? ['.aab'] : output === 'apk' ? ['.apk'] : ['.apk', '.aab'];
  const out: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && exts.some((x) => e.name.toLowerCase().endsWith(x))) {
        const fileStat = await fs.stat(p).catch(() => null);
        if (fileStat && fileStat.mtimeMs >= since - 1000) out.push(p);
      }
    }
  }
  await walk(buildDir);
  return out;
}

export async function runGradleBuild(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<GradleBuildStepData>;
  const args = buildGradleArgs(d);

  const cwd = d.cwd && d.cwd.trim().length > 0
    ? (isAbsolute(d.cwd) ? d.cwd : join(ctx.project.path, d.cwd))
    : ctx.project.path;

  const isWindows = process.platform === 'win32';
  // Gradle Wrapper: gradlew.bat on Windows, ./gradlew on POSIX. Spawn the
  // wrapper directly rather than via shell so non-zero exits surface cleanly.
  const wrapper = isWindows ? 'gradlew.bat' : './gradlew';

  ctx.log(`${wrapper} ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);
  ctx.log(`cwd: ${cwd}`);

  const startedAt = Date.now();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(wrapper, args, {
      cwd,
      env: process.env,
      // shell:true on Windows lets cmd resolve gradlew.bat without an
      // explicit .bat extension search, and matches how users would run it.
      shell: isWindows,
    });
    ctx.attachProcess(child);
    child.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        reject(new Error(`${wrapper} not found in ${cwd} — is this an Android Gradle project?`));
      } else {
        reject(err);
      }
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`gradle exited with code ${code}`));
    });
  });

  const wantArtifacts = (d.registerArtifact ?? 'true') !== 'false';
  if (!wantArtifacts || d.output === 'custom') {
    if (d.output === 'custom') ctx.log('skipping artifact discovery (custom task)');
    return;
  }

  const moduleSegment = d.module === undefined ? ':app' : d.module;
  const matches = await findFreshArtifacts(
    cwd,
    moduleSegment,
    (d.output ?? 'apk') as 'apk' | 'aab' | 'custom',
    startedAt,
  );
  if (matches.length === 0) {
    ctx.log('(no APK/AAB found under build/outputs — gradle output dir may be customised)', 'stderr');
    return;
  }
  for (const path of matches) {
    const stat = await fs.stat(path).catch(() => null);
    if (!stat) continue;
    insertBuildArtifact({
      buildId: ctx.build.id,
      path,
      size: stat.size,
      mtime: stat.mtimeMs,
    });
    ctx.log(`+ artifact ${path} (${formatBytes(stat.size)})`, 'stdout');
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}
