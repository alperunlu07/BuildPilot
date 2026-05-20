import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ShieldOff, ShieldCheck, RefreshCw } from 'lucide-react';
import type { FlakyTestEntry, FlakyTestsReport } from '@buildpilot/shared-types';
import { useStore } from '../store/store';
import { api } from '../lib/api';
import { cn } from '../lib/cn';

// Cluster 11.F — flaky test detection page. Aggregates pass/fail history
// across the last N builds of a pipeline and highlights tests with a
// strictly mixed pass/fail record. The "Quarantine" toggle persists to
// `pipelines.flaky_quarantine_json`; the runner doesn't honor it yet
// (engine wiring is a follow-up item), but the column captures intent.

const BUILD_COUNT_OPTIONS = [10, 30, 50, 100];

export function FlakyTestsPage() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const pipelines = useStore((s) => s.pipelines);
  const projects = useStore((s) => s.projects);
  const selectedPipelineId =
    view.type === 'flakyTests' ? view.pipelineId : undefined;
  const [pipelineId, setPipelineId] = useState<string>(
    selectedPipelineId ?? pipelines[0]?.id ?? '',
  );
  const [buildCount, setBuildCount] = useState<number>(30);
  const [report, setReport] = useState<FlakyTestsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep URL state in sync when the user picks a different pipeline.
  useEffect(() => {
    if (view.type !== 'flakyTests') return;
    if (pipelineId && pipelineId !== view.pipelineId) {
      setView({ type: 'flakyTests', pipelineId });
    }
  }, [pipelineId, view, setView]);

  // If pipelineId comes from URL but pipelines haven't loaded yet, sync
  // once they're available.
  useEffect(() => {
    if (selectedPipelineId && selectedPipelineId !== pipelineId) {
      setPipelineId(selectedPipelineId);
    } else if (!pipelineId && pipelines.length > 0) {
      setPipelineId(pipelines[0]!.id);
    }
  }, [selectedPipelineId, pipelines, pipelineId]);

  const load = useCallback(() => {
    if (!pipelineId) return;
    setLoading(true);
    setError(null);
    api
      .flakyTests(pipelineId, buildCount)
      .then((r) => setReport(r))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [pipelineId, buildCount]);

  useEffect(() => {
    load();
  }, [load]);

  const onToggleQuarantine = useCallback(
    async (entry: FlakyTestEntry, next: boolean) => {
      if (!report) return;
      // Optimistic: flip the flag locally so the toggle is snappy.
      setReport({
        ...report,
        flaky: report.flaky.map((f) =>
          f.testKey === entry.testKey ? { ...f, quarantined: next } : f,
        ),
      });
      try {
        await api.quarantineFlakyTest(report.pipelineId, entry.testKey, next);
      } catch (e) {
        // Roll back on failure so the UI doesn't lie.
        setReport({
          ...report,
          flaky: report.flaky.map((f) =>
            f.testKey === entry.testKey ? { ...f, quarantined: !next } : f,
          ),
        });
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [report],
  );

  const projectName = useMemo(() => {
    if (!pipelineId) return '';
    const p = pipelines.find((pl) => pl.id === pipelineId);
    if (!p) return '';
    return projects.find((pr) => pr.id === p.projectId)?.name ?? '';
  }, [pipelineId, pipelines, projects]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border-subtle bg-bg-panel/60 px-3 py-3 sm:px-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-lg font-semibold text-text-primary">Flaky tests</h1>
          <span className="text-xs text-text-muted">
            Aggregates pass/fail history across recent builds. Quarantined tests
            still run; the engine ignoring their failure is a follow-up.
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <label className="text-text-muted">Pipeline:</label>
          <select
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
            className="focusable rounded-md border border-border-subtle bg-bg-panel px-2 py-1 text-text-primary"
          >
            <option value="">— Select pipeline —</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {projects.find((pr) => pr.id === p.projectId)?.name
                  ? ` · ${projects.find((pr) => pr.id === p.projectId)!.name}`
                  : ''}
              </option>
            ))}
          </select>
          <label className="ml-2 text-text-muted">Window:</label>
          <select
            value={buildCount}
            onChange={(e) => setBuildCount(Number(e.target.value))}
            className="focusable rounded-md border border-border-subtle bg-bg-panel px-2 py-1 text-text-primary"
          >
            {BUILD_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                last {n} builds
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={load}
            className="focusable inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-text-secondary hover:border-accent hover:text-accent"
            title="Reload"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          {projectName && (
            <span className="ml-auto text-text-muted">{projectName}</span>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        {!pipelineId && (
          <div className="text-sm text-text-muted">Pick a pipeline to analyze.</div>
        )}
        {error && (
          <div className="mb-3 rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}
        {pipelineId && report && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-border-subtle bg-bg-panel/60 px-3 py-2 text-xs">
              <span className="text-text-muted">Analyzed</span>
              <span className="text-text-primary">{report.buildsAnalyzed} builds</span>
              <span className="text-text-muted">·</span>
              <span className="text-text-primary">{report.flaky.length} flaky / quarantined test(s)</span>
            </div>
            {report.flaky.length === 0 ? (
              <div className="rounded-md border border-dashed border-border-subtle px-4 py-12 text-center text-sm text-text-muted">
                No flaky tests detected over the last {report.buildsAnalyzed} builds.
                <div className="mt-1 text-xs text-text-faint">
                  This needs JUnit XML or .xcresult artifacts on each build; if your
                  pipeline doesn't produce these, the analyzer won't see anything.
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {report.flaky.map((t) => (
                  <FlakyRow
                    key={t.testKey}
                    entry={t}
                    onToggleQuarantine={(next) => onToggleQuarantine(t, next)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FlakyRow({
  entry,
  onToggleQuarantine,
}: {
  entry: FlakyTestEntry;
  onToggleQuarantine(next: boolean): void;
}) {
  const rate = entry.failureRate;
  const rateLabel = rate == null ? '—' : `${(rate * 100).toFixed(0)}%`;
  return (
    <li
      className={cn(
        'rounded-md border bg-bg-panel/30 px-3 py-2',
        entry.quarantined
          ? 'border-amber-900/60 bg-amber-950/20'
          : 'border-border-subtle',
      )}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle
          size={12}
          className={
            rate != null && rate > 0.5 ? 'text-rose-400' : 'text-amber-400'
          }
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-sm text-text-primary" title={entry.testKey}>
            {entry.name}
          </div>
          {entry.classname && (
            <div className="truncate text-[10px] text-text-faint" title={entry.classname}>
              {entry.classname}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[11px]">
          <span className="text-emerald-400">{entry.passes}P</span>
          <span className="text-rose-400">{entry.failures}F</span>
          {entry.skips > 0 && <span className="text-amber-400">{entry.skips}S</span>}
          <span className="rounded-md border border-border-subtle px-1.5 py-0.5 text-text-secondary">
            {rateLabel} fail
          </span>
          <button
            type="button"
            onClick={() => onToggleQuarantine(!entry.quarantined)}
            className={cn(
              'focusable inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]',
              entry.quarantined
                ? 'border-amber-700 bg-amber-950/40 text-amber-200 hover:border-amber-500'
                : 'border-border-subtle text-text-secondary hover:border-amber-500 hover:text-amber-300',
            )}
            title={
              entry.quarantined
                ? 'Quarantined — engine wiring is a follow-up'
                : 'Mark as flaky (quarantine)'
            }
          >
            {entry.quarantined ? <ShieldCheck size={11} /> : <ShieldOff size={11} />}
            {entry.quarantined ? 'Quarantined' : 'Quarantine'}
          </button>
        </div>
      </div>
    </li>
  );
}
