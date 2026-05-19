import { useEffect, useState } from 'react';
import { Check, X, Tag, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

interface Props {
  projectId: string;
  value: string;
  onChange(pattern: string): void;
  // How many tags to show in the preview list. The endpoint already caps
  // at 500; the preview renders the first N after sort.
  previewLimit?: number;
}

// Cluster 11.G — tag-pattern preview. Renders the project's recent tags
// (numeric-aware reverse sort, so v2.10 comes after v2.9) and marks each
// with ✓ / ✗ based on whether the supplied glob matches. Match logic
// mirrors `apps/server/src/poller/triggers.ts#globToRegExp` so the UI
// preview and the poller agree.
function globToRegExp(glob: string): RegExp {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i]!;
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i += 2;
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (ch === '?') {
      out += '[^/]';
      i += 1;
    } else if ('\\^$.+|()[]{}'.includes(ch)) {
      out += '\\' + ch;
      i += 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return new RegExp('^' + out + '$');
}

function matchesPattern(tag: string, pattern: string): boolean {
  if (!pattern.trim()) return false;
  try {
    return globToRegExp(pattern.trim()).test(tag);
  } catch {
    return false;
  }
}

export function TagPatternPreview({ projectId, value, onChange, previewLimit = 10 }: Props) {
  const [tags, setTags] = useState<Array<{ tag: string; sha: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .projectTags(projectId, 50)
      .then((rows) => {
        if (alive) setTags(rows);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const visible = tags?.slice(0, previewLimit) ?? [];
  const pattern = value.trim();
  const matchCount = pattern && tags ? tags.filter((t) => matchesPattern(t.tag, pattern)).length : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Tag size={12} className="text-text-muted" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="v*.*.*"
          spellCheck={false}
          className="w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 font-mono text-xs text-text-primary focus:border-accent focus:outline-none"
        />
      </div>

      {pattern && tags && (
        <div className="text-[11px] text-text-muted">
          {matchCount} of {tags.length} tag{tags.length === 1 ? '' : 's'} match
        </div>
      )}

      <div className="rounded border border-border-subtle bg-bg-base/40">
        <div className="border-b border-border-subtle px-2 py-1 text-[10px] uppercase tracking-wider text-text-faint">
          Recent tags {tags ? `(showing ${visible.length} of ${tags.length})` : ''}
        </div>
        {loading && (
          <div className="flex items-center gap-1.5 px-2 py-2 text-[11px] text-text-muted">
            <Loader2 size={11} className="animate-spin" /> Loading tags…
          </div>
        )}
        {error && (
          <div className="px-2 py-2 text-[11px] text-rose-300">Couldn't load tags: {error}</div>
        )}
        {!loading && !error && tags && tags.length === 0 && (
          <div className="px-2 py-2 text-[11px] text-text-muted">No tags in this repository.</div>
        )}
        {!loading && !error && visible.length > 0 && (
          <ul className="divide-y divide-border-subtle/50">
            {visible.map((row) => {
              const match = pattern.length > 0 && matchesPattern(row.tag, pattern);
              return (
                <li
                  key={row.tag}
                  className="flex items-center justify-between gap-2 px-2 py-1 font-mono text-[11px]"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    {pattern.length === 0 ? (
                      <span className="text-text-faint">·</span>
                    ) : match ? (
                      <Check size={11} className="shrink-0 text-emerald-400" />
                    ) : (
                      <X size={11} className="shrink-0 text-text-faint" />
                    )}
                    <span
                      className={`truncate ${
                        pattern.length === 0
                          ? 'text-text-secondary'
                          : match
                            ? 'text-emerald-200'
                            : 'text-text-muted'
                      }`}
                    >
                      {row.tag}
                    </span>
                  </div>
                  <span className="shrink-0 text-text-faint">{row.sha.slice(0, 7)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
