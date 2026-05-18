import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR } from '../paths';
import {
  markSecretUsed,
  resolveSecretsByName,
} from '../store/secrets';
import {
  getVaultFileMeta,
  markVaultFileUsed,
  readVaultFileContents,
} from '../store/vaultFiles';

// Cluster 11.B — `${{ secrets.NAME }}` / `${{ files.NAME }}` interpolation.
//
// The engine calls `interpolateStepData` immediately before invoking a
// step runner. The pass walks the data record, swapping every marker for
// either the secret plaintext (in-memory) or a temp path on disk that the
// step can read like any other file. Missing names are left as-is so the
// step can surface a clean "secret X not set" error rather than masking
// it with an empty string.
//
// File extraction targets `~/.buildpilot/tmp/<buildId>/<nodeId>/<filename>`.
// The caller MUST invoke the returned `cleanup()` once the step finishes
// so we don't leave plaintext copies of private keys / provisioning
// profiles lying around.

const SECRET_RE = /\$\{\{\s*secrets\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const FILE_RE = /\$\{\{\s*files\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export interface InterpolationContext {
  buildId: string;
  nodeId: string;
}

export interface InterpolationResult {
  // The interpolated copy of the step data. Strings that referenced an
  // existing secret/file are rewritten; everything else is identity.
  data: Record<string, unknown>;
  // Names of secrets/files that were referenced but not present in the
  // vault. The caller can decide whether to fail fast or warn-and-continue.
  missingSecrets: string[];
  missingFiles: string[];
  // Releases all extracted temp files. Idempotent.
  cleanup(): void;
}

// Pure helper exported for tests + the "where is this used?" scanner. Takes
// the template + an already-resolved context and returns the substituted
// string. Unknown names are left as the original marker so callers can
// distinguish "vault doesn't have it" from "step intentionally output the
// literal string".
export function interpolate(
  template: string,
  ctx: { secrets: Map<string, string>; files: Map<string, string> },
): string {
  const afterSecrets = template.replace(SECRET_RE, (match, name: string) => {
    const v = ctx.secrets.get(name);
    return v === undefined ? match : v;
  });
  return afterSecrets.replace(FILE_RE, (match, name: string) => {
    const v = ctx.files.get(name);
    return v === undefined ? match : v;
  });
}

// Scan a step data record for every secret/file name referenced. Used both
// to drive the resolver and to back the "where is this secret used?"
// endpoint.
export function collectReferences(data: unknown): {
  secrets: Set<string>;
  files: Set<string>;
} {
  const secrets = new Set<string>();
  const files = new Set<string>();
  function walk(v: unknown): void {
    if (typeof v === 'string') {
      for (const m of v.matchAll(SECRET_RE)) secrets.add(m[1]!);
      for (const m of v.matchAll(FILE_RE)) files.add(m[1]!);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (v && typeof v === 'object') {
      for (const item of Object.values(v as Record<string, unknown>)) walk(item);
    }
  }
  walk(data);
  return { secrets, files };
}

// Resolve every secret + file referenced in `data`, write extracted file
// contents to a per-build/per-node temp dir, and return a new data object
// with every marker substituted. The caller must invoke `cleanup()` once
// the step finishes (success, failure, or cancellation).
export function interpolateStepData(
  data: Record<string, unknown>,
  ctx: InterpolationContext,
): InterpolationResult {
  const { secrets: secretNames, files: fileNames } = collectReferences(data);
  if (secretNames.size === 0 && fileNames.size === 0) {
    return {
      data,
      missingSecrets: [],
      missingFiles: [],
      cleanup: () => undefined,
    };
  }

  const now = Date.now();
  const secretMap = resolveSecretsByName(secretNames);
  const missingSecrets = [...secretNames].filter((n) => !secretMap.has(n));
  for (const name of secretMap.keys()) {
    try {
      markSecretUsed(name, now);
    } catch {
      // best-effort — never block step execution on a write to last_used_at
    }
  }

  const tmpRoot = join(CONFIG_DIR, 'tmp', ctx.buildId, ctx.nodeId);
  const extractedPaths: string[] = [];
  const fileMap = new Map<string, string>();
  const missingFiles: string[] = [];
  if (fileNames.size > 0) {
    mkdirSync(tmpRoot, { recursive: true });
    for (const name of fileNames) {
      const meta = getVaultFileMeta(name);
      if (!meta) {
        missingFiles.push(name);
        continue;
      }
      const contents = readVaultFileContents(name);
      const target = join(tmpRoot, meta.filename);
      writeFileSync(target, contents);
      extractedPaths.push(target);
      fileMap.set(name, target);
      try {
        markVaultFileUsed(name, now);
      } catch {
        // best-effort
      }
    }
  }

  // Walk a deep clone and rewrite every string. Non-string values pass
  // through unchanged (numbers, booleans, etc).
  function rewrite(v: unknown): unknown {
    if (typeof v === 'string') {
      return interpolate(v, { secrets: secretMap, files: fileMap });
    }
    if (Array.isArray(v)) return v.map(rewrite);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = rewrite(val);
      }
      return out;
    }
    return v;
  }
  const interpolated = rewrite(data) as Record<string, unknown>;

  let disposed = false;
  return {
    data: interpolated,
    missingSecrets,
    missingFiles,
    cleanup() {
      if (disposed) return;
      disposed = true;
      for (const p of extractedPaths) {
        try {
          rmSync(p, { force: true });
        } catch {
          // ignore — file may have been moved by the step itself
        }
      }
      try {
        rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}

// Test-friendly export: build an InterpolationContext-equivalent result
// purely in-memory. Useful for unit tests that exercise the marker
// grammar without touching the DB or filesystem.
export const __testing = {
  SECRET_RE,
  FILE_RE,
  interpolate,
  collectReferences,
};
