import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Route validation + pass-through only: the real coordinator would spawn a
// pipeline run, so it is stubbed and we assert on the opts it receives.
const startBuildForPipeline = vi.fn();
vi.mock('../runner/coordinator', () => ({
  cancelBuild: vi.fn(),
  enqueueBuild: vi.fn(),
  rerunFailedMatrixChildren: vi.fn(),
  startBuildForPipeline: (...args: unknown[]) => startBuildForPipeline(...args),
}));

import { getDb, initDb } from '../store/db';
import { createPipeline } from '../store/pipelines';
import { createProject } from '../store/projects';
import { buildsRoutes } from './builds';

let tmp: string;
let app: FastifyInstance;
let pipelineId: string;

beforeEach(async () => {
  startBuildForPipeline.mockReset();
  startBuildForPipeline.mockResolvedValue({ id: 'b1', status: 'pending' });
  tmp = mkdtempSync(join(tmpdir(), 'bp-builds-trigger-'));
  initDb(join(tmp, 'db.sqlite'));
  const proj = createProject({ name: 'p', path: join(tmp, 'proj'), defaultBranch: 'main' });
  pipelineId = createPipeline({
    projectId: proj.id,
    name: 'pipe',
    watch: { branch: 'main', intervalSec: 30, autoTrigger: 'off' },
    nodes: [],
    edges: [],
  }).id;
  app = Fastify({ logger: false });
  await buildsRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  try {
    getDb().close();
  } catch {
    /* not initialised */
  }
  rmSync(tmp, { recursive: true, force: true });
});

const post = (payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/api/builds', payload: { pipelineId, ...payload } });

describe('POST /api/builds branch/sha', () => {
  it('passes branch and sha through as triggerBranch / triggerSha', async () => {
    const res = await post({ branch: 'feature/x-1.2', sha: 'abcdef1234567' });
    expect(res.statusCode).toBe(200);
    expect(startBuildForPipeline).toHaveBeenCalledWith(pipelineId, {
      fromNodeId: undefined,
      triggerBranch: 'feature/x-1.2',
      triggerSha: 'abcdef1234567',
    });
  });

  it('leaves both undefined when not supplied (legacy behaviour)', async () => {
    const res = await post({});
    expect(res.statusCode).toBe(200);
    expect(startBuildForPipeline).toHaveBeenCalledWith(pipelineId, {
      fromNodeId: undefined,
      triggerBranch: undefined,
      triggerSha: undefined,
    });
  });

  it.each([
    ['leading dash', { branch: '-rf' }],
    ['leading dash option', { branch: '--upload-pack=x' }],
    ['double dot', { branch: 'a..b' }],
    ['space', { branch: 'a b' }],
    ['empty', { branch: '' }],
    ['too long', { branch: 'a'.repeat(201) }],
    ['sha non-hex', { sha: 'zzzzzzz' }],
    ['sha too short', { sha: 'abc123' }],
    ['sha too long', { sha: 'a'.repeat(41) }],
  ])('rejects %s with 400', async (_name, extra) => {
    const res = await post(extra);
    expect(res.statusCode).toBe(400);
    expect(startBuildForPipeline).not.toHaveBeenCalled();
  });
});
