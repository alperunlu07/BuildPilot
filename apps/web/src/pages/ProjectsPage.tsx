import {
  ChevronDown,
  Download,
  Eye,
  Folder,
  GitBranch,
  Grid3X3,
  List,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { api } from '../lib/api';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageContainer } from '../components/ui/PageContainer';
import { Input } from '../components/ui/Input';
import { Sparkline, type SparklineBar, type SparklineStatus } from '../components/ui/Sparkline';
import { StatusDot } from '../components/ui/StatusDot';
import { Time } from '../lib/formatDate';
import type { Project, ProjectImportSummary } from '@buildpilot/shared-types';
import { ProjectExportDialog } from '../components/ProjectExportDialog';
import { ProjectImportDialog } from '../components/ProjectImportDialog';

// UI v2 Faz 4 — full Projects page rewrite. Grid (default) + table view,
// search filter, sort dropdown, per-card sparkline with success-rate.
// Card click navigates to the project's first pipeline (T4.7 — the
// intermediate "project detail" route is deferred to a cleanup PR but
// the UX shift happens now).

type ViewMode = 'grid' | 'table';
type SortMode = 'recent' | 'name' | 'builds';

const VIEW_KEY = 'buildpilot.projects.view';
const SORT_KEY = 'buildpilot.projects.sort';

function readStoredView(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'grid' || v === 'table') return v;
  } catch {
    // ignore
  }
  return 'grid';
}
function readStoredSort(): SortMode {
  try {
    const v = localStorage.getItem(SORT_KEY);
    if (v === 'recent' || v === 'name' || v === 'builds') return v;
  } catch {
    // ignore
  }
  return 'recent';
}

interface Props {
  onAdd(): void;
}

export function ProjectsPage({ onAdd }: Props) {
  const projects = useStore((s) => s.projects);
  const pipelines = useStore((s) => s.pipelines);
  const builds = useStore((s) => s.builds);
  const setView = useStore((s) => s.setView);
  const softDeleteProject = useStore((s) => s.softDeleteProject);

  const [viewMode, setViewMode] = useState<ViewMode>(() => readStoredView());
  const [sortMode, setSortMode] = useState<SortMode>(() => readStoredSort());
  const [sortOpen, setSortOpen] = useState(false);
  const [filter, setFilter] = useState('');
  // Cluster 12 — encrypted project bundle export / import.
  const [exportingProject, setExportingProject] = useState<Project | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const loadProjects = useStore((s) => s.loadProjects);

  function onImported(summary: ProjectImportSummary): void {
    // Pull fresh data so the new project shows up in the list.
    void loadProjects();
    void summary;
  }

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);
  useEffect(() => {
    try {
      localStorage.setItem(SORT_KEY, sortMode);
    } catch {
      /* ignore */
    }
  }, [sortMode]);

  // Derive per-project counts from the store so we don't depend on a
  // new backend endpoint. Builds across all pipelines for a project.
  const pipelinesByProject = useMemo(() => {
    const m = new Map<string, typeof pipelines>();
    for (const pl of pipelines) {
      const list = m.get(pl.projectId) ?? [];
      list.push(pl);
      m.set(pl.projectId, list);
    }
    return m;
  }, [pipelines]);

  const buildsByProject = useMemo(() => {
    const m = new Map<string, typeof builds>();
    for (const b of builds) {
      const list = m.get(b.projectId) ?? [];
      list.push(b);
      m.set(b.projectId, list);
    }
    return m;
  }, [builds]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const matches = q
      ? projects.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.path.toLowerCase().includes(q) ||
            p.defaultBranch.toLowerCase().includes(q),
        )
      : projects;
    const sorted = [...matches];
    if (sortMode === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === 'builds') {
      sorted.sort(
        (a, b) =>
          (buildsByProject.get(b.id)?.length ?? 0) -
          (buildsByProject.get(a.id)?.length ?? 0),
      );
    } else {
      // recent — by most recent build's startedAt, falling back to created.
      sorted.sort((a, b) => {
        const aLast = (buildsByProject.get(a.id) ?? []).reduce(
          (acc, x) => Math.max(acc, x.startedAt ?? 0),
          a.createdAt,
        );
        const bLast = (buildsByProject.get(b.id) ?? []).reduce(
          (acc, x) => Math.max(acc, x.startedAt ?? 0),
          b.createdAt,
        );
        return bLast - aLast;
      });
    }
    return sorted;
  }, [projects, filter, sortMode, buildsByProject]);

  const totalPipelines = pipelines.length;
  const activeBuilds = builds.filter((b) => b.status === 'running').length;

  function openProject(p: Project) {
    // T4.7 — navigate straight to the first pipeline if any; fall back to
    // the legacy project detail screen when the project is pipeline-less
    // (the detail page has the empty-state with a "create pipeline" CTA).
    const projectPipelines = pipelinesByProject.get(p.id) ?? [];
    const first = projectPipelines[0];
    if (first) {
      setView({ type: 'pipeline', id: first.id });
    } else {
      // Faz 4 — `project` view type removed. Pipelineless projects
      // route back to the projects list, where the user can pick
      // another or trigger the "Add pipeline" flow.
      setView({ type: 'projects' });
    }
  }

  return (
    <PageContainer maxWidth="1400px">
      {/* Page head — stacks vertically on phones so the 280px filter
          input + sort toggle don't push past the 390px viewport. */}
      <div className="flex flex-col gap-3 mb-5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            Projects
          </h1>
          <div className="mt-1 text-[12.5px] text-text-muted">
            {projects.length} project{projects.length === 1 ? '' : 's'} ·{' '}
            {totalPipelines} pipeline{totalPipelines === 1 ? '' : 's'}
            {activeBuilds > 0 && (
              <>
                {' · '}
                <span className="text-status-running">{activeBuilds} active build{activeBuilds === 1 ? '' : 's'}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <div className="relative w-full sm:w-[280px]">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint pointer-events-none"
              aria-hidden
            />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter projects (name, path, branch)"
              className="pl-7"
            />
          </div>
          <div className="inline-flex items-center rounded-btn border border-border-subtle bg-bg-panel p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
                viewMode === 'grid'
                  ? 'bg-bg-hover text-text-primary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
              title="Grid view"
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
            >
              <Grid3X3 size={13} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
                viewMode === 'table'
                  ? 'bg-bg-hover text-text-primary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
              title="Table view"
              aria-label="Table view"
              aria-pressed={viewMode === 'table'}
            >
              <List size={13} />
            </button>
          </div>
          <div className="relative">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSortOpen((v) => !v)}
              rightIcon={<ChevronDown size={11} />}
            >
              Sort: {sortMode === 'recent' ? 'Recent' : sortMode === 'name' ? 'Name' : 'Most builds'}
            </Button>
            {sortOpen && (
              <>
                {/* Click-outside catcher */}
                <div className="fixed inset-0 z-30" onClick={() => setSortOpen(false)} aria-hidden />
                <div className="absolute right-0 mt-1 z-40 min-w-[160px] bg-bg-panel border border-border rounded-btn shadow-xl py-1">
                  {(['recent', 'name', 'builds'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setSortMode(m);
                        setSortOpen(false);
                      }}
                      className={`block w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-bg-hover ${
                        sortMode === m ? 'text-accent' : 'text-text-secondary'
                      }`}
                    >
                      {m === 'recent' ? 'Recent activity' : m === 'name' ? 'Name (A → Z)' : 'Most builds'}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setImportOpen(true)}
            leftIcon={<Upload size={12} />}
          >
            Import
          </Button>
          <Button variant="primary" size="sm" onClick={onAdd} leftIcon={<Plus size={12} />}>
            Add project
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {projects.length === 0 ? (
        <Card className="border-dashed py-12 text-center">
          <Folder className="mx-auto mb-3 text-text-muted" size={36} />
          <div className="text-base font-medium text-text-primary">No projects yet</div>
          <p className="mx-auto mt-1 max-w-md text-[12.5px] text-text-muted">
            BuildPilot watches local git repositories and runs pipelines on every new
            commit. Point it at a folder to start.
          </p>
          <div className="mt-5 flex justify-center">
            <Button variant="primary" onClick={onAdd} leftIcon={<Plus size={14} />}>
              Add your first project
            </Button>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <div className="text-center text-[12.5px] text-text-muted py-12">
          No projects match "{filter}".
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              pipelineCount={pipelinesByProject.get(p.id)?.length ?? 0}
              totalBuilds={buildsByProject.get(p.id)?.length ?? 0}
              onOpen={() => openProject(p)}
              onDelete={() => softDeleteProject(p.id)}
              onExport={() => setExportingProject(p)}
            />
          ))}
        </div>
      ) : (
        <ProjectsTable
          projects={filtered}
          pipelinesByProject={pipelinesByProject}
          buildsByProject={buildsByProject}
          onOpen={openProject}
          onDelete={(id) => softDeleteProject(id)}
          onExport={(p) => setExportingProject(p)}
        />
      )}

      <ProjectExportDialog
        project={exportingProject}
        open={exportingProject !== null}
        onClose={() => setExportingProject(null)}
      />
      <ProjectImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={onImported}
      />
    </PageContainer>
  );
}

// ── Project Card ──────────────────────────────────────────────────────────

function ProjectCard({
  project,
  pipelineCount,
  totalBuilds,
  onOpen,
  onDelete,
  onExport,
}: {
  project: Project;
  pipelineCount: number;
  totalBuilds: number;
  onOpen(): void;
  onDelete(): void;
  onExport(): void;
}): JSX.Element {
  const sparkline = useProjectSparkline(project.id);
  const { successRate, lastStatus } = useMemo(() => {
    if (!sparkline) return { successRate: null, lastStatus: null };
    const succ = sparkline.filter((b) => b.status === 'success').length;
    const fail = sparkline.filter((b) => b.status === 'failed').length;
    const denom = succ + fail;
    return {
      successRate: denom > 0 ? Math.round((succ / denom) * 100) : null,
      lastStatus: sparkline[sparkline.length - 1]?.status ?? null,
    };
  }, [sparkline]);

  return (
    <Card interactive className="group p-3.5 flex flex-col gap-3" onClick={onOpen}>
      {/* Head: folder icon + name + dot + more */}
      <div className="flex items-start gap-2 min-w-0">
        <Folder size={14} className="text-accent shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-medium text-text-primary truncate">
              {project.name}
            </span>
            <span title="Poller active" aria-label="Poller active">
              <StatusDot variant="success" size={6} />
            </span>
          </div>
          <code className="block mt-0.5 text-[11px] font-mono text-text-faint truncate">
            {project.path}
          </code>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExport();
            }}
            className="opacity-0 group-hover:opacity-100 rounded-btn p-1 text-text-muted hover:bg-bg-hover hover:text-accent transition-opacity [@media(pointer:coarse)]:opacity-100"
            title="Export project (encrypted bundle)"
            aria-label={`Export project ${project.name}`}
          >
            <Download size={13} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="opacity-0 group-hover:opacity-100 rounded-btn p-1 text-text-muted hover:bg-bg-hover hover:text-rose-300 transition-opacity [@media(pointer:coarse)]:opacity-100"
            title="Remove project"
            aria-label={`Remove project ${project.name}`}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Meta pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="neutral" icon={<GitBranch size={9} className="text-emerald-400" />}>
          <span className="font-mono">{project.defaultBranch}</span>
        </Badge>
        <Badge variant="neutral" icon={<Eye size={9} />}>
          0 watched
        </Badge>
        <Badge variant="neutral">
          <span className="font-mono">{pipelineCount}</span> pipeline{pipelineCount === 1 ? '' : 's'}
        </Badge>
      </div>

      {/* Sparkline + success rate */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
            Last 30 builds
          </span>
          {successRate !== null && (
            <span
              className={`text-[11px] font-mono ${
                successRate >= 90 ? 'text-status-success' : 'text-status-failed'
              }`}
            >
              {successRate}% success
            </span>
          )}
        </div>
        <Sparkline
          bars={sparkline ?? []}
          slots={30}
          height={28}
        />
      </div>

      {/* Foot: last build status + stats */}
      <div className="flex items-end justify-between pt-1 border-t border-border-subtle gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            {lastStatus && (
              <Badge variant={mapStatusToVariant(lastStatus)}>
                {lastStatus}
              </Badge>
            )}
            {project.createdAt && (
              <span className="text-[11px] text-text-muted truncate">
                <Time ts={project.createdAt} prefix="added" />
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="font-mono text-[12px] text-text-primary">{totalBuilds}</div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted">builds</div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Projects Table ────────────────────────────────────────────────────────

function ProjectsTable({
  projects,
  pipelinesByProject,
  buildsByProject,
  onOpen,
  onDelete,
  onExport,
}: {
  projects: ReadonlyArray<Project>;
  pipelinesByProject: ReadonlyMap<string, ReadonlyArray<unknown>>;
  buildsByProject: ReadonlyMap<string, ReadonlyArray<{ status: string }>>;
  onOpen(p: Project): void;
  onDelete(id: string): void;
  onExport(p: Project): void;
}): JSX.Element {
  return (
    <Card className="overflow-clip">
      {/* Responsive overhaul Faz 3 — wrap the 7-column table so phones
          can horizontally scroll instead of clipping. Review follow-up:
          Card uses `overflow-clip` (not `hidden`) so it doesn't
          establish a new block formatting context — plain
          `overflow-hidden` prevented the inner scroller's horizontal
          scrollbar from showing and broke iOS Safari momentum scroll
          inside a rounded-clipped ancestor. `overscroll-x-contain`
          keeps swipes inside the table. */}
      <div className="overflow-x-auto overscroll-x-contain">
      <div className="min-w-[920px] grid grid-cols-[minmax(0,2fr)_120px_100px_180px_minmax(0,3fr)_100px_64px] px-3 py-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold border-b border-border-subtle">
        <div>Project</div>
        <div>Branch</div>
        <div>Pipelines</div>
        <div>30-day history</div>
        <div>Path</div>
        <div className="text-right">Success</div>
        <div />
      </div>
      {projects.map((p) => (
        <ProjectRow
          key={p.id}
          project={p}
          pipelineCount={pipelinesByProject.get(p.id)?.length ?? 0}
          buildCount={buildsByProject.get(p.id)?.length ?? 0}
          onOpen={() => onOpen(p)}
          onDelete={() => onDelete(p.id)}
          onExport={() => onExport(p)}
        />
      ))}
      </div>
    </Card>
  );
}

function ProjectRow({
  project,
  pipelineCount,
  buildCount: _buildCount,
  onOpen,
  onDelete,
  onExport,
}: {
  project: Project;
  pipelineCount: number;
  buildCount: number;
  onOpen(): void;
  onDelete(): void;
  onExport(): void;
}): JSX.Element {
  const sparkline = useProjectSparkline(project.id);
  const { successRate } = useMemo(() => {
    if (!sparkline) return { successRate: null };
    const succ = sparkline.filter((b) => b.status === 'success').length;
    const fail = sparkline.filter((b) => b.status === 'failed').length;
    const denom = succ + fail;
    return { successRate: denom > 0 ? Math.round((succ / denom) * 100) : null };
  }, [sparkline]);

  return (
    <div
      className="group grid min-w-[920px] grid-cols-[minmax(0,2fr)_120px_100px_180px_minmax(0,3fr)_100px_64px] items-center gap-2 px-3 h-10 text-[12.5px] border-b border-border-subtle last:border-b-0 hover:bg-bg-hover cursor-pointer transition-colors"
      onClick={onOpen}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Folder size={13} className="text-accent shrink-0" />
        <span className="font-medium text-text-primary truncate">{project.name}</span>
      </div>
      <div>
        <Badge variant="neutral" icon={<GitBranch size={9} className="text-emerald-400" />}>
          <span className="font-mono">{project.defaultBranch}</span>
        </Badge>
      </div>
      <div className="font-mono text-text-muted">{pipelineCount}</div>
      <div>
        <Sparkline bars={sparkline ?? []} slots={30} height={22} />
      </div>
      <div className="font-mono text-[11px] text-text-muted truncate">{project.path}</div>
      <div
        className={`text-right font-mono ${
          successRate === null
            ? 'text-text-muted'
            : successRate >= 90
              ? 'text-status-success'
              : 'text-status-failed'
        }`}
      >
        {successRate === null ? '—' : `${successRate}%`}
      </div>
      <div className="flex items-center gap-0.5 justify-end">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExport();
          }}
          className="touch-target opacity-0 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100 rounded-btn p-1 text-text-muted hover:text-accent transition-opacity"
          title="Export project (encrypted bundle)"
          aria-label={`Export project ${project.name}`}
        >
          <Download size={12} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          // Responsive overhaul follow-up — opacity-0 group-hover only
          // works with a pointer. On coarse-pointer devices (phones,
          // tablets, touch laptops) keep the button visible so the row
          // stays deletable.
          className="touch-target opacity-0 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100 rounded-btn p-1 text-text-muted hover:text-rose-300 transition-opacity"
          title="Remove project"
          aria-label={`Remove project ${project.name}`}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function useProjectSparkline(id: string): SparklineBar[] | null {
  const [data, setData] = useState<SparklineBar[] | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .projectSparkline(id, 30)
      .then((rows) => {
        if (!alive) return;
        setData(
          rows.map((r) => ({
            status: mapStatusToSparkline(r.status),
            tooltip: `#${r.id.slice(0, 7)} · ${r.status}`,
          })),
        );
      })
      .catch(() => {
        if (alive) setData([]);
      });
    return () => {
      alive = false;
    };
  }, [id]);
  return data;
}

function mapStatusToSparkline(s: string): SparklineStatus {
  switch (s) {
    case 'success': return 'success';
    case 'failed': return 'failed';
    case 'running': return 'running';
    case 'pending': return 'pending';
    case 'cancelled': return 'cancel';
    case 'skipped': return 'skipped';
    default: return 'empty';
  }
}

function mapStatusToVariant(s: SparklineStatus): 'success' | 'failed' | 'running' | 'pending' | 'neutral' {
  switch (s) {
    case 'success': return 'success';
    case 'failed': return 'failed';
    case 'running': return 'running';
    case 'pending': return 'pending';
    default: return 'neutral';
  }
}
