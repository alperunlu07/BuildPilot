import type { AppStoreConnectApiStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { ascErrorMessage, ascRequest } from './_asc';

// Generic ASC API step — user supplies method + path + optional query/body
// JSON. The runner signs an ES256 JWT, fires the request, and surfaces the
// JSON response to the build log. Useful for the long tail of ASC operations
// we don't have dedicated steps for: listing apps, fetching builds, custom
// metadata patches, etc.
//
// Power users can pipe outputs into downstream steps via `${{ thisStep.x }}`
// once the step-output interpolation lands (Phase 4 Cluster C).
export interface BuildAscApiArgs {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number>;
  body?: unknown;
}

export function parseAscApiArgs(d: Partial<AppStoreConnectApiStepData>): BuildAscApiArgs {
  if (!d.path || d.path.trim().length === 0) {
    throw new Error('appStoreConnectApi: missing "path"');
  }
  const method = (d.method ?? 'GET') as BuildAscApiArgs['method'];
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) {
    throw new Error(`appStoreConnectApi: invalid method "${method}"`);
  }
  let query: Record<string, string | number> | undefined;
  if (d.queryJson && d.queryJson.trim().length > 0) {
    try {
      query = JSON.parse(d.queryJson) as Record<string, string | number>;
    } catch (err) {
      throw new Error(
        `appStoreConnectApi: queryJson is not valid JSON — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  let body: unknown;
  if (d.bodyJson && d.bodyJson.trim().length > 0) {
    try {
      body = JSON.parse(d.bodyJson);
    } catch (err) {
      throw new Error(
        `appStoreConnectApi: bodyJson is not valid JSON — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  return { method, path: d.path, query, body };
}

export async function runAppStoreConnectApi(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<AppStoreConnectApiStepData>;
  if (!d.keyId || !d.issuerId) {
    throw new Error('appStoreConnectApi: keyId + issuerId required');
  }
  const args = parseAscApiArgs(d);
  ctx.log(`asc ${args.method} ${args.path}`);
  const res = await ascRequest({
    creds: {
      keyId: d.keyId,
      issuerId: d.issuerId,
      privateKeyPath: d.apiKeyPath,
      privateKeyPem: d.apiKeyContents,
    },
    method: args.method,
    path: args.path,
    query: args.query,
    body: args.body,
  });
  if (!res.ok) {
    ctx.log(res.text.slice(0, 1000), 'stderr');
    throw new Error(`asc ${args.method} ${args.path} failed: ${ascErrorMessage(res)}`);
  }
  ctx.log(`asc ${res.status}`, 'success');
  if (res.text.length > 0) {
    // First 4 KB is enough for human eyes; the full body lives in the trace
    // view if we ever wire one up.
    ctx.log(res.text.slice(0, 4000), 'stdout');
  }
}
