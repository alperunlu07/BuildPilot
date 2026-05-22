import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, Search, X, ChevronsDown, ChevronsUp } from 'lucide-react';
import type { BuildArtifact } from '@buildpilot/shared-types';
import { api } from '../lib/api';
import { pushEscHandler } from '../lib/escStack';

interface Props {
  artifact: BuildArtifact | null;
  onClose(): void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

// Lightweight log-line severity colouring. Patterns are deliberately broad
// so they catch both Unity-flavoured log lines (`error CS0103:`, etc) and
// platform syslog (`<Error>`, `<Warning>`, `<Notice>`, `<Debug>`).
function lineClass(line: string): string {
  const l = line;
  if (/(\berror\b|\bERROR\b|<Error>|\bSIGABRT\b|\bSIGSEGV\b|\bcrash\b|\bCrash\b|\bFAIL(ED)?\b|\bException\b|✖|✖)/.test(l))
    return 'text-rose-300';
  if (/(\bwarn(ing)?\b|<Warning>|\bWARN\b)/i.test(l)) return 'text-amber-300';
  if (/(<Notice>|\bINFO\b|✓|✔)/.test(l)) return 'text-accent-hover';
  if (/(<Debug>|\bDEBUG\b)/.test(l)) return 'text-text-muted';
  return 'text-text-primary';
}

// Render a single line, optionally highlighting search-match spans.
function renderLineWithHighlight(line: string, q: string): React.ReactNode {
  if (!q) return line;
  const lower = line.toLowerCase();
  const needle = q.toLowerCase();
  if (!lower.includes(needle)) return line;
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < line.length) {
    const idx = lower.indexOf(needle, i);
    if (idx === -1) {
      out.push(line.slice(i));
      break;
    }
    if (idx > i) out.push(line.slice(i, idx));
    out.push(
      <mark key={idx} className="bg-amber-400/40 text-amber-100 rounded-sm px-0.5">
        {line.slice(idx, idx + needle.length)}
      </mark>,
    );
    i = idx + needle.length;
  }
  return <>{out}</>;
}

export function ArtifactPreviewModal({ artifact, onClose }: Props) {
  const open = artifact !== null;

  const [content, setContent] = useState<string>('');
  const [size, setSize] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [bytesRead, setBytesRead] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [onlyMatches, setOnlyMatches] = useState(false);
  const [wrap, setWrap] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Load artifact text every time the modal opens with a different artifact.
  useEffect(() => {
    if (!artifact) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent('');
    setQ('');
    setOnlyMatches(false);
    api
      .getArtifactText(artifact.id)
      .then((r) => {
        if (cancelled) return;
        setContent(r.content);
        setSize(r.size);
        setTruncated(r.truncated);
        setBytesRead(r.bytesRead);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artifact]);

  // ESC closes via the top-of-stack registry so a ConfirmDialog opened
  // from inside this modal dismisses only itself on Escape, not both.
  // ⌘/Ctrl-F still focuses the search box (no stacking concern there).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    return pushEscHandler(() => onCloseRef.current());
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const el = document.getElementById('artifact-preview-search') as HTMLInputElement | null;
        el?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Split + (optionally) filter + memoise to avoid recomputing on every render.
  const lines = useMemo(() => {
    if (!content) return [] as { n: number; text: string }[];
    const raw = content.split(/\r?\n/);
    return raw.map((text, i) => ({ n: i + 1, text }));
  }, [content]);

  const visible = useMemo(() => {
    if (!q) return lines;
    const needle = q.toLowerCase();
    return onlyMatches
      ? lines.filter((l) => l.text.toLowerCase().includes(needle))
      : lines;
  }, [lines, q, onlyMatches]);

  const matchCount = useMemo(() => {
    if (!q) return 0;
    const needle = q.toLowerCase();
    return lines.reduce((acc, l) => (l.text.toLowerCase().includes(needle) ? acc + 1 : acc), 0);
  }, [lines, q]);

  if (!open || !artifact) return null;

  const fileName = artifact.path.split('/').pop() || artifact.path;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex h-full max-h-[100dvh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-border-subtle bg-bg-base shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ───────────────────────────────────────────── */}
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border-subtle bg-bg-panel px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-sm text-text-primary" title={artifact.path}>
              {fileName}
            </div>
            <div className="text-[11px] text-text-muted">
              {formatBytes(size)} total
              {truncated && (
                <>
                  <span className="mx-1 text-text-muted">·</span>
                  <span className="text-amber-400">
                    showing first {formatBytes(bytesRead)} (truncated)
                  </span>
                </>
              )}
              {lines.length > 0 && (
                <>
                  <span className="mx-1 text-text-muted">·</span>
                  {lines.length.toLocaleString()} lines
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(content).catch(() => undefined);
              }}
              className="flex items-center gap-1 rounded border border-border-subtle px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-elevated"
              title="Copy entire content to clipboard"
            >
              <Copy className="h-3 w-3" /> copy
            </button>
            <a
              href={api.artifactDownloadUrl(artifact.id)}
              download
              className="flex items-center gap-1 rounded border border-border-subtle px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-elevated"
              title="Download full file"
            >
              <Download className="h-3 w-3" /> download
            </a>
            <button
              onClick={onClose}
              className="rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* ── Search bar ────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-panel/30 px-4 py-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              id="artifact-preview-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search (⌘/Ctrl-F)…"
              className="w-full rounded border border-border-subtle bg-bg-base py-1 pl-7 pr-2 font-mono text-[12px] text-text-primary placeholder:text-text-muted focus:border-sky-700 focus:outline-none"
            />
          </div>
          {q && (
            <span className="text-[11px] tabular-nums text-text-muted">
              {matchCount.toLocaleString()} match{matchCount === 1 ? '' : 'es'}
            </span>
          )}
          {q && (
            <label className="flex items-center gap-1 text-[11px] text-text-muted">
              <input
                type="checkbox"
                checked={onlyMatches}
                onChange={(e) => setOnlyMatches(e.target.checked)}
                className="h-3 w-3"
              />
              only matches
            </label>
          )}
          <label className="flex items-center gap-1 text-[11px] text-text-muted">
            <input
              type="checkbox"
              checked={wrap}
              onChange={(e) => setWrap(e.target.checked)}
              className="h-3 w-3"
            />
            wrap
          </label>
          <button
            onClick={() => {
              const el = bodyRef.current;
              if (el) el.scrollTo({ top: 0 });
            }}
            className="rounded border border-border-subtle p-1 text-text-muted hover:bg-bg-elevated"
            title="Scroll to top"
          >
            <ChevronsUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              const el = bodyRef.current;
              if (el) el.scrollTo({ top: el.scrollHeight });
            }}
            className="rounded border border-border-subtle p-1 text-text-muted hover:bg-bg-elevated"
            title="Scroll to bottom"
          >
            <ChevronsDown className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ── Body ──────────────────────────────────────────────── */}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-auto bg-bg-base">
          {loading && (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
              Loading…
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center text-sm text-rose-400">
              Failed to load: {error}
            </div>
          )}
          {!loading && !error && (
            <div className="font-mono text-[12px] leading-[1.45]">
              {visible.length === 0 && (
                <div className="px-4 py-8 text-center text-text-muted">
                  {q ? 'No matches.' : '(empty file)'}
                </div>
              )}
              {visible.map((l) => (
                <div
                  key={l.n}
                  className="flex border-l-2 border-transparent hover:border-sky-600 hover:bg-bg-panel"
                >
                  <span className="sticky left-0 inline-block shrink-0 select-none border-r border-border-subtle/80 bg-bg-base/80 px-2 py-px text-right text-text-muted tabular-nums" style={{ minWidth: '4.5rem' }}>
                    {l.n}
                  </span>
                  <span
                    className={`flex-1 px-2 py-px ${lineClass(l.text)} ${wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}
                  >
                    {renderLineWithHighlight(l.text, q)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
