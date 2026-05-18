import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose(): void;
}

const SEEN_KEY = 'buildpilot.changelogSeen';

// Parse the CHANGELOG markdown into versioned chunks. The format we ship
// uses "## [x.y.z] — date" headings; we keep raw markdown body per entry
// because rendering it ourselves is cheaper than pulling in a Markdown
// library and the file is hand-curated.
export interface ChangelogEntry {
  version: string;
  date: string;
  body: string;
}

function parseChangelog(md: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const lines = md.split(/\r?\n/);
  let current: ChangelogEntry | null = null;
  for (const line of lines) {
    const m = line.match(/^##\s+\[([^\]]+)\](?:\s+[—-]\s+(.*))?$/);
    if (m) {
      if (current) entries.push(current);
      current = { version: m[1]!.trim(), date: (m[2] ?? '').trim(), body: '' };
      continue;
    }
    if (current) current.body += line + '\n';
  }
  if (current) entries.push(current);
  return entries;
}

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function writeSeen(version: string): void {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    // ignore
  }
}

// Tiny one-pass markdown renderer. Handles bullets, **bold**, `code`,
// headings — sufficient for our CHANGELOG. We deliberately avoid bringing
// in a full Markdown lib for a 3-page text file.
function renderMd(body: string): JSX.Element[] {
  const out: JSX.Element[] = [];
  const lines = body.split(/\r?\n/);
  let bullets: string[] = [];
  const flushBullets = () => {
    if (bullets.length === 0) return;
    out.push(
      <ul key={`ul-${out.length}`} className="mb-3 ml-4 list-disc space-y-1 text-sm text-slate-300">
        {bullets.map((b, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: inline(b) }} />
        ))}
      </ul>,
    );
    bullets = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushBullets();
      continue;
    }
    if (line.startsWith('### ')) {
      flushBullets();
      out.push(
        <h4 key={`h-${out.length}`} className="mb-2 mt-3 text-xs font-semibold uppercase tracking-wider text-sky-300">
          {line.slice(4)}
        </h4>,
      );
      continue;
    }
    const m = line.match(/^\s*[-*]\s+(.*)$/);
    if (m) {
      bullets.push(m[1] ?? '');
      continue;
    }
    flushBullets();
    out.push(
      <p
        key={`p-${out.length}`}
        className="mb-3 text-sm text-slate-300"
        dangerouslySetInnerHTML={{ __html: inline(line) }}
      />,
    );
  }
  flushBullets();
  return out;
}

function inline(s: string): string {
  // Escape HTML, then re-introduce only the bits we render. Order matters —
  // strong before code so `**x**` works inside backticks-free text.
  const esc = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-100">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-slate-800 px-1 py-0.5 font-mono text-[12px] text-slate-200">$1</code>');
}

// True if `a` is a strictly newer semver than `b`. Falls back to
// lexicographic compare on parse failure so we always have an answer.
function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map((x) => parseInt(x, 10));
  const pb = b.split('.').map((x) => parseInt(x, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (Number.isNaN(ai) || Number.isNaN(bi)) return a > b;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }
  return false;
}

export function ChangelogDrawer({ open, onClose }: Props) {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || entries.length > 0) return;
    setLoading(true);
    setError(null);
    fetch('/CHANGELOG.md')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.text();
      })
      .then((text) => {
        setEntries(parseChangelog(text));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [open, entries.length]);

  // Mark the latest version as seen the moment the drawer opens — the next
  // session won't auto-pop the drawer for the same release.
  useEffect(() => {
    if (open && entries.length > 0) {
      writeSeen(entries[0]!.version);
    }
  }, [open, entries]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-slate-950/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-[480px] flex-col border-l border-slate-700 bg-slate-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-sky-400" />
            <h2 className="text-base font-semibold text-slate-100">What's new</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && <div className="text-sm text-slate-400">Loading…</div>}
          {error && (
            <div className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
              Couldn't load CHANGELOG.md — {error}
            </div>
          )}
          {!loading && !error && entries.length === 0 && (
            <div className="text-sm text-slate-400">No changelog entries.</div>
          )}
          {entries.map((entry, idx) => (
            <section key={entry.version} className="mb-6">
              <div className="mb-2 flex items-baseline gap-2 border-b border-slate-800 pb-1.5">
                <h3 className="text-sm font-semibold text-slate-100">{entry.version}</h3>
                {entry.date && (
                  <span className="text-[11px] uppercase tracking-wider text-slate-400">
                    {entry.date}
                  </span>
                )}
                {idx === 0 && (
                  <span className="ml-auto rounded-md bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                    Latest
                  </span>
                )}
              </div>
              {renderMd(entry.body)}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// Companion hook — returns true when the latest changelog entry hasn't
// been seen yet so the drawer can auto-open on first visit after a new
// release.
export function useUnreadChangelog(): { hasUnread: boolean; markRead(): void } {
  const [latest, setLatest] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/CHANGELOG.md')
      .then((r) => (r.ok ? r.text() : ''))
      .then((text) => {
        if (!alive) return;
        const entries = parseChangelog(text);
        if (entries[0]) setLatest(entries[0].version);
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, []);
  const seen = readSeen();
  const hasUnread = latest !== null && (seen === null || isNewer(latest, seen));
  return {
    hasUnread,
    markRead: () => {
      if (latest) writeSeen(latest);
    },
  };
}
