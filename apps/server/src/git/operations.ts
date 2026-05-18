import simpleGit, { type SimpleGit } from 'simple-git';
import type { Commit } from '@buildpilot/shared-types';

function git(repoPath: string): SimpleGit {
  return simpleGit(repoPath);
}

export async function listBranches(repoPath: string): Promise<string[]> {
  const local = (await git(repoPath).branchLocal()).all;
  // Include remote-tracking branches too — useful for pipelines that watch a
  // branch we haven't checked out locally. Strip the "<remote>/" prefix and
  // drop any "origin/HEAD -> origin/main" symbolic ref entries.
  const remote = await git(repoPath)
    .branch(['-r'])
    .then((r) => r.all)
    .catch(() => [] as string[]);
  const remoteCleaned = remote
    .filter((b) => !b.includes('->'))
    .map((b) => b.replace(/^[^/]+\//, ''));
  return Array.from(new Set([...local, ...remoteCleaned])).sort();
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

// List local tags + the SHA each points at. Used by tag-pattern triggers
// (Phase 4 Cluster A) to detect newly pushed tags after a fetch.
export async function listTagsWithSha(
  repoPath: string,
): Promise<Array<{ tag: string; sha: string }>> {
  try {
    // `for-each-ref refs/tags` enumerates lightweight tags too; dereference
    // annotated tags with %(*objectname) for the commit they point at.
    const raw = await git(repoPath).raw([
      'for-each-ref',
      '--format=%(refname:strip=2)\t%(objectname)\t%(*objectname)',
      'refs/tags',
    ]);
    const rows: Array<{ tag: string; sha: string }> = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      const [tag, objSha, derefSha] = line.split('\t');
      if (!tag) continue;
      const sha = (derefSha && derefSha.length > 0 ? derefSha : objSha) ?? '';
      if (sha.length > 0) rows.push({ tag, sha });
    }
    return rows;
  } catch {
    return [];
  }
}

// File-system paths changed in a single commit (against its first parent).
// Used by the path-filter preview in the dashboard. Root commits (no
// parent) return [] — the filter wouldn't have anything to match anyway.
export async function changedPathsInCommit(
  repoPath: string,
  sha: string,
): Promise<string[]> {
  if (!sha) return [];
  try {
    // --diff-filter excludes pure rename detection noise; `^!` is the
    // shortcut for "this commit vs its first parent".
    const raw = await git(repoPath).raw([
      'show',
      '--no-color',
      '--name-only',
      '--pretty=format:',
      sha,
    ]);
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}

// File-system paths changed between two refs (inclusive of the right side).
// Returns [] if either ref is unknown — caller treats that as "no filter
// info" rather than throwing, so a transient git failure doesn't block the
// build.
export async function changedPathsBetween(
  repoPath: string,
  fromSha: string,
  toSha: string,
): Promise<string[]> {
  if (!fromSha || !toSha) return [];
  try {
    const raw = await git(repoPath).raw([
      'diff',
      '--name-only',
      `${fromSha}..${toSha}`,
    ]);
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}
