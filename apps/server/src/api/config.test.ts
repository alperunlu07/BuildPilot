import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDb, getDb } from '../store/db';
import { configRoutes } from './config';

// Security regression — PUT /api/config/ai-integrations accepts a `path`
// that is later spawned by the aiPrompt step. Without validation a
// caller could pivot from "edit settings" to RCE by pointing path at
// /bin/sh. These tests pin the defence:
//   • basename must equal the tool name (claude/codex/aider/gemini)
//   • path must be absolute (no PATH lookup of relative names)
//   • empty string still clears the override
//   • undefined still keeps the existing value
//
// Originally raised by an automated review on PR #4.

let tmp: string;
let app: FastifyInstance;

async function buildApp(): Promise<FastifyInstance> {
  const a = Fastify({ logger: false });
  // Stub the config file path env var so saveAiIntegrationsConfig writes
  // somewhere disposable. The route doesn't need any of the other
  // /api/config/* infrastructure to validate input.
  process.env.BUILDPILOT_CONFIG_PATH = join(tmp, 'config.json');
  await configRoutes(a);
  await a.ready();
  return a;
}

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'bp-config-api-'));
  initDb(join(tmp, 'db.sqlite'));
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
  try {
    getDb().close();
  } catch {
    // ignore
  }
  rmSync(tmp, { recursive: true, force: true });
  delete process.env.BUILDPILOT_CONFIG_PATH;
});

describe('PUT /api/config/ai-integrations — path validation', () => {
  it('accepts an absolute path whose basename matches the tool name', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: { claude: { path: '/usr/local/bin/claude' } },
    });
    expect(res.statusCode).toBe(200);
  });

  it('accepts an empty string (clears the override)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: { claude: { path: '' } },
    });
    expect(res.statusCode).toBe(200);
  });

  it('accepts undefined path (per-tool PATCH — keep existing)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: { claude: { model: 'claude-opus-4-7' } },
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects an absolute path whose basename is /bin/sh (RCE pivot)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: { claude: { path: '/bin/sh' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an absolute path whose basename is /bin/bash', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: { aider: { path: '/bin/bash' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a relative path (PATH lookup shadowing)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: { claude: { path: 'claude' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a relative path with a malicious basename', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: { claude: { path: '../../bin/sh' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a path where basename matches the wrong tool', async () => {
    // /usr/local/bin/codex would be valid under `codex.path`, but
    // assigning it under `claude.path` should fail — each tool slot
    // pins its own basename.
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: { claude: { path: '/usr/local/bin/codex' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('tolerates a trailing slash (basename still claude; spawn fails at run)', async () => {
    // POSIX semantics — trailing slash on a path doesn't change the
    // basename, so the security constraint still applies. spawn() will
    // fail at runtime because the path resolves to a directory, but
    // that's not a security issue.
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: { claude: { path: '/usr/local/bin/claude/' } },
    });
    expect(res.statusCode).toBe(200);
  });

  it.each(['claude', 'codex', 'aider', 'gemini'] as const)(
    'enforces basename validation for %s slot independently',
    async (tool) => {
      const valid = await app.inject({
        method: 'PUT',
        url: '/api/config/ai-integrations',
        payload: { [tool]: { path: `/opt/bin/${tool}` } },
      });
      expect(valid.statusCode).toBe(200);

      const invalid = await app.inject({
        method: 'PUT',
        url: '/api/config/ai-integrations',
        payload: { [tool]: { path: '/bin/sh' } },
      });
      expect(invalid.statusCode).toBe(400);
    },
  );
});
