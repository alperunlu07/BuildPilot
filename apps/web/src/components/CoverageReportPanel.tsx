import { useEffect, useState } from 'react';
import { PieChart, FileWarning } from 'lucide-react';
import type { CoverageReport } from '@buildpilot/shared-types';
import { api } from '../lib/api';

// Cluster 11.F — coverage panel reading `coverage.xml` (Cobertura). Shows
// overall % + top-5 lowest-covered files. We deliberately don't render
// per-line coverage in the dashboard — that's what the HTML report
// artifact is for; we just give the user the headline numbers and a
// shortlist of "files that need attention".
//
// PR delta widget is deferred: BuildPilot currently has no outbound PR
// integration so we don't have a baseline branch to diff against.

interface Props {
  buildId: string;
}

function formatPct(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate)) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

function rateColor(rate: number | null): string {
  if (rate == null) return 'text-text-muted';
  if (rate >= 0.8) return 'text-emerald-400';
  if (rate >= 0.5) return 'text-amber-400';
  return 'text-rose-400';
}

function rateBg(rate: number | null): string {
  if (rate == null) return 'bg-border-subtle';
  if (rate >= 0.8) return 'bg-emerald-500/70';
  if (rate >= 0.5) return 'bg-amber-500/70';
  return 'bg-rose-500/70';
}

export function CoverageReportPanel({ buildId }: Props) {
  const [data, setData] = useState<CoverageReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    api
      .buildCoverage(buildId)
      .then((r) => {
        if (alive) setData(r);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [buildId]);

  if (error) {
    return (
      <div className="rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
        Coverage unavailable: {error}
      </div>
    );
  }
  if (!data) {
    return <div className="text-xs text-text-muted">Loading coverage…</div>;
  }

  if (data.note && data.lineRate == null && data.lowestFiles.length === 0) {
    return (
      <div className="rounded-md border border-amber-900 bg-amber-950/40 px-3 py-2 text-[12px] text-amber-200">
        {data.note}
      </div>
    );
  }

  return (
    <div className="text-xs">
      <div className="mb-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Stat
          label="Line coverage"
          value={formatPct(data.lineRate)}
          valueClass={rateColor(data.lineRate)}
        />
        <Stat
          label="Branch coverage"
          value={formatPct(data.branchRate)}
          valueClass={rateColor(data.branchRate)}
        />
        <Stat
          label="Lines"
          value={
            data.linesValid > 0
              ? `${data.linesCovered.toLocaleString()} / ${data.linesValid.toLocaleString()}`
              : '—'
          }
        />
      </div>

      {data.lineRate != null && (
        <div className="mb-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-muted">
            <PieChart size={11} />
            Overall
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-bg-elevated">
            <div
              className={`h-2 ${rateBg(data.lineRate)}`}
              style={{ width: `${Math.max(0, Math.min(1, data.lineRate)) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-muted">
          <FileWarning size={11} />
          Lowest-covered files
        </div>
        {data.lowestFiles.length === 0 ? (
          <div className="rounded-md border border-dashed border-border-subtle px-3 py-3 text-[11px] text-text-muted">
            No per-file breakdown in this coverage.xml.
          </div>
        ) : (
          <ul className="space-y-1">
            {data.lowestFiles.map((f) => (
              <li
                key={f.filename}
                className="grid grid-cols-[1fr_70px_60px] items-center gap-2 rounded-md bg-bg-panel/60 px-2 py-1"
              >
                <span className="min-w-0 truncate font-mono text-[11px] text-text-primary" title={f.filename}>
                  {f.filename}
                </span>
                <div className="h-1 w-full rounded-full bg-bg-elevated">
                  <div
                    className={`h-1 rounded-full ${rateBg(f.lineRate)}`}
                    style={{ width: `${Math.max(0, Math.min(1, f.lineRate)) * 100}%` }}
                  />
                </div>
                <span className={`text-right ${rateColor(f.lineRate)}`}>
                  {formatPct(f.lineRate)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.note && (
        <div className="mt-2 text-[10px] text-text-faint">{data.note}</div>
      )}

      <div className="mt-2 text-[10px] text-text-faint">
        PR delta widget needs outbound PR integration (follow-up).
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-panel/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className={`text-sm font-semibold ${valueClass ?? 'text-text-primary'}`}>{value}</div>
    </div>
  );
}
