import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Creates a temporary local git repo with one commit so BuildPilot can
// accept it as a project. Returns the absolute path for use in /api/projects.
export function createTempGitRepo(name = 'demo-repo'): string {
  const dir = mkdtempSync(join(tmpdir(), `bp-${name}-`));
  mkdirSync(dir, { recursive: true });
  // Use -c init.defaultBranch=main so the repo's default branch is
  // deterministic across git versions / global configs.
  execSync('git init --initial-branch=main', { cwd: dir });
  execSync('git config user.email "e2e@buildpilot.test"', { cwd: dir });
  execSync('git config user.name "BuildPilot E2E"', { cwd: dir });
  // Some sandboxed environments inherit a global commit.gpgsign=true that
  // points at a missing signing helper. Disable signing for our test repo.
  execSync('git config commit.gpgsign false', { cwd: dir });
  execSync('git config tag.gpgsign false', { cwd: dir });
  writeFileSync(join(dir, 'README.md'), `# ${name}\n\nSeeded for BuildPilot E2E.\n`);
  execSync('git add .', { cwd: dir });
  execSync('git commit --no-gpg-sign -m "init"', {
    cwd: dir,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2024-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2024-01-01T00:00:00Z',
    },
  });
  return dir;
}

interface SeededProject {
  projectId: string;
  pipelineId: string;
  repoPath: string;
}

// Seeds an isolated stack with one project + one shell pipeline. Returns
// the resulting ids so the test can drive the dashboard directly to the
// pipeline view if it wants to.
export async function seedDemoProject(apiUrl: string, name = 'Demo Project'): Promise<SeededProject> {
  const repoPath = createTempGitRepo(name.toLowerCase().replace(/\s+/g, '-'));

  const project = await fetch(`${apiUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: repoPath, name }),
  }).then((r) => {
    if (!r.ok) throw new Error(`POST /api/projects failed: ${r.status}`);
    return r.json() as Promise<{ id: string }>;
  });

  const pipeline = await fetch(`${apiUrl}/api/pipelines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: project.id,
      name: 'Hello World',
      watch: {
        branch: 'main',
        intervalSec: 60,
        autoTrigger: 'off',
      },
      nodes: [
        {
          id: 'step-1',
          type: 'shell',
          position: { x: 100, y: 100 },
          data: { command: 'echo hi' },
        },
      ],
      edges: [],
    }),
  }).then((r) => {
    if (!r.ok) throw new Error(`POST /api/pipelines failed: ${r.status} ${r.statusText}`);
    return r.json() as Promise<{ id: string }>;
  });

  return { projectId: project.id, pipelineId: pipeline.id, repoPath };
}
