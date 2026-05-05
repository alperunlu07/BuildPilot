import simpleGit, { type SimpleGit } from 'simple-git';
import type { Commit } from '@buildpilot/shared-types';

function git(repoPath: string): SimpleGit {
  return simpleGit(repoPath);
}

export async function listBranches(repoPath: string): Promise<string[]> {
  const branches = await git(repoPath).branchLocal();
  return branches.all;
}

export async function detectDefaultBranch(repoPath: string): Promise<string> {
  const branches = await git(repoPath).branchLocal();
  if (branches.all.includes('main')) return 'main';
  if (branches.all.includes('master')) return 'master';
  return branches.current || 'main';
}

export async function getCurrentBranch(repoPath: string): Promise<string> {
  const status = await git(repoPath).status();
  return status.current ?? '';
}

export async function getHeadSha(repoPath: string, branch: string): Promise<string | null> {
  try {
    return (await git(repoPath).revparse([branch])).trim();
  } catch {
    return null;
  }
}

export async function getRemoteHeadSha(
  repoPath: string,
  branch: string,
  remote = 'origin',
): Promise<string | null> {
  try {
    return (await git(repoPath).revparse([`${remote}/${branch}`])).trim();
  } catch {
    return null;
  }
}

export async function fetchAll(repoPath: string): Promise<void> {
  await git(repoPath).fetch(['--all', '--prune']);
}

export async function listCommits(
  repoPath: string,
  ref: string,
  limit = 50,
  sinceSha?: string,
): Promise<Commit[]> {
  const range = sinceSha ? `${sinceSha}..${ref}` : ref;
  try {
    const log = await git(repoPath).log([range, '-n', String(limit)]);
    return log.all.map((c) => ({
      sha: c.hash,
      shortSha: c.hash.slice(0, 7),
      author: c.author_name,
      email: c.author_email,
      date: new Date(c.date).getTime(),
      subject: c.message,
      body: c.body ?? '',
    }));
  } catch {
    return [];
  }
}

export async function pull(repoPath: string, remote = 'origin'): Promise<string> {
  const result = await git(repoPath).pull(remote);
  return JSON.stringify(result);
}

export async function checkout(repoPath: string, branch: string): Promise<void> {
  await git(repoPath).checkout(branch);
}
