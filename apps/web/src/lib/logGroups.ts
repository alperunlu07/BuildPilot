import type { BuildLogEntry } from '@buildpilot/shared-types';

export interface LogGroup {
  id: string;
  name: string;
  // seq of the marker line that starts the group; the group covers every
  // entry whose seq is in [startSeq, endSeq).
  startSeq: number;
  endSeq: number;
  // Inclusive seq range of group content (excluding the marker line itself).
  contentStartSeq: number;
  contentEndSeq: number;
  // Aggregate counts so the header strip can show "3 errors · 12 lines".
  count: number;
  failureCount: number;
  stderrCount: number;
}

// Marker forms:
//   GitHub Actions / Azure Pipelines:  ::group::Name … ::endgroup::
//   Fastlane / various shell scripts:   --- Name ---  (loose; we accept
//                                                       leading-dashes and
//                                                       optional trailing dashes)
const GROUP_RE = /^::group::(.+?)::?$/;
const ENDGROUP_RE = /^::endgroup::\s*$/;
const FASTLANE_RE = /^---+\s*(.+?)\s*---+\s*$/;

// Returns the list of detected log groups. A new fastlane-style `---` marker
// implicitly closes any previous open fastlane group. ::group::/::endgroup::
// follow strict open/close semantics.
export function detectLogGroups(entries: BuildLogEntry[]): LogGroup[] {
  const out: LogGroup[] = [];
  let open: {
    id: string;
    name: string;
    startSeq: number;
    contentStartSeq: number;
    style: 'curly' | 'dashes';
  } | null = null;

  const finalize = (endSeq: number, contentEndSeq: number) => {
    if (!open) return;
    // Re-scan the window for counts. Done at close time rather than per-line
    // so the hot path stays just a regex test.
    let count = 0;
    let failureCount = 0;
    let stderrCount = 0;
    for (const e of entries) {
      if (e.seq < open.contentStartSeq || e.seq > contentEndSeq) continue;
      count++;
      if (e.level === 'failure') failureCount++;
      else if (e.level === 'stderr') stderrCount++;
    }
    out.push({
      id: open.id,
      name: open.name,
      startSeq: open.startSeq,
      endSeq,
      contentStartSeq: open.contentStartSeq,
      contentEndSeq,
      count,
      failureCount,
      stderrCount,
    });
    open = null;
  };

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const msg = e.message.trim();
    let m = msg.match(GROUP_RE);
    if (m) {
      if (open) finalize(e.seq - 1, entries[i - 1]?.seq ?? e.seq - 1);
      open = {
        id: `g-${e.seq}`,
        name: m[1]!.trim(),
        startSeq: e.seq,
        contentStartSeq: entries[i + 1]?.seq ?? e.seq + 1,
        style: 'curly',
      };
      continue;
    }
    if (ENDGROUP_RE.test(msg) && open?.style === 'curly') {
      finalize(e.seq, entries[i - 1]?.seq ?? e.seq);
      continue;
    }
    m = msg.match(FASTLANE_RE);
    if (m) {
      if (open) finalize(e.seq - 1, entries[i - 1]?.seq ?? e.seq - 1);
      open = {
        id: `g-${e.seq}`,
        name: m[1]!.trim(),
        startSeq: e.seq,
        contentStartSeq: entries[i + 1]?.seq ?? e.seq + 1,
        style: 'dashes',
      };
      continue;
    }
  }
  if (open) {
    const last = entries[entries.length - 1];
    finalize(last?.seq ?? 0, last?.seq ?? 0);
  }
  return out;
}

// Given the list of groups + the user's "collapsed" set, returns a filter
// callable for entry predicates. Entries inside a collapsed group are
// hidden EXCEPT the marker line itself (kept so the user sees the header).
export function buildGroupFilter(
  groups: LogGroup[],
  collapsed: ReadonlySet<string>,
): (entry: BuildLogEntry) => boolean {
  if (groups.length === 0 || collapsed.size === 0) return () => true;
  const collapsedGroups = groups.filter((g) => collapsed.has(g.id));
  if (collapsedGroups.length === 0) return () => true;
  return (entry) => {
    for (const g of collapsedGroups) {
      if (entry.seq === g.startSeq) return true;
      if (entry.seq >= g.contentStartSeq && entry.seq <= g.contentEndSeq) return false;
    }
    return true;
  };
}
