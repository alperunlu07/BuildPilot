import { spawn } from 'node:child_process';
import type { AndroidSignStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';

// Map a boolean-ish string ('true' / 'false') to apksigner's --vN-signing-enabled
// flag. Returns `null` to leave the flag off entirely so apksigner uses its
// own defaults.
function flagFromBool(value: string | undefined, flag: string): string | null {
  if (value === 'true') return `${flag}=true`;
  if (value === 'false') return `${flag}=false`;
  return null;
}

interface ResolvedAndroidSign {
  bin: string;
  args: string[];
  // Hidden values for the spawn step to suppress in log output.
  redactValues: string[];
}

export function buildAndroidSignInvocation(
  d: Partial<AndroidSignStepData>,
): ResolvedAndroidSign {
  const action = d.action ?? 'sign';
  if (!d.apkPath || d.apkPath.trim().length === 0) {
    throw new Error('androidSign: missing "apkPath"');
  }
  if (action === 'sign') {
    const apksigner = d.apksignerPath && d.apksignerPath.trim().length > 0
      ? d.apksignerPath.trim()
      : 'apksigner';
    if (!d.keystorePath || d.keystorePath.trim().length === 0) {
      throw new Error('androidSign sign: missing "keystorePath"');
    }
    if (!d.androidKeystorePassword) {
      throw new Error('androidSign sign: missing "androidKeystorePassword"');
    }
    const args: string[] = ['sign', '--ks', d.keystorePath.trim()];
    args.push('--ks-pass', `pass:${d.androidKeystorePassword}`);
    if (d.keyAlias && d.keyAlias.trim().length > 0) {
      args.push('--ks-key-alias', d.keyAlias.trim());
    }
    if (d.androidKeyPassword) {
      args.push('--key-pass', `pass:${d.androidKeyPassword}`);
    }
    for (const [name, version] of [
      ['v1', d.v1],
      ['v2', d.v2],
      ['v3', d.v3],
      ['v4', d.v4],
    ] as const) {
      const flag = flagFromBool(version, `--${name}-signing-enabled`);
      if (flag) args.push(flag);
    }
    if (d.outputPath && d.outputPath.trim().length > 0) {
      args.push('--out', d.outputPath.trim());
    }
    if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
      args.push(...d.additionalArgs.split(/\s+/).filter(Boolean));
    }
    args.push(d.apkPath.trim());
    return {
      bin: apksigner,
      args,
      redactValues: [d.androidKeystorePassword, d.androidKeyPassword ?? ''].filter(Boolean),
    };
  }
  if (action === 'verify') {
    const apksigner = d.apksignerPath && d.apksignerPath.trim().length > 0
      ? d.apksignerPath.trim()
      : 'apksigner';
    const args: string[] = ['verify', '--verbose'];
    if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
      args.push(...d.additionalArgs.split(/\s+/).filter(Boolean));
    }
    args.push(d.apkPath.trim());
    return { bin: apksigner, args, redactValues: [] };
  }
  if (action === 'jarsign') {
    const jarsigner = d.jarsignerPath && d.jarsignerPath.trim().length > 0
      ? d.jarsignerPath.trim()
      : 'jarsigner';
    if (!d.keystorePath || d.keystorePath.trim().length === 0) {
      throw new Error('androidSign jarsign: missing "keystorePath"');
    }
    if (!d.androidKeystorePassword) {
      throw new Error('androidSign jarsign: missing "androidKeystorePassword"');
    }
    const args: string[] = [
      '-verbose',
      '-sigalg', 'SHA256withRSA',
      '-digestalg', 'SHA-256',
      '-keystore', d.keystorePath.trim(),
      '-storepass', d.androidKeystorePassword,
    ];
    if (d.androidKeyPassword) {
      args.push('-keypass', d.androidKeyPassword);
    }
    if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
      args.push(...d.additionalArgs.split(/\s+/).filter(Boolean));
    }
    args.push(d.apkPath.trim());
    if (d.keyAlias && d.keyAlias.trim().length > 0) {
      args.push(d.keyAlias.trim());
    }
    return {
      bin: jarsigner,
      args,
      redactValues: [d.androidKeystorePassword, d.androidKeyPassword ?? ''].filter(Boolean),
    };
  }
  throw new Error(`androidSign: invalid action "${action}"`);
}

function redactLine(line: string, secrets: string[]): string {
  let out = line;
  for (const s of secrets) {
    if (s.length === 0) continue;
    out = out.split(s).join('••••');
  }
  return out;
}

export async function runAndroidSign(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<AndroidSignStepData>;
  const { bin, args, redactValues } = buildAndroidSignInvocation(d);
  ctx.log(redactLine(`${bin} ${args.join(' ')}`, redactValues));
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { env: process.env });
    ctx.attachProcess(child);
    child.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        reject(
          new Error(
            `${bin} not found — install Android Build Tools (apksigner) or the JDK (jarsigner) and set the appropriate path`,
          ),
        );
      } else {
        reject(err);
      }
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${bin} exited with code ${code}`));
    });
  });
}
