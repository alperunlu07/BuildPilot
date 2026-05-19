// Dev seed script: populates a fresh BuildPilot DB with three demo
// projects, three pipelines each, and a handful of historical builds so
// the metrics widgets and onboarding screenshots have realistic data
// without manual clicking.
//
// Idempotent: re-running is a no-op once a project named "Demo: iOS app"
// exists. Use BUILDPILOT_HOME to point at a sandbox directory if you
// don't want to touch your real ~/.buildpilot install.
//
// Run via:
//   pnpm --filter @buildpilot/server seed
// or directly:
//   BUILDPILOT_HOME=/tmp/bp-dev tsx apps/server/scripts/seed.ts
//
// We deliberately use raw SQL inserts rather than the store/* helpers so
// the seeder doesn't depend on store internals that may evolve, and so it
// keeps working even if a higher-level store helper has a transient bug.

import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config';
import { initDb, getDb } from '../src/store/db';

type StepNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

type Edge = {
  id: string;
  source: string;
  target: string;
  condition?: 'success' | 'failure' | 'always';
};

interface PipelineSpec {
  name: string;
  steps: Array<{ type: string; data?: Record<string, unknown> }>;
}

// One demo project descriptor — name, demo step list per pipeline.
interface ProjectSpec {
  name: string;
  pipelines: PipelineSpec[];
  // How many historical builds to generate per pipeline so the metrics
  // widgets aren't blank on first open.
  historicalBuildsPerPipeline: number;
}

const PROJECTS: ProjectSpec[] = [
  {
    name: 'Demo: iOS app',
    pipelines: [
      {
        name: 'iOS Release',
        steps: [
          { type: 'checkout' },
          {
            type: 'xcodebuild',
            data: {
              action: 'archive',
              scheme: 'DemoApp',
              configuration: 'Release',
            },
          },
          // No dedicated `exportIpa` step type — use a shell step that
          // mimics the post-archive export so the demo pipeline reads
          // naturally without requiring an Xcode toolchain.
          {
            type: 'shell',
            data: { command: "echo 'xcodebuild -exportArchive (demo)'" },
          },
          {
            type: 'slackNotify',
            data: { webhookUrl: '', message: 'iOS release built' },
          },
        ],
      },
      {
        name: 'Smoke test',
        steps: [{ type: 'shell', data: { command: 'echo ok' } }],
      },
      {
        name: 'Coverage check',
        steps: [
          { type: 'checkout' },
          { type: 'shell', data: { command: 'xcodebuild test (demo)' } },
        ],
      },
    ],
    historicalBuildsPerPipeline: 6,
  },
  {
    name: 'Demo: Android app',
    pipelines: [
      {
        name: 'Android CI',
        steps: [
          { type: 'checkout' },
          {
            type: 'gradleBuild',
            data: { tasks: ['assembleRelease'], workingDir: '.' },
          },
          {
            type: 'telegramNotify',
            data: { message: 'Android build green', chatId: '' },
          },
        ],
      },
      {
        name: 'Smoke test',
        steps: [{ type: 'shell', data: { command: 'echo ok' } }],
      },
      {
        name: 'Nightly lint',
        steps: [
          { type: 'checkout' },
          { type: 'shell', data: { command: './gradlew lint' } },
        ],
      },
    ],
    historicalBuildsPerPipeline: 5,
  },
  {
    name: 'Demo: Unity game',
    pipelines: [
      {
        name: 'Server CI',
        steps: [
          { type: 'checkout' },
          { type: 'shell', data: { command: 'echo unity-build (demo)' } },
          {
            type: 'slackNotify',
            data: { webhookUrl: '', message: 'Server build done' },
          },
        ],
      },
      {
        name: 'Smoke test',
        steps: [{ type: 'shell', data: { command: 'echo ok' } }],
      },
      {
        name: 'Release tag',
        steps: [
          { type: 'checkout' },
          { type: 'shell', data: { command: 'echo packaging release' } },
        ],
      },
    ],
    historicalBuildsPerPipeline: 5,
  },
];

// Build a small straight-line pipeline graph: every step gets an id,
// and edges chain source → target in declaration order. The pipeline
// editor lays nodes out automatically when positions are zero.
function buildGraph(steps: PipelineSpec['steps']): {
  nodes: StepNode[];
  edges: Edge[];
} {
  const nodes: StepNode[] = steps.map((s, i) => ({
    id: `n_${randomUUID().slice(0, 8)}`,
    type: s.type,
    position: { x: 80 + i * 220, y: 120 },
    data: s.data ?? {},
  }));
  const edges: Edge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      id: `e_${randomUUID().slice(0, 8)}`,
      source: nodes[i]!.id,
      target: nodes[i + 1]!.id,
      condition: 'success',
    });
  }
  return { nodes, edges };
}

// Initialise a real git repo under a tmp dir so commit-history widgets
// have something to render. Two commits gives a non-trivial log without
// making the demo expensive to seed.
function makeDemoRepo(projectName: string): string {
  const root = mkdtempSync(join(tmpdir(), 'bp-seed-'));
  // Use --initial-branch=main so the demo repos don't depend on the host
  // git config's init.defaultBranch (older versions default to master).
  execSync('git init -q --initial-branch=main', { cwd: root });
  execSync('git config user.email "seed@buildpilot.local"', { cwd: root });
  execSync('git config user.name  "BuildPilot Seed"', { cwd: root });
  // Demo repos must never inherit a developer's commit-signing config:
  // some hosts force gpgsign=true globally, which would fail here because
  // there's no signing key available in the seeded workflow. The seed is
  // local throwaway data, so signatures buy us nothing.
  execSync('git config commit.gpgsign false', { cwd: root });
  execSync('git config tag.gpgsign false', { cwd: root });
  writeFileSync(join(root, 'README.md'), `# ${projectName}\n\nDemo project for BuildPilot.\n`);
  execSync('git add .', { cwd: root });
  // Override GIT_CONFIG_GLOBAL so global hooks / pre-commit-signing
  // wrappers can't intercept the commit either — pure isolated repo.
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  execSync('git commit -q --no-gpg-sign -m "Initial commit"', { cwd: root, env });
  writeFileSync(join(root, 'CHANGELOG.md'), '## 0.1.0\n- demo bootstrap\n');
  execSync('git add .', { cwd: root });
  execSync('git commit -q --no-gpg-sign -m "Add changelog"', { cwd: root, env });
  return root;
}

// Pseudo-random build outcomes that keep the success-rate widget honest
// (mostly green with the odd failure / cancellation). Returns one of the
// shipping BuildStatus values.
function pickStatus(rng: () => number): 'success' | 'failed' | 'cancelled' {
  const r = rng();
  if (r < 0.7) return 'success';
  if (r < 0.92) return 'failed';
  return 'cancelled';
}

// Deterministic linear-congruential RNG so multiple seed runs against
// fresh dirs produce reproducible-looking timelines. Not for security.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  initDb(cfg.dbPath);
  const db = getDb();

  // Idempotency guard: presence of the canonical first project name is
  // enough to detect "already seeded". This avoids duplicating data on
  // re-run during dev iteration.
  const existing = db
    .prepare('SELECT id FROM projects WHERE name = ?')
    .get('Demo: iOS app') as { id: string } | undefined;
  if (existing) {
    process.stdout.write(
      'Seed: "Demo: iOS app" already exists — skipping. Delete the DB or set BUILDPILOT_HOME=<tmp> to reseed.\n',
    );
    return;
  }

  const rng = mulberry32(1337);
  const now = Date.now();
  let totalProjects = 0;
  let totalPipelines = 0;
  let totalBuilds = 0;
  const projectIds: string[] = [];

  // Insert projects + their repos in a single transaction so a partial
  // failure doesn't leave half-baked rows behind for the next attempt.
  const tx = db.transaction(() => {
    for (const proj of PROJECTS) {
      const repoPath = makeDemoRepo(proj.name);
      const projectId = randomUUID();
      db.prepare(
        `INSERT INTO projects (id, name, path, default_branch, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(projectId, proj.name, repoPath, 'main', now);
      projectIds.push(projectId);
      totalProjects += 1;
      process.stdout.write(`  + project ${proj.name} → ${repoPath}\n`);

      for (const ps of proj.pipelines) {
        const { nodes, edges } = buildGraph(ps.steps);
        const pipelineId = randomUUID();
        // Raw insert — we deliberately stick to the columns added in the
        // first CREATE TABLE pass so this script works against any DB
        // produced by initDb(), including older snapshots that don't yet
        // carry the additive PR-comment columns. Additive columns default
        // to NULL/0 via the ALTER TABLE … DEFAULT clauses.
        db.prepare(
          `INSERT INTO pipelines
             (id, project_id, name, watch_branch, watch_interval_sec,
              auto_trigger, nodes_json, edges_json, created_at, updated_at,
              telegram_approvals)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          pipelineId,
          projectId,
          ps.name,
          'main',
          60,
          'off',
          JSON.stringify(nodes),
          JSON.stringify(edges),
          now,
          now,
          0,
        );
        totalPipelines += 1;
        process.stdout.write(`    └── pipeline ${ps.name} (${ps.steps.length} steps)\n`);

        // Build history: spread across the past ~2 weeks with realistic
        // durations between 20s and 8min so the duration widgets get a
        // distribution rather than a flat line.
        for (let b = 0; b < proj.historicalBuildsPerPipeline; b++) {
          const status = pickStatus(rng);
          const durationMs = Math.round(20_000 + rng() * 8 * 60_000);
          const ageMs = Math.round((b + 1) * 24 * 60 * 60_000 * (0.5 + rng()));
          const startedAt = now - ageMs;
          const finishedAt = startedAt + durationMs;
          const buildId = randomUUID();
          db.prepare(
            `INSERT INTO builds
               (id, pipeline_id, project_id, trigger_sha, trigger_branch,
                status, started_at, finished_at, log)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            buildId,
            pipelineId,
            projectId,
            // Truncated demo sha — real history would be a 40-char hex,
            // but the dashboard renders any non-empty string.
            randomUUID().replace(/-/g, '').slice(0, 7),
            'main',
            status,
            startedAt,
            finishedAt,
            `Demo build #${b + 1} — ${status}\n`,
          );
          totalBuilds += 1;
        }
      }
    }
  });
  tx();

  process.stdout.write('\nSeed complete:\n');
  process.stdout.write(`  projects:  ${totalProjects}\n`);
  process.stdout.write(`  pipelines: ${totalPipelines}\n`);
  process.stdout.write(`  builds:    ${totalBuilds}\n`);
  process.stdout.write(`  dbPath:    ${cfg.dbPath}\n`);
}

main().catch((err) => {
  process.stderr.write(`Seed failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});

// Suppress "module has no default export" complaints when this file is
// required for type purposes (tsx imports it as a script). Adding an
// explicit empty export keeps tsc happy under verbatimModuleSyntax.
export {};
