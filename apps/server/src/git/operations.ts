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
  all = false,
): Promise<Commit[]> {
  // Use control-character separators (US/RS) so commit subjects/bodies that
  // contain pipes, tabs, or newlines don't break parsing.
  const FS = '\x1f'; // field separator
  const RS = '\x1e'; // record separator
  const fmt = ['%H', '%P', '%aI', '%aN', '%aE', '%s', '%b'].join(FS) + RS;

  const args = ['log', `--format=${fmt}`, '-n', String(limit), '--topo-order'];
  if (all) {
    args.push('--all');
    if (sinceSha) args.push(`${sinceSha}..HEAD`);
  } else if (sinceSha) {
    args.push(`${sinceSha}..${ref}`);
  } else {
    args.push(ref);
  }

  try {
    const raw = await git(repoPath).raw(args);
    const records = raw.split(RS).map((r) => r.replace(/^\n/, '')).filter((r) => r.length > 0);
    return records.map((rec) => {
      const [hash = '', parents = '', date = '', author = '', email = '', subject = '', body = ''] =
        rec.split(FS);
      return {
        sha: hash,
        shortSha: hash.slice(0, 7),
        parents: parents.split(' ').filter((p) => p.length > 0),
        author,
        email,
        date: date ? new Date(date).getTime() : 0,
        subject,
        body: body.trim(),
      };
    });
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
