import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, MinusCircle, XCircle } from 'lucide-react';
import type { TestCase, TestReportTree, TestSuite } from '@buildpilot/shared-types';
import { cn } from '../lib/cn';

// Cluster 11.F — collapsible suite/test tree. The data comes pre-parsed
// from `/api/builds/:id/test-report`; this component is purely
// presentational and stateless apart from per-suite collapse + per-test
// failure-message expansion.

interface Props {
  report: TestReportTree;
  // Only show tests with status === 'failed' when this flag flips on.
  failuresOnly?: boolean;
  onFailuresOnlyChange?(next: boolean): void;
  // Optional free-text filter applied case-insensitively to suite + test
  // name + classname.
  filter?: string;
  onFilterChange?(next: string): void;
}

function formatSec(s: number | undefined): string {
  if (s == null || !Number.isFinite(s)) return '—';
  if (s < 0.001) return '<1ms';
  if (s < 1) return `${Math.round(s * 1000)}ms`;
  if (s < 60) return `${s.toFixed(2)}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toFixed(0)}s`;
}

function statusIconFor(status: TestCase['status']) {
  if (status === 'passed') return <CheckCircle2 size={12} className="text-emerald-400" />;
  if (status === 'failed') return <XCircle size={12} className="text-rose-400" />;
  return <MinusCircle size={12} className="text-amber-400" />;
}

function suiteCounts(s: TestSuite): { passed: number; failed: number; skipped: number } {
  let p = 0;
  let f = 0;
  let sk = 0;
  for (const t of s.tests) {
    if (t.status === 'passed') p += 1;
    else if (t.status === 'failed') f += 1;
    else sk += 1;
  }
  return { passed: p, failed: f, skipped: sk };
}

export function TestReportTreeView({
  report,
  failuresOnly = false,
  onFailuresOnlyChange,
  filter = '',
  onFilterChange,
}: Props) {
  // Suites start expanded when they contain failures so the user sees
  // them on first render; passing suites collapse by default.
  const initialCollapsed = useMemo(() => {
    const set = new Set<string>();
    for (const s of report.suites) {
      const c = suiteCounts(s);
      if (c.failed === 0) set.add(s.name);
    }
    return set;
  }, [report.suites]);

  const [collapsed, setCollapsed] = useState<Set<string>>(initialCollapsed);
  // Per-test failure message expansion state. Keyed by suite+name to
  // disambiguate identical test names across suites.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleSuite = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const toggleTest = (k: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const lowerFilter = filter.trim().toLowerCase();
  const filteredSuites = useMemo(() => {
    if (!lowerFilter && !failuresOnly) return report.suites;
    return report.suites
      .map((s) => {
        const tests = s.tests.filter((t) => {
          if (failuresOnly && t.status !== 'failed') return false;
          if (!lowerFilter) return true;
          if (s.name.toLowerCase().includes(lowerFilter)) return true;
          if (t.name.toLowerCase().includes(lowerFilter)) return true;
          if (t.classname && t.classname.toLowerCase().includes(lowerFilter)) return true;
          return false;
        });
        return { ...s, tests };
      })
      .filter((s) => s.tests.length > 0);
  }, [report.suites, lowerFilter, failuresOnly]);

  return (
    <div className="text-sm">
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-border-subtle bg-bg-panel/60 px-3 py-2 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-text-muted">Tests</span>
          <span className="font-semibold text-text-primary">{report.totalTests}</span>
          <span className="text-emerald-400">{report.totalPassed} passed</span>
          <span className="text-rose-400">{report.totalFailed} failed</span>
          {report.totalSkipped > 0 && (
            <span className="text-amber-400">{report.totalSkipped} skipped</span>
          )}
          {report.totalDurationSec != null && (
            <span className="text-text-muted">· {formatSec(report.totalDurationSec)}</span>
          )}
          <span className="rounded-md border border-border-subtle px-1.5 py-0.5 uppercase tracking-wider text-text-muted">
            {report.kind}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="search"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => onFilterChange?.(e.target.value)}
            className="focusable w-40 rounded-md border border-border-subtle bg-bg-panel px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
          />
          <label className="flex items-center gap-1.5 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={failuresOnly}
              onChange={(e) => onFailuresOnlyChange?.(e.target.checked)}
              className="focusable accent-rose-500"
            />
            Failures only
          </label>
        </div>
      </div>

      {report.note && (
        <div className="mb-3 rounded-md border border-amber-900 bg-amber-950/40 px-3 py-2 text-[12px] text-amber-200">
          {report.note}
        </div>
      )}

      {filteredSuites.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-subtle px-3 py-8 text-center text-xs text-text-muted">
          {report.suites.length === 0
            ? 'No suites parsed from this artifact.'
            : 'No tests match the current filter.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredSuites.map((s) => {
            const isCollapsed = collapsed.has(s.name);
            const c = suiteCounts(s);
            return (
              <li
                key={s.name}
                className="rounded-md border border-border-subtle bg-bg-panel/30"
              >
                <button
                  type="button"
                  onClick={() => toggleSuite(s.name)}
                  className="focusable flex w-full items-center gap-2 px-2 py-1.5 text-left"
                  aria-expanded={!isCollapsed}
                >
                  {isCollapsed ? (
                    <ChevronRight size={12} className="shrink-0 text-text-muted" />
                  ) : (
                    <ChevronDown size={12} className="shrink-0 text-text-muted" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-primary">
                    {s.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-[11px] text-text-muted">
                    {c.failed > 0 && (
                      <span className="text-rose-400">{c.failed} failed</span>
                    )}
                    <span className="text-emerald-400">{c.passed} passed</span>
                    {c.skipped > 0 && (
                      <span className="text-amber-400">{c.skipped} skipped</span>
                    )}
                    {s.timeSec !== undefined && (
                      <span>· {formatSec(s.timeSec)}</span>
                    )}
                  </span>
                </button>
                {!isCollapsed && (
                  <ul className="border-t border-border-subtle px-2 py-1">
                    {s.tests.map((t, idx) => {
                      const key = `${s.name}|${t.classname ?? ''}|${t.name}|${idx}`;
                      const isOpen = expanded.has(key);
                      const canExpand = t.status === 'failed' && (t.message || t.file);
                      return (
                        <li
                          key={key}
                          className={cn(
                            'flex flex-col rounded px-1 py-1 text-xs',
                            t.status === 'failed' && 'bg-rose-950/20',
                          )}
                        >
                          <button
                            type="button"
                            disabled={!canExpand}
                            onClick={() => canExpand && toggleTest(key)}
                            className={cn(
                              'focusable flex w-full items-center gap-2 text-left',
                              canExpand ? 'cursor-pointer' : 'cursor-default',
                            )}
                            aria-expanded={canExpand ? isOpen : undefined}
                          >
                            {statusIconFor(t.status)}
                            <span className="min-w-0 flex-1 truncate text-text-primary">
                              {t.name}
                              {t.classname && t.classname !== s.name && (
                                <span className="ml-1.5 text-[10px] text-text-faint">
                                  · {t.classname}
                                </span>
                              )}
                            </span>
                            {t.durationSec !== undefined && (
                              <span className="shrink-0 font-mono text-[10px] text-text-muted">
                                {formatSec(t.durationSec)}
                              </span>
                            )}
                          </button>
                          {isOpen && canExpand && (
                            <div className="ml-5 mt-1 rounded border border-rose-900/40 bg-bg-base/60 p-2 text-[11px] text-rose-200">
                              {t.file && (
                                <div className="mb-1 font-mono text-[10px] text-accent-hover">
                                  {t.file}
                                  {t.line ? `:${t.line}` : ''}
                                </div>
                              )}
                              {t.message ? (
                                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-rose-200">
                                  {t.message}
                                </pre>
                              ) : (
                                <em className="text-text-muted">No failure message captured.</em>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
