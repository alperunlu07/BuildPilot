import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Filter, Grid3X3, Hammer, History, LayoutList, RefreshCw } from 'lucide-react';
import type { Build, BuildStatus } from '@buildpilot/shared-types';
import { useStore } from '../store/store';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { Time } from '../lib/formatDate';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageContainer } from '../components/ui/PageContainer';
import { FilterPill } from '../components/ui/FilterPill';

// UI v2 Faz 7 — Builds list with three view modes:
//   • Table: column-rich list (default)
//   • Timeline: per-pipeline 24h strip showing each build as a block
//   • Heatmap: 90-day GitHub-style grid (success/failure colour density)
//
// All three share one filter set (project + pipeline + status + branch
// + date range) so toggling between modes never resets context.

type StatusFilter = 'all' | BuildStatus;
type ViewMode = 'table' | 'timeline' | 'heatmap';

const STATUS_LABELS: Record<BuildStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  success: 'Success',
  failed: 'Failed',
  cancelled: 'Cancelled',
  awaiting_approval: 'Awaiting approval',
};

const VIEW_KEY = 'buildpilot.builds.viewMode';
function readStoredView(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'table' || v === 'timeline' || v === 'heatmap') return v;
  } catch {
    /* ignore */
  }
  return 'table';
}

export function BuildsPage() {
  const projects = useStore((s) => s.projects);
  const pipelines = useStore((s) => s.pipelines);
  const setView = useStore((s) => s.setView);

  const [projectId, setProjectId] = useState<string>('');
  const [pipelineId, setPipelineId] = useState<string>('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [branchFilter, setBranchFilter] = useState<string>('');
  const [builds, setBuilds] = useState<Build[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => readStoredView());

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  const visiblePipelines = useMemo(
    () => (projectId ? pipelines.filter((p) => p.projectId === projectId) : pipelines),
    [pipelines, projectId],
  );

  const reload = async () => {
    setLoading(true);
    try {
      // Heatmap needs more history; table/timeline can live with the default.
      const limit = viewMode === 'heatmap' ? 1000 : 200;
      const list = await api.listBuilds({
        projectId: projectId || undefined,
        pipelineId: pipelineId || undefined,
        limit,
      });
      let filtered = status === 'all' ? list : list.filter((b) => b.status === status);
      if (branchFilter) {
        const q = branchFilter.toLowerCase();
        filtered = filtered.filter((b) => b.triggerBranch.toLowerCase().includes(q));
      }
      setBuilds(filtered);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // The view-mode dependency reloads when the limit changes (heatmap
    // needs more history than table/timeline). Filters reload through the
    // same effect so user edits show up immediately.
  }, [projectId, pipelineId, status, branchFilter, viewMode]);

  useEffect(() => {
    const id = setInterval(() => void reload(), 5_000);
    return () => clearInterval(id);
  }, [projectId, pipelineId, status, branchFilter, viewMode]);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const pipelineMap = useMemo(() => new Map(pipelines.map((p) => [p.id, p])), [pipelines]);

  const hasFilters =
    projectId !== '' || pipelineId !== '' || status !== 'all' || branchFilter !== '';

  return (
    <PageContainer>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">Builds</h1>
          <p className="mt-1 text-[12.5px] text-text-muted">
            Every build that has ever run on this machine. Logs are kept indefinitely.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* View toggle */}
          <div className="inline-flex items-center rounded-btn border border-border-subtle bg-bg-panel p-0.5">
            <ViewToggleBtn
              active={viewMode === 'table'}
              onClick={() => setViewMode('table')}
              icon={<LayoutList size={13} />}
              label="Table"
            />
            <ViewToggleBtn
              active={viewMode === 'timeline'}
              onClick={() => setViewMode('timeline')}
              icon={<History size={13} />}
              label="Timeline"
            />
            <ViewToggleBtn
              active={viewMode === 'heatmap'}
              onClick={() => setViewMode('heatmap')}
              icon={<Grid3X3 size={13} />}
              label="Heatmap"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void reload()}
            disabled={loading}
            leftIcon={<RefreshCw size={12} className={loading ? 'motion-safe:animate-spin' : ''} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Filter size={12} className="text-text-muted" aria-hidden />
        <PillDropdown
          label="Project"
          value={projectId}
          onChange={(v) => {
            setProjectId(v);
            setPipelineId('');
          }}
          options={[
            { value: '', label: 'All projects' },
            ...projects.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
        <PillDropdown
          label="Pipeline"
          value={pipelineId}
          onChange={setPipelineId}
          options={[
            { value: '', label: 'All pipelines' },
            ...visiblePipelines.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
        <PillDropdown
          label="Status"
          value={status === 'all' ? '' : status}
          onChange={(v) => setStatus((v as StatusFilter) || 'all')}
          options={[
            { value: '', label: 'All statuses' },
            ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: v })),
          ]}
        />
        <input
          type="text"
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          placeholder="Branch…"
          className="w-[160px] rounded-btn border border-border-subtle bg-bg-panel px-2.5 py-1 text-[12px] text-text-primary placeholder:text-text-faint focus:border-accent focus:outline-none transition-colors"
        />
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setProjectId('');
              setPipelineId('');
              setStatus('all');
              setBranchFilter('');
            }}
            className="text-[11px] text-text-muted hover:text-text-primary transition-colors"
          >
            Clear all
          </button>
        )}
        <span className="ml-auto text-[11px] text-text-faint">
          {builds.length} build{builds.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Body */}
      {builds.length === 0 ? (
        <BuildsEmptyState
          hasFilters={hasFilters}
          onClear={() => {
            setProjectId('');
            setPipelineId('');
            setStatus('all');
            setBranchFilter('');
          }}
          onTriggerFirst={() => {
            const firstPipeline = pipelines[0];
            if (firstPipeline) setView({ type: 'pipeline', id: firstPipeline.id });
            else if (projects[0]) useStore.getState().setProjectView(projects[0].id);
            else setView({ type: 'projects' });
          }}
          hasAnyPipeline={pipelines.length > 0}
        />
      ) : viewMode === 'table' ? (
        <BuildsTable
          builds={builds}
          projectMap={projectMap}
          pipelineMap={pipelineMap}
          onOpen={(id) => setView({ type: 'build', id })}
        />
      ) : viewMode === 'timeline' ? (
        <BuildsTimeline
          builds={builds}
          pipelineMap={pipelineMap}
          onOpen={(id) => setView({ type: 'build', id })}
        />
      ) : (
        <BuildsHeatmap
          builds={builds}
          onOpen={(id) => setView({ type: 'build', id })}
        />
      )}
    </PageContainer>
  );
}

// ── Table view ────────────────────────────────────────────────────────────

function BuildsTable({
  builds,
  projectMap,
  pipelineMap,
  onOpen,
}: {
  builds: ReadonlyArray<Build>;
  projectMap: Map<string, { id: string; name: string }>;
  pipelineMap: Map<string, { id: string; name: string }>;
  onOpen(id: string): void;
}) {
  return (
    <Card className="overflow-hidden">
      {/* Responsive overhaul Faz 3 — wrap the grid in an overflow-x-auto
          scroller so the 8 fixed columns (sum 750px) stay readable on
          phones via horizontal scroll instead of overflowing the page. */}
      <div className="overflow-x-auto">
      <div className="min-w-[760px] grid grid-cols-[120px_90px_minmax(0,1.5fr)_minmax(0,2fr)_120px_120px_90px_70px] px-3 py-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold border-b border-border-subtle">
        <div>Status</div>
        <div>Build #</div>
        <div>Project</div>
        <div>Pipeline / Branch</div>
        <div>Commit</div>
        <div>Started</div>
        <div className="text-right">Duration</div>
        <div className="text-right">Open</div>
      </div>
      {builds.map((b) => {
        const proj = projectMap.get(b.projectId);
        const pipe = pipelineMap.get(b.pipelineId);
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onOpen(b.id)}
            className="group grid min-w-[760px] grid-cols-[120px_90px_minmax(0,1.5fr)_minmax(0,2fr)_120px_120px_90px_70px] items-center px-3 h-10 text-[12.5px] border-b border-border-subtle last:border-b-0 hover:bg-bg-hover text-left w-full transition-colors"
          >
            <div>
              <Badge variant={mapStatusToBadgeVariant(b.status)}>{STATUS_LABELS[b.status]}</Badge>
            </div>
            <div className="font-mono text-[11px] text-text-faint">#{b.id.slice(0, 7)}</div>
            <div className="truncate text-text-primary">{proj?.name ?? '—'}</div>
            <div className="truncate text-text-secondary">
              {pipe?.name ?? '—'}{' '}
              <span className="font-mono text-emerald-400">{b.triggerBranch}</span>
            </div>
            <div className="font-mono text-[11px] text-accent">
              {b.triggerSha ? b.triggerSha.slice(0, 7) : '—'}
            </div>
            <div className="text-[11px] text-text-muted">
              <Time ts={b.startedAt} />
            </div>
            <div className="text-right text-[11px] text-text-muted font-mono">
              {formatDuration(b)}
            </div>
            <div className="text-right text-[11px] text-text-faint group-hover:text-accent transition-colors">
              →
            </div>
          </button>
        );
      })}
      </div>
    </Card>
  );
}

// ── Timeline view ─────────────────────────────────────────────────────────

function BuildsTimeline({
  builds,
  pipelineMap,
  onOpen,
}: {
  builds: ReadonlyArray<Build>;
  pipelineMap: Map<string, { id: string; name: string }>;
  onOpen(id: string): void;
}) {
  // Group by pipeline. Sort each row by startedAt ASC so blocks read
  // left-to-right chronologically.
  const groups = useMemo(() => {
    const m = new Map<string, Build[]>();
    for (const b of builds) {
      const list = m.get(b.pipelineId) ?? [];
      list.push(b);
      m.set(b.pipelineId, list);
    }
    for (const list of m.values()) {
      list.sort((a, b) => a.startedAt - b.startedAt);
    }
    return [...m.entries()];
  }, [builds]);

  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000;
  const start = now - windowMs;

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-[120px_minmax(0,1fr)] sm:grid-cols-[200px_minmax(0,1fr)] px-3 py-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold border-b border-border-subtle">
        <div>Pipeline</div>
        <div>Last 24h</div>
      </div>
      {groups.map(([pipelineId, pipelineBuilds]) => {
        const pipe = pipelineMap.get(pipelineId);
        return (
          <div
            key={pipelineId}
            className="grid grid-cols-[120px_minmax(0,1fr)] sm:grid-cols-[200px_minmax(0,1fr)] items-center px-3 h-10 border-b border-border-subtle last:border-b-0"
          >
            <div className="truncate text-[12.5px] text-text-primary">
              {pipe?.name ?? pipelineId.slice(0, 7)}
            </div>
            <div className="relative h-6">
              {pipelineBuilds
                .filter((b) => b.startedAt >= start)
                .map((b) => {
                  const left = ((b.startedAt - start) / windowMs) * 100;
                  const end = b.finishedAt ?? now;
                  const width = Math.max(0.5, ((end - b.startedAt) / windowMs) * 100);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onOpen(b.id)}
                      className={cn(
                        'absolute top-0 h-full rounded-sm transition-opacity hover:opacity-90',
                        b.status === 'success' && 'bg-status-success/70',
                        b.status === 'failed' && 'bg-status-failed/70',
                        b.status === 'running' && 'bg-status-running/70',
                        b.status === 'pending' && 'bg-status-pending/40',
                        b.status === 'cancelled' && 'bg-text-faint/40',
                        b.status === 'awaiting_approval' && 'bg-status-warn/60',
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${pipe?.name ?? ''} #${b.id.slice(0, 7)} — ${STATUS_LABELS[b.status]} — ${formatDuration(b)}`}
                    />
                  );
                })}
            </div>
          </div>
        );
      })}
      {groups.length === 0 && (
        <div className="text-center py-8 text-[12.5px] text-text-muted">
          No builds in the last 24h.
        </div>
      )}
    </Card>
  );
}

// ── Heatmap view ──────────────────────────────────────────────────────────

function BuildsHeatmap({
  builds,
  onOpen,
}: {
  builds: ReadonlyArray<Build>;
  onOpen(id: string): void;
}) {
  // Build day → status counts map. Heatmap shows 90 days × 1 column per
  // 7-day week so the grid stays a comfortable ~13 columns wide.
  const days = 90;
  const dayMs = 24 * 60 * 60 * 1000;
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const cells = useMemo(() => {
    const out: {
      day: number;
      label: string;
      total: number;
      failed: number;
      lastBuildId: string | null;
    }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const start = now.getTime() - i * dayMs - dayMs;
      const end = start + dayMs;
      const inDay = builds.filter((b) => b.startedAt >= start && b.startedAt < end);
      const failed = inDay.filter((b) => b.status === 'failed').length;
      const last = inDay[inDay.length - 1];
      out.push({
        day: i,
        label: new Date(end).toISOString().slice(0, 10),
        total: inDay.length,
        failed,
        lastBuildId: last?.id ?? null,
      });
    }
    return out;
  }, [builds, now]);

  const maxTotal = Math.max(1, ...cells.map((c) => c.total));

  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-3">
        Last {days} days · success vs failed density
      </div>
      <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1">
        {cells.map((c) => {
          const intensity = c.total === 0 ? 0 : c.total / maxTotal;
          const hasFailure = c.failed > 0;
          return (
            <button
              key={c.day}
              type="button"
              onClick={() => c.lastBuildId && onOpen(c.lastBuildId)}
              disabled={!c.lastBuildId}
              className={cn(
                'aspect-square rounded-sm transition-opacity',
                c.lastBuildId ? 'hover:opacity-80 cursor-pointer' : 'cursor-default',
                c.total === 0
                  ? 'bg-bg-elevated'
                  : hasFailure
                    ? 'bg-status-failed'
                    : 'bg-status-success',
              )}
              style={{ opacity: c.total === 0 ? 0.4 : 0.35 + 0.65 * intensity }}
              title={`${c.label} — ${c.total} build${c.total === 1 ? '' : 's'}${c.failed > 0 ? ` (${c.failed} failed)` : ''}`}
            />
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] text-text-faint">
        <span>{cells[0]?.label ?? ''}</span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-sm bg-bg-elevated opacity-40" /> 0
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-sm bg-status-success opacity-50" /> ok
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-sm bg-status-failed opacity-60" /> fail
          </span>
        </div>
        <span>{cells[cells.length - 1]?.label ?? ''}</span>
      </div>
    </Card>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────

function BuildsEmptyState({
  hasFilters,
  onClear,
  onTriggerFirst,
  hasAnyPipeline,
}: {
  hasFilters: boolean;
  onClear(): void;
  onTriggerFirst(): void;
  hasAnyPipeline: boolean;
}) {
  if (hasFilters) {
    return (
      <Card className="border-dashed p-10 text-center">
        <Filter className="mx-auto mb-3 text-text-muted" size={32} />
        <div className="text-sm font-medium text-text-primary">No builds match these filters</div>
        <p className="mt-1 text-xs text-text-muted">Try clearing them or widening the search.</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={onClear}>
          Clear filters
        </Button>
      </Card>
    );
  }
  return (
    <Card className="border-dashed p-10 text-center">
      <History className="mx-auto mb-3 text-text-muted" size={36} />
      <div className="text-base font-medium text-text-primary">No builds yet</div>
      <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
        Every build that has ever run on this machine will land here. Trigger your first
        pipeline to get started.
      </p>
      <div className="mt-5 flex justify-center">
        <Button variant="primary" onClick={onTriggerFirst} leftIcon={<Hammer size={14} />}>
          {hasAnyPipeline ? 'Open a pipeline' : 'Add a project'}
        </Button>
      </div>
    </Card>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

// FilterPill + native select overlay. The select sits on top with
// opacity:0 so the styled FilterPill renders the chrome while the
// browser handles keyboard nav + option list.
function PillDropdown({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  const selected = options.find((o) => o.value === value);
  const active = value !== '';
  return (
    <div className="relative">
      <FilterPill
        label={`${label}:`}
        value={selected && active ? selected.label : 'all'}
        active={active}
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer w-full"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ViewToggleBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick(): void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn(
        'inline-flex items-center gap-1 px-2 h-6 rounded text-[11px] transition-colors',
        active
          ? 'bg-bg-hover text-text-primary'
          : 'text-text-muted hover:text-text-primary',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function mapStatusToBadgeVariant(s: BuildStatus): 'success' | 'failed' | 'running' | 'pending' | 'warn' | 'neutral' {
  switch (s) {
    case 'success': return 'success';
    case 'failed': return 'failed';
    case 'running': return 'running';
    case 'pending': return 'pending';
    case 'awaiting_approval': return 'warn';
    default: return 'neutral';
  }
}

function formatDuration(b: Build): string {
  if (!b.finishedAt) return b.status === 'running' ? '…' : '—';
  const ms = b.finishedAt - b.startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}
