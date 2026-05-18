import { useCallback, useEffect, useState } from 'react';
import { HardDrive, RefreshCw, Trash2 } from 'lucide-react';
import type { DiskUsageReport } from '@buildpilot/shared-types';
import { api } from '../lib/api';
import { useStore } from '../store/store';

// Cluster 10.D — disk usage page. Lists every pipeline by artifact byte
// total and exposes a "prune older than N days" action that proxies the
// existing pruneOldBuilds path.
//
// Caveat: we don't have a `~/.buildpilot/artifacts/` directory of our own
// — artifacts are recorded at their on-disk source path (whatever the
// pipeline step pointed at). The bytes reported here are the SUM of
// `build_artifacts.size` rows, which is the same number BuildPilot would
// "forget about" if you pruned all builds. Actual filesystem usage may
// be lower (paths can overlap) or higher (untracked files). The page
// makes that explicit in the help blurb.

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

export function DiskUsagePage() {
  const setView = useStore((s) => s.setView);
  const requestConfirmation = useStore((s) => s.requestConfirmation);

  const [data, setData] = useState<DiskUsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pruneDays, setPruneDays] = useState('30');
  const [pruning, setPruning] = useState(false);
  const [pruneMsg, setPruneMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.diskUsage());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onPrune = () => {
    const days = parseInt(pruneDays, 10);
    if (!Number.isFinite(days) || days <= 0) {
      setPruneMsg('Please enter a positive integer.');
      return;
    }
    requestConfirmation({
      title: `Prune builds older than ${days} day${days === 1 ? '' : 's'}?`,
      body:
        'Removes the matching build rows, their log entries, and their ' +
        "artifact records. Files on disk are NOT deleted — BuildPilot only " +
        'forgets about them.',
      variant: 'destructive',
      confirmLabel: 'Prune',
      typedConfirmation: 'prune',
      onConfirm: async () => {
        setPruning(true);
        setPruneMsg(null);
        try {
          const res = await api.pruneBuilds(days);
          setPruneMsg(
            `Pruned ${res.builds} build${res.builds === 1 ? '' : 's'}, ` +
              `${res.logEntries} log entr${res.logEntries === 1 ? 'y' : 'ies'}, ` +
              `${res.artifacts} artifact row${res.artifacts === 1 ? '' : 's'}.`,
          );
          await reload();
        } catch (e) {
          setPruneMsg(`Prune failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
          setPruning(false);
        }
      },
    });
  };

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-100">
            <HardDrive size={18} className="text-slate-400" />
            Disk usage
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Bytes BuildPilot is tracking in the <code className="text-slate-300">build_artifacts</code>{' '}
            table. Prune builds to drop their rows; actual files on disk
            are not deleted.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="focusable inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:border-sky-500 hover:text-sky-400 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'motion-safe:animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          Failed to load disk usage: {error}
        </div>
      )}

      {data && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-slate-800 bg-slate-900/40 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Total</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100">
                {formatBytes(data.totalBytes)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {data.artifactCount} artifact{data.artifactCount === 1 ? '' : 's'}
              </div>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-900/40 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Builds with artifacts</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100">{data.buildCount}</div>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-900/40 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Orphans</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100">
                {formatBytes(data.orphanBytes)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {data.orphanArtifactCount} artifact row
                {data.orphanArtifactCount === 1 ? '' : 's'} without a parent build
              </div>
            </div>
          </div>

          <div className="mb-4 rounded-md border border-slate-800 bg-slate-900/40 p-3">
            <div className="mb-1 text-sm text-slate-200">Prune older builds</div>
            <p className="mb-2 text-xs text-slate-400">
              Drops finished builds (success / failed / cancelled) older than the
              chosen age along with their log entries and artifact rows. Still-
              running builds are skipped.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-slate-400">
                Older than{' '}
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={pruneDays}
                  onChange={(e) => setPruneDays(e.target.value)}
                  className="w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100 focus:border-sky-500 focus:outline-none"
                />{' '}
                days
              </label>
              <button
                type="button"
                onClick={onPrune}
                disabled={pruning}
                className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50"
              >
                <Trash2 size={12} /> Prune
              </button>
              {pruneMsg && <span className="text-xs text-slate-300">{pruneMsg}</span>}
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/60 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">Pipeline</th>
                  <th className="px-3 py-2 text-right">Bytes</th>
                  <th className="px-3 py-2 text-right">Artifacts</th>
                  <th className="px-3 py-2 text-right">Builds</th>
                  <th className="px-3 py-2 w-32">Share</th>
                </tr>
              </thead>
              <tbody>
                {data.pipelines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
                      No artifacts recorded yet.
                    </td>
                  </tr>
                ) : (
                  data.pipelines.map((p) => {
                    const pct =
                      data.totalBytes > 0 ? (p.bytes / data.totalBytes) * 100 : 0;
                    return (
                      <tr key={p.pipelineId || `${p.projectId}:${p.pipelineName}`} className="border-t border-slate-800">
                        <td className="px-3 py-2 text-slate-300">{p.projectName}</td>
                        <td className="px-3 py-2">
                          {p.pipelineId ? (
                            <button
                              type="button"
                              onClick={() => setView({ type: 'pipeline', id: p.pipelineId })}
                              className="text-slate-200 hover:text-sky-400"
                            >
                              {p.pipelineName}
                            </button>
                          ) : (
                            <span className="text-slate-200">{p.pipelineName}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-200">
                          {formatBytes(p.bytes)}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-400">{p.artifactCount}</td>
                        <td className="px-3 py-2 text-right text-slate-400">{p.buildCount}</td>
                        <td className="px-3 py-2">
                          <div className="h-1.5 w-full rounded-full bg-slate-800">
                            <div
                              className="h-1.5 rounded-full bg-sky-500/70"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
