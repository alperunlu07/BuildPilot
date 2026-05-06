import type { HttpRequestStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';

export async function runHttpRequest(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<HttpRequestStepData>;
  if (!d.url) throw new Error('httpRequest: missing "url"');
  const method = (d.method ?? 'GET').toUpperCase();
  const headers = parseHeaders(d.headers);
  const body = d.body && d.body.length > 0 ? d.body : undefined;

  ctx.log(`${method} ${d.url}`);
  for (const [k, v] of Object.entries(headers)) {
    // Avoid leaking the full Authorization header to the log table.
    const display = k.toLowerCase() === 'authorization' ? '<redacted>' : v;
    ctx.log(`  ${k}: ${display}`);
  }
  if (body) ctx.log(`  body: ${truncate(body, 500)}`);

  const res = await fetch(d.url, { method, headers, body });
  const text = await res.text().catch(() => '');

  ctx.log(`← ${res.status} ${res.statusText}`, res.ok ? 'stdout' : 'stderr');
  if (text.length > 0) {
    for (const line of text.split(/\r?\n/).slice(0, 50)) {
      ctx.log(line, res.ok ? 'stdout' : 'stderr');
    }
    if (text.split(/\r?\n/).length > 50) ctx.log('… response body truncated', 'info');
  }

  if (!isStatusAcceptable(res.status, d.expectedStatus)) {
    throw new Error(
      `unexpected status ${res.status} ${res.statusText}` +
        (d.expectedStatus ? ` (expected ${d.expectedStatus})` : ''),
    );
  }
}

function parseHeaders(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    if (idx <= 0) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

function isStatusAcceptable(status: number, expected: string | undefined): boolean {
  if (!expected || expected.trim().length === 0) {
    return status >= 200 && status < 300;
  }
  const allowed = expected
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  return allowed.includes(status);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}… (${s.length - n} more chars)`;
}
