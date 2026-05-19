import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, Download, FileBarChart, Filter, GitCompareArrows, Grid3X3, Link2, RotateCcw, Square } from 'lucide-react';
import type {
  AnnotationsReport,
  Build,
  BuildApproval,
  BuildArtifact,
  BuildLogEntry,
  BuildLogLevel,
  StepType,
  TestReportTree,
} from '@buildpilot/shared-types';
import { useStore } from '../store/store';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { statusIcon, statusIconAnimationClass, statusLabel } from '../lib/statusIcon';
import { LogTable } from '../components/LogTable';
import { MatrixRunSummary } from '../components/MatrixRunSummary';
import { StepGantt } from '../components/StepGantt';
import { defaultActiveLevels } from '../components/LevelToggleBar';
import { ArtifactPreviewModal } from '../components/ArtifactPreviewModal';
import { FailureSummaryCard } from '../components/FailureSummaryCard';
import { PrSummaryCard } from '../components/PrSummaryCard';
import { ApprovalCard } from '../components/ApprovalCard';
import { subscribe } from '../lib/events';
import {
  LogSearchBar,
  loadLogPresets,
  saveLogPresets,
  useCompiledFilter,
  type SavedLogFilter,
} from '../components/LogSearchBar';
import { TimestampRangeSlider } from '../components/TimestampRangeSlider';
import { LogGroupBar } from '../components/LogGroupBar';
import { StepDurationCompare } from '../components/StepDurationCompare';
import { BuildDiffView } from '../components/BuildDiffView';
import { commandFromEntry } from '../lib/copyCommand';
import { buildGroupFilter, detectLogGroups } from '../lib/logGroups';
import { Time } from '../lib/formatDate';

const EMPTY: BuildLogEntry[] = [];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

// Extensions whose contents the inline text preview modal can't render
// usefully — clicking "preview" on these just shows U+FFFD garbage. The UI
// hides the preview action and falls back to a "reveal in folder" affordance
// for these. Conservative whitelist of binary types we actually produce or
// the user is likely to drop into a pipeline.
const BINARY_EXT = new Set([
  // Android / iOS / desktop installers
  '.apk', '.aab', '.ipa', '.dmg', '.pkg', '.deb', '.rpm', '.msi', '.exe',
  // Native libs
  '.dll', '.so', '.dylib', '.bin',
  // Archives
  '.zip', '.tar', '.gz', '.tgz', '.7z', '.rar', '.bz2', '.xz', '.iso', '.img',
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.ico',
  // Video / audio
  '.mp4', '.mov', '.webm', '.avi', '.mkv', '.mp3', '.wav', '.ogg', '.flac',
  // Misc
  '.pdf',
]);

function isBinaryArtifact(path: string): boolean {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return false;
  return BINARY_EXT.has(path.slice(dot).toLowerCase());
}

interface Props {
  buildId: string;
}

// UI v2 Faz 6.A — the 7-tab navigation outlined in MIGRATION_TODO.
// `overview` and `logs` carry real content today; the remaining four
// render placeholders until the respective 6.B sub-PRs land.
type BuildDetailTab =
  | 'overview'
  | 'logs'
  | 'pipeline'
  | 'artifacts'
  | 'environment'
  | 'tests'
  | 'annotations';

const TAB_ORDER: ReadonlyArray<BuildDetailTab> = [
  'overview',
  'logs',
  'pipeline',
  'artifacts',
  'environment',
  'tests',
  'annotations',
];

const TAB_META: Record<BuildDetailTab, { label: string; disabled?: boolean; placeholder?: string }> = {
  overview: { label: 'Overview' },
  logs: { label: 'Logs' },
  pipeline: {
    label: 'Pipeline',
    disabled: true,
    placeholder:
      'Read-only canvas showing the pipeline snapshot at build time. Wired up alongside the Faz 6.B pipeline-snapshot endpoint.',
  },
  artifacts: { label: 'Artifacts' },
  environment: {
    label: 'Environment',
    disabled: true,
    placeholder:
      'Environment variables resolved at build time (secrets masked) plus the SSH builder hosts each step landed on. Needs an env-capture step in the engine; tracked separately.',
  },
  tests: { label: 'Tests' },
  annotations: { label: 'Annotations' },
};

const ALL_LEVELS: BuildLogLevel[] = [
  'system',
  'info',
  'stdout',
  'stderr',
  'success',
  'failure',
];

export function BuildDetailPage({ buildId }: Props) {
  const projects = useStore((s) => s.projects);
  const pipelines = useStore((s) => s.pipelines);
  const setView = useStore((s) => s.setView);
  const seedBuildEntries = useStore((s) => s.seedBuildEntries);
  const cancelBuild = useStore((s) => s.cancelBuild);
  const triggerBuild = useStore((s) => s.triggerBuild);
  const entries = useStore((s) => s.entriesByBuild[buildId] ?? EMPTY);

  const [build, setBuild] = useState<Build | null>(null);
  const [loading, setLoading] = useState(true);
  const [artifacts, setArtifacts] = useState<BuildArtifact[]>([]);
  const [approvals, setApprovals] = useState<BuildApproval[]>([]);
  // UI v2 Faz 6.A — tab shell for the build detail page. Default lands on
  // Overview (the legacy single-page experience). Logs lifts the bottom
  // section out of the scroll so users can jump straight to the table.
  // Pipeline / Artifacts / Environment / Tests / Annotations stay as
  // placeholders here; their content is wired up in 6.B sub-PRs.
  const [activeTab, setActiveTab] = useState<BuildDetailTab>('overview');
  // Selected artifact for the inline log viewer modal. null = closed.
  const [previewArtifact, setPreviewArtifact] = useState<BuildArtifact | null>(null);
  // Cluster 11.C — matrix children. Populated only when this build is the
  // parent of a matrix fan-out; non-matrix builds keep this empty and
  // skip rendering MatrixRunSummary.
  const [matrixChildren, setMatrixChildren] = useState<Build[]>([]);
  const [matrixRerunning, setMatrixRerunning] = useState(false);

  const [activeLevels, setActiveLevels] = useState<Set<BuildLogLevel>>(
    () => defaultActiveLevels(),
  );
  const [activeNodeId, setActiveNodeId] = useState<string | 'all'>('all');
  const [query, setQuery] = useState('');
  const [regex, setRegex] = useState(false);
  const filter = useCompiledFilter(query, regex);
  // Selected timestamp window — null = full build duration (no filter).
  const [tsRange, setTsRange] = useState<[number, number] | null>(null);
  const [presets, setPresets] = useState<SavedLogFilter[]>(() => loadLogPresets());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffCandidates, setDiffCandidates] = useState<Build[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setBuild(null);

    Promise.all([
      api.getBuild(buildId),
      api.getBuildEntries(buildId),
      api.getBuildArtifacts(buildId).catch(() => []),
      api.listChildBuilds(buildId).catch(() => [] as Build[]),
      api.buildApprovals(buildId).catch(() => [] as BuildApproval[]),
    ])
      .then(([b, ents, arts, children, apps]) => {
        if (!alive) return;
        setBuild(b);
        setArtifacts(arts);
        setMatrixChildren(children);
        setApprovals(apps);
        // Legacy builds (created before the structured-log table) only have
        // the flat `build.log` text. Synthesize one stdout-level entry per
        // line so the table view still shows them.
        let toSeed = ents;
        if (ents.length === 0 && b.log && b.log.length > 0) {
          toSeed = b.log
            .split(/\r?\n/)
            .filter((l) => l.length > 0)
            .map((message, i) => ({
              seq: -(i + 1),
              ts: b.startedAt + i,
              level: 'stdout' as BuildLogLevel,
              nodeId: null,
              stepType: null,
              message,
            }));
        }
        seedBuildEntries(buildId, toSeed);
      })
      .catch(() => {
        if (alive) setBuild(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [buildId, seedBuildEntries]);

  useEffect(() => {
    if (!build || matrixChildren.length === 0) return;
    const stillMoving =
      build.status === 'running' ||
      build.status === 'pending' ||
      matrixChildren.some(
        (c) => c.status === 'running' || c.status === 'pending',
      );
    if (!stillMoving) return;
    const handle = window.setInterval(async () => {
      try {
        const [refreshed, refreshedChildren] = await Promise.all([
          api.getBuild(buildId),
          api.listChildBuilds(buildId),
        ]);
        setBuild(refreshed);
        setMatrixChildren(refreshedChildren);
      } catch {
        /* swallow */
      }
    }, 2000);
    return () => window.clearInterval(handle);
  }, [buildId, build, matrixChildren]);

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === 'buildAwaitingApproval' && event.buildId === buildId) {
        setApprovals((cur) => {
          const without = cur.filter((a) => a.id !== event.approval.id);
          return [...without, event.approval];
        });
        setBuild((b) => (b ? { ...b, status: 'awaiting_approval' } : b));
      } else if (event.type === 'buildApprovalDecided' && event.buildId === buildId) {
        void api.buildApprovals(buildId).then((apps) => setApprovals(apps));
        void api.getBuild(buildId).then((b) => setBuild(b));
      } else if (event.type === 'buildStarted' && event.build.id === buildId) {
        setBuild(event.build);
      } else if (event.type === 'buildFinished' && event.build.id === buildId) {
        setBuild(event.build);
      }
    });
  }, [buildId]);

  const proj = build ? projects.find((p) => p.id === build.projectId) : null;
  const pipe = build ? pipelines.find((p) => p.id === build.pipelineId) : null;

  // Build a label map nodeId → "stepType:idShort" using the pipeline definition
  // when available so the Node column reads naturally.
  const nodeLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    if (pipe) {
      for (const n of pipe.nodes) {
        map.set(n.id, `${n.type}`);
      }
    }
    return map;
  }, [pipe]);

  // Find the failed step (last entry with level === 'failure' that has a nodeId)
  // so we can offer a "Retry from failed step" button.
  const failedNodeId = useMemo(() => {
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i]!;
      if (e.level === 'failure' && e.nodeId) return e.nodeId;
    }
    return null;
  }, [entries]);

  const distinctNodes = useMemo(() => {
    const seen = new Map<string, StepType | null>();
    for (const e of entries) {
      if (e.nodeId && !seen.has(e.nodeId)) seen.set(e.nodeId, e.stepType);
    }
    return [...seen.entries()];
  }, [entries]);

  // Cluster 11.F — detect when a build has a test report or coverage
  // artifact so we can offer a "Tests" jump-link button in the header.
  const hasTestArtifact = useMemo(
    () =>
      artifacts.some(
        (a) =>
          /\.xcresult\/?$/i.test(a.path) ||
          (a.path.toLowerCase().endsWith('.xml') &&
            !/(?:^|\/)(coverage|cobertura)[^/]*\.xml$/i.test(a.path)),
      ),
    [artifacts],
  );

  const logGroups = useMemo(() => detectLogGroups(entries), [entries]);
  const groupFilter = useMemo(
    () => buildGroupFilter(logGroups, collapsedGroups),
    [logGroups, collapsedGroups],
  );

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (!activeLevels.has(e.level)) return false;
      if (activeNodeId !== 'all') {
        if (activeNodeId === '__pipeline__') {
          if (e.nodeId !== null) return false;
        } else if (e.nodeId !== activeNodeId) {
          return false;
        }
      }
      if (tsRange && (e.ts < tsRange[0] || e.ts > tsRange[1])) return false;
      if (!groupFilter(e)) return false;
      if (!filter.match(e.message)) return false;
      return true;
    });
  }, [entries, activeLevels, activeNodeId, filter, tsRange, groupFilter]);

  // Bounds for the timestamp slider — earliest / latest log timestamp,
  // falling back to the build start/finish if no entries yet.
  const tsBounds = useMemo<[number, number] | null>(() => {
    if (!build) return null;
    const lo = entries.length > 0 ? entries[0]!.ts : build.startedAt;
    const hi = entries.length > 0
      ? entries[entries.length - 1]!.ts
      : build.finishedAt ?? Date.now();
    if (hi <= lo) return null;
    return [lo, hi];
  }, [entries, build]);

  const downloadLog = () => {
    if (!build) return;
    const lines = entries.map(
      (e) =>
        `[${new Date(e.ts).toISOString()}] [${e.level.toUpperCase()}] [${
          e.nodeId ? `${e.stepType ?? '?'}:${e.nodeId}` : 'pipeline'
        }] ${e.message}`,
    );
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `build-${build.id.slice(0, 8)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleLevel = (lvl: BuildLogLevel) => {
    const next = new Set(activeLevels);
    if (next.has(lvl)) next.delete(lvl);
    else next.add(lvl);
    setActiveLevels(next);
  };

  if (loading && !build) {
    return <div className="p-8 text-sm text-text-muted">Loading build…</div>;
  }
  if (!build) {
    return (
      <div className="p-8 text-sm text-text-muted">
        Build not found.{' '}
        <button
          type="button"
          className="text-accent hover:underline"
          onClick={() => setView({ type: 'builds' })}
        >
          Back to builds
        </button>
      </div>
    );
  }

  const finished =
    build.status === 'success' ||
    build.status === 'failed' ||
    build.status === 'cancelled';

  // Cluster 11.C — this build is a parent matrix run when it has children
  // (children rows reference this build via parent_build_id). The reverse
  // — a build with a parentBuildId — is a matrix child that gets a "back
  // to matrix" link instead of the regular Builds back button.
  const isMatrixParent = matrixChildren.length > 0;
  const isMatrixChild = build.parentBuildId !== null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border-subtle bg-bg-panel px-3 py-3 sm:px-6">
        {isMatrixChild && build.parentBuildId ? (
          <button
            type="button"
            onClick={() => setView({ type: 'build', id: build.parentBuildId! })}
            className="inline-flex items-center gap-1 rounded text-[11px] uppercase tracking-wider text-accent hover:text-accent-hover transition-colors"
            aria-label="Back to parent matrix build"
          >
            <ChevronLeft size={12} /> Matrix
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setView({ type: 'builds' })}
            className="inline-flex items-center gap-1 rounded text-[11px] uppercase tracking-wider text-text-muted hover:text-text-primary transition-colors"
            aria-label="Back to builds list"
          >
            <ChevronLeft size={12} /> Builds
          </button>
        )}
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-lg font-semibold text-text-primary tracking-tight">
            {pipe?.name ?? 'Unknown pipeline'}
          </h1>
          {(() => {
            const StatusIcon = statusIcon(build.status);
            return (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider',
                  build.status === 'running' && 'bg-amber-950/50 text-amber-300',
                  build.status === 'success' && 'bg-emerald-950/50 text-emerald-300',
                  build.status === 'failed' && 'bg-rose-950/50 text-rose-300',
                  build.status === 'pending' && 'bg-bg-elevated text-text-muted',
                  build.status === 'cancelled' && 'bg-bg-elevated text-text-muted',
                )}
                role="status"
                aria-label={statusLabel(build.status)}
              >
                <StatusIcon
                  size={11}
                  className={statusIconAnimationClass(build.status)}
                  aria-hidden="true"
                />
                {build.status}
              </span>
            );
          })()}
          <span className="text-xs text-text-muted">
            in <span className="text-text-secondary">{proj?.name ?? '—'}</span>
          </span>
          {isMatrixParent && (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-indigo-950/50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-indigo-300"
              title={`Matrix run with ${matrixChildren.length} cell${matrixChildren.length === 1 ? '' : 's'}`}
            >
              <Grid3X3 size={11} aria-hidden="true" /> matrix · {matrixChildren.length}
            </span>
          )}
          {isMatrixChild && build.matrixLabel && (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-indigo-950/50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-indigo-300"
              title="This build is one cell of a matrix run"
            >
              <Grid3X3 size={11} aria-hidden="true" />{' '}
              <span className="font-mono normal-case">{build.matrixLabel}</span>
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
          <span className="font-mono">{build.id}</span>
          <span>·</span>
          <span>
            branch{' '}
            <span className="font-mono text-emerald-400">{build.triggerBranch || '—'}</span>
          </span>
          <span>·</span>
          <span>
            commit{' '}
            <span className="font-mono text-accent">
              {build.triggerSha ? build.triggerSha.slice(0, 7) : '—'}
            </span>
          </span>
          <span>·</span>
          <Time ts={build.startedAt} prefix="started" />
          {finished && build.finishedAt && (
            <>
              <span>·</span>
              <Time ts={build.finishedAt} prefix="finished" />
            </>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {!finished && (
              <button
                type="button"
                onClick={() => void cancelBuild(build.id)}
                className="focusable inline-flex items-center gap-1 rounded-md border border-rose-700/60 px-2 py-0.5 text-rose-300 hover:border-rose-500 hover:text-rose-200"
              >
                <Square size={10} /> Cancel
              </button>
            )}
            {build.status === 'failed' && failedNodeId && (
              <button
                type="button"
                onClick={async () => {
                  const next = await triggerBuild(build.pipelineId, failedNodeId);
                  setView({ type: 'build', id: next.id });
                }}
                className="focusable inline-flex items-center gap-1 rounded-md border border-amber-700/60 px-2 py-0.5 text-amber-300 hover:border-amber-500 hover:text-amber-200"
                title={`Re-run from the failed step (${failedNodeId.slice(0, 8)}) and onwards`}
              >
                <RotateCcw size={11} /> Retry from failed step
              </button>
            )}
            {hasTestArtifact && (
              <button
                type="button"
                onClick={() => setView({ type: 'testReport', buildId: build.id })}
                className="focusable inline-flex items-center gap-1 rounded-md border border-emerald-700/60 px-2 py-0.5 text-emerald-300 hover:border-emerald-500 hover:text-emerald-200"
                title="View parsed test report (xcresult / JUnit)"
              >
                <FileBarChart size={11} /> Tests
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                if (diffCandidates.length === 0) {
                  const list = await api.listBuilds({
                    pipelineId: build.pipelineId,
                    limit: 50,
                  });
                  setDiffCandidates(list);
                }
                setDiffOpen(true);
              }}
              className="focusable inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-0.5 text-text-secondary hover:border-accent hover:text-accent"
              title="Compare with another build"
            >
              <GitCompareArrows size={11} /> Compare
            </button>
            <button
              type="button"
              onClick={async () => {
                const url = `${window.location.origin}/builds/${build.id}`;
                try {
                  await navigator.clipboard.writeText(url);
                } catch {
                  // Older browsers / non-secure contexts — fall back to prompt.
                  window.prompt('Copy this build link:', url);
                }
                setLinkCopied(true);
                window.setTimeout(() => setLinkCopied(false), 1500);
              }}
              className="focusable inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-0.5 text-text-secondary hover:border-accent hover:text-accent"
              title="Copy a shareable link to this build"
            >
              {linkCopied ? <Check size={11} className="text-emerald-400" /> : <Link2 size={11} />}{' '}
              {linkCopied ? 'Copied' : 'Copy link'}
            </button>
            <button
              type="button"
              onClick={downloadLog}
              className="focusable inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-0.5 text-text-secondary hover:border-accent hover:text-accent"
              title="Download log as .txt"
            >
              <Download size={11} /> Download
            </button>
          </div>
        </div>
      </header>

      {/* UI v2 Faz 6.A — tab nav. Underline-style row matching v2 Tabs
          primitive but rendered inline so it can reach into the page's
          activeTab state without lifting it. */}
      <nav
        className="flex items-center gap-1 border-b border-border-subtle bg-bg-panel px-2 sm:px-4"
        role="tablist"
        aria-label="Build sections"
      >
        {TAB_ORDER.map((tab) => {
          const active = activeTab === tab;
          const meta = TAB_META[tab];
          const disabled = meta.disabled;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active}
              aria-disabled={disabled}
              onClick={() => !disabled && setActiveTab(tab)}
              className={cn(
                'relative flex items-center gap-1.5 px-3 h-9 text-[12.5px] font-medium transition-colors',
                active
                  ? 'text-text-primary'
                  : disabled
                    ? 'text-text-faint cursor-not-allowed'
                    : 'text-text-muted hover:text-text-secondary',
              )}
              title={disabled ? `${meta.label} — coming soon` : meta.label}
            >
              {meta.label}
              {disabled && (
                <span className="rounded bg-bg-elevated border border-border-subtle px-1 text-[9px] uppercase tracking-wider text-text-faint">
                  soon
                </span>
              )}
              {active && (
                <span
                  className="absolute inset-x-2 bottom-0 h-[2px] bg-accent rounded-t-sm"
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </nav>

      {activeTab === 'overview' && (
        <>
      <PrSummaryCard buildId={build.id} />

      {(() => {
        const pending = approvals.find((a) => a.decision === null);
        if (pending) {
          return (
            <ApprovalCard
              approval={pending}
              onDecided={(updated) => {
                setApprovals((cur) =>
                  cur.map((a) => (a.id === updated.id ? updated : a)),
                );
              }}
            />
          );
        }
        const last = approvals[approvals.length - 1];
        if (last && last.decision) {
          return <ApprovalCard approval={last} readOnly />;
        }
        return null;
      })()}

      {isMatrixParent && (
        <MatrixRunSummary
          parent={build}
          children={matrixChildren}
          onOpenChild={(id) => setView({ type: 'build', id })}
          rerunning={matrixRerunning}
          onRerunFailed={async () => {
            if (matrixRerunning) return;
            setMatrixRerunning(true);
            try {
              const res = await api.rerunFailedMatrixCells(build.id);
              const [refreshed, refreshedChildren] = await Promise.all([
                api.getBuild(build.id),
                api.listChildBuilds(build.id),
              ]);
              setBuild(refreshed);
              setMatrixChildren(refreshedChildren);
              if (res.rerun === 0) {
                /* no-op */
              }
            } finally {
              setMatrixRerunning(false);
            }
          }}
        />
      )}

      {build.status === 'failed' && !isMatrixParent && (
        <FailureSummaryCard
          entries={entries}
          nodeLabel={(id, type) =>
            `${nodeLabelMap.get(id) ?? type ?? '?'} · ${id.slice(0, 8)}`
          }
          onRetry={async (nodeId) => {
            const next = await triggerBuild(build.pipelineId, nodeId);
            setView({ type: 'build', id: next.id });
          }}
          onJumpToNode={(nodeId) => setActiveNodeId(nodeId)}
        />
      )}

      {artifacts.length > 0 && (
        <div className="border-b border-border-subtle bg-bg-panel/30 px-3 py-3 sm:px-6">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              Artifacts ({artifacts.length})
            </span>
            <span className="text-[10px] text-text-muted">
              {formatBytes(artifacts.reduce((acc, a) => acc + a.size, 0))} total
            </span>
          </div>
          <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
            {artifacts.map((a) => {
              const binary = isBinaryArtifact(a.path);
              // For binary artifacts the inline text preview is useless
              // (U+FFFD soup), so the path-as-link points at "reveal in
              // folder" instead. Text-y artifacts (logs, json, xml…) keep
              // the original "click row to preview" behaviour.
              const onPathClick = binary
                ? () => api.revealArtifact(a.id).catch(() => undefined)
                : () => setPreviewArtifact(a);
              return (
                <li
                  key={a.id}
                  className="group flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-bg-base px-2 py-1 text-[11px] hover:border-border-subtle"
                >
                  <button
                    type="button"
                    onClick={onPathClick}
                    className="min-w-0 flex-1 truncate text-left font-mono text-text-primary hover:text-accent-hover"
                    title={binary ? `Reveal ${a.path} in file manager` : `Preview ${a.path}`}
                  >
                    {a.path}
                  </button>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-text-muted">{formatBytes(a.size)}</span>
                    {!binary && (
                      <button
                        type="button"
                        onClick={() => setPreviewArtifact(a)}
                        className="text-accent hover:text-accent-hover"
                      >
                        preview
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => api.revealArtifact(a.id).catch(() => undefined)}
                      className="text-accent hover:text-accent-hover"
                      title="Open the containing folder in the OS file manager"
                    >
                      open location
                    </button>
                    <a
                      href={api.artifactDownloadUrl(a.id)}
                      className="text-accent hover:text-accent-hover"
                      download
                    >
                      download
                    </a>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <StepGantt
        entries={entries}
        startedAt={build.startedAt}
        finishedAt={build.finishedAt ?? undefined}
        nodeLabel={(id, type) =>
          `${nodeLabelMap.get(id) ?? type ?? '?'} · ${id.slice(0, 8)}`
        }
        selectedNodeId={activeNodeId === 'all' || activeNodeId === '__pipeline__' ? null : activeNodeId}
        onSelect={(id) => setActiveNodeId(id === activeNodeId ? 'all' : id)}
      />

      <StepDurationCompare
        build={build}
        entries={entries}
        nodeLabel={(id, type) =>
          `${nodeLabelMap.get(id) ?? type ?? '?'} · ${id.slice(0, 8)}`
        }
      />
        </>
      )}

      {activeTab === 'logs' && (
        <>
      <div className="flex flex-wrap items-center gap-3 border-b border-t border-border-subtle bg-bg-panel/30 px-3 py-2 text-xs sm:px-6">
        <Filter size={12} className="text-text-muted" />
        <span className="text-text-muted">Levels</span>
        <div className="flex flex-wrap gap-1">
          {ALL_LEVELS.map((lvl) => {
            const on = activeLevels.has(lvl);
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => toggleLevel(lvl)}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors',
                  on
                    ? 'border-border bg-bg-elevated text-text-primary'
                    : 'border-border-subtle bg-bg-base text-text-muted hover:text-text-muted',
                )}
              >
                {lvl}
              </button>
            );
          })}
        </div>
        <span className="ml-2 text-text-muted">Node</span>
        <select
          value={activeNodeId}
          onChange={(e) => setActiveNodeId(e.target.value as typeof activeNodeId)}
          className="focusable rounded-md border border-border-subtle bg-bg-panel px-2 py-1 text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="all">(all)</option>
          <option value="__pipeline__">pipeline-level</option>
          {distinctNodes.map(([id, type]) => (
            <option key={id} value={id}>
              {type ?? '?'} · {id.slice(0, 8)}
            </option>
          ))}
        </select>
        <span className="text-text-muted">
          {filtered.length} / {entries.length} rows
          {entries.length >= 5000 && ' (capped at 5000 in memory)'}
        </span>
        <div className="ml-auto flex w-full max-w-md items-center">
          <LogSearchBar
            query={query}
            onQueryChange={setQuery}
            regex={regex}
            onRegexChange={setRegex}
            regexError={filter.error}
            presets={presets}
            onApplyPreset={(p) => {
              setQuery(p.query);
              setRegex(p.regex);
            }}
            onSavePreset={(name) => {
              const next: SavedLogFilter = {
                id: `p-${Date.now().toString(36)}`,
                name,
                query,
                regex,
              };
              const list = [...presets, next];
              setPresets(list);
              saveLogPresets(list);
            }}
            onDeletePreset={(id) => {
              const list = presets.filter((p) => p.id !== id);
              setPresets(list);
              saveLogPresets(list);
            }}
          />
        </div>
      </div>

      <LogGroupBar
        groups={logGroups}
        collapsed={collapsedGroups}
        onToggle={(id) =>
          setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        onToggleAll={(allCollapsed) =>
          setCollapsedGroups(allCollapsed ? new Set() : new Set(logGroups.map((g) => g.id)))
        }
      />

      {tsBounds && (
        <div className="flex items-center gap-3 border-b border-border-subtle bg-bg-panel/20 px-3 py-2 sm:px-6">
          <span className="shrink-0 text-[10px] uppercase tracking-wider text-text-muted">
            Time range
          </span>
          <div className="flex-1">
            <TimestampRangeSlider
              min={tsBounds[0]}
              max={tsBounds[1]}
              value={tsRange ?? tsBounds}
              onChange={(next) => {
                const same =
                  next[0] === tsBounds[0] && next[1] === tsBounds[1];
                setTsRange(same ? null : next);
              }}
            />
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 px-2 pb-2">
        <LogTable
          entries={filtered}
          nodeLabel={(id, type) =>
            `${nodeLabelMap.get(id) ?? type ?? '?'} · ${id.slice(0, 8)}`
          }
          copyCommandFor={commandFromEntry}
          emptyMessage={entries.length === 0 ? 'Build queued / no output yet.' : 'No rows match these filters.'}
        />
      </div>
        </>
      )}

      {activeTab === 'artifacts' && (
        <BuildArtifactsTab
          artifacts={artifacts}
          onPreview={setPreviewArtifact}
          isBinary={isBinaryArtifact}
        />
      )}

      {activeTab === 'tests' && <BuildTestsTab buildId={build.id} />}

      {activeTab === 'annotations' && <BuildAnnotationsTab buildId={build.id} />}

      {activeTab !== 'overview' &&
        activeTab !== 'logs' &&
        activeTab !== 'artifacts' &&
        activeTab !== 'tests' &&
        activeTab !== 'annotations' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-12 text-center">
            <div className="text-[14px] font-semibold text-text-primary">
              {TAB_META[activeTab].label}
            </div>
            <p className="max-w-md text-[12.5px] text-text-muted leading-relaxed">
              {TAB_META[activeTab].placeholder}
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className="mt-2 rounded-btn border border-border-subtle bg-bg-elevated px-3 py-1.5 text-[12px] text-text-secondary hover:text-text-primary hover:border-border transition-colors"
            >
              Back to Overview
            </button>
          </div>
        )}

      {/* Inline artifact log viewer — opens when user clicks an artifact row. */}
      <ArtifactPreviewModal
        artifact={previewArtifact}
        onClose={() => setPreviewArtifact(null)}
      />

      {diffOpen && (
        <BuildDiffView
          current={build}
          candidates={diffCandidates}
          nodeLabel={(id, type) =>
            `${nodeLabelMap.get(id) ?? type ?? '?'} · ${id.slice(0, 8)}`
          }
          onClose={() => setDiffOpen(false)}
        />
      )}
    </div>
  );
}

// UI v2 Faz 6.B — Artifacts tab. Same data source as the Overview's
// inline artifact list, rendered as a v2 token-aligned grid with the
// design's per-artifact action chips.
function BuildArtifactsTab({
  artifacts,
  onPreview,
  isBinary,
}: {
  artifacts: BuildArtifact[];
  onPreview(a: BuildArtifact): void;
  isBinary(path: string): boolean;
}): JSX.Element {
  if (artifacts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[12.5px] text-text-muted p-12 text-center">
        This build produced no artifacts. Add an{' '}
        <code className="ml-1 mr-1 font-mono text-text-secondary">artifact</code> step to a
        pipeline to capture build outputs.
      </div>
    );
  }
  const totalSize = artifacts.reduce((acc, a) => acc + a.size, 0);
  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
          {artifacts.length} artifact{artifacts.length === 1 ? '' : 's'}
        </div>
        <div className="text-[11px] font-mono text-text-faint">
          {formatBytes(totalSize)} total
        </div>
      </div>
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {artifacts.map((a) => {
          const binary = isBinary(a.path);
          return (
            <li
              key={a.id}
              className="group rounded-card border border-border-subtle bg-bg-panel p-3 hover:border-border transition-colors"
            >
              <button
                type="button"
                onClick={() => (binary ? api.revealArtifact(a.id).catch(() => undefined) : onPreview(a))}
                className="block w-full truncate text-left font-mono text-[12px] text-text-primary hover:text-accent transition-colors"
                title={binary ? `Reveal ${a.path}` : `Preview ${a.path}`}
              >
                {a.path}
              </button>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-text-muted">{formatBytes(a.size)}</span>
                <div className="flex items-center gap-2">
                  {!binary && (
                    <button
                      type="button"
                      onClick={() => onPreview(a)}
                      className="text-accent hover:text-accent-hover transition-colors"
                    >
                      preview
                    </button>
                  )}
                  <a
                    href={api.artifactDownloadUrl(a.id)}
                    className="text-accent hover:text-accent-hover transition-colors"
                  >
                    download
                  </a>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(a.path).catch(() => undefined)}
                    className="text-text-muted hover:text-text-primary transition-colors"
                    title="Copy path"
                  >
                    copy
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// UI v2 Faz 6.B — Tests tab. Wires the existing test-report endpoint
// (xcresult / JUnit parser already shipped) into the build detail tab
// shell so users don't have to bounce out to /test-report.
function BuildTestsTab({ buildId }: { buildId: string }): JSX.Element {
  const [report, setReport] = useState<TestReportTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .testReport(buildId)
      .then((r) => {
        if (!alive) return;
        setReport(r);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [buildId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[12.5px] text-text-muted p-12">
        Loading test report…
      </div>
    );
  }
  if (error || !report) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-12 text-center">
        <div className="text-[13px] text-text-primary">No test report yet</div>
        <p className="max-w-md text-[12px] text-text-muted">
          {error
            ? `Couldn't load the test report: ${error}`
            : 'Add an xcresultParse or junitParse step downstream of your test runner to capture results.'}
        </p>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="Total" value={report.totalTests} tone="neutral" />
        <SummaryCard label="Passed" value={report.totalPassed} tone="success" />
        <SummaryCard label="Failed" value={report.totalFailed} tone="failed" />
        <SummaryCard label="Skipped" value={report.totalSkipped} tone="muted" />
      </div>
      {report.note && (
        <div className="mb-3 rounded-card border border-border-subtle bg-bg-elevated px-3 py-2 text-[12px] text-text-muted">
          {report.note}
        </div>
      )}
      {report.suites.length === 0 ? (
        <div className="text-[12.5px] text-text-muted text-center py-8">
          No test suites in this report.
        </div>
      ) : (
        <div className="space-y-3">
          {report.suites.map((suite, suiteIdx) => {
            const failedInSuite = suite.tests.filter((t) => t.status === 'failed');
            return (
              <div
                key={`${suite.name}-${suiteIdx}`}
                className="rounded-card border border-border-subtle bg-bg-panel overflow-hidden"
              >
                <div className="flex items-baseline justify-between px-3 py-2 border-b border-border-subtle bg-bg-elevated">
                  <span className="font-mono text-[12.5px] text-text-primary truncate">
                    {suite.name}
                  </span>
                  <span className="text-[11px] text-text-muted">
                    {suite.tests.length} test{suite.tests.length === 1 ? '' : 's'}
                    {failedInSuite.length > 0 && (
                      <span className="ml-2 text-status-failed">
                        {failedInSuite.length} failed
                      </span>
                    )}
                  </span>
                </div>
                {failedInSuite.length > 0 && (
                  <ul className="divide-y divide-border-subtle">
                    {failedInSuite.map((tc, tcIdx) => (
                      <li key={`${tc.name}-${tcIdx}`} className="px-3 py-2">
                        <div className="flex items-baseline gap-2">
                          <span className="inline-block size-1.5 rounded-full bg-status-failed shrink-0" aria-hidden />
                          <span className="font-mono text-[12px] text-text-primary truncate">
                            {tc.name}
                          </span>
                          {tc.classname && (
                            <span className="font-mono text-[10.5px] text-text-faint truncate">
                              · {tc.classname}
                            </span>
                          )}
                        </div>
                        {tc.message && (
                          <pre className="mt-1 ml-3.5 max-h-32 overflow-y-auto rounded bg-bg-base px-2 py-1.5 text-[11px] font-mono text-text-secondary whitespace-pre-wrap">
                            {tc.message}
                          </pre>
                        )}
                        {tc.file && (
                          <div className="mt-1 ml-3.5 text-[10.5px] font-mono text-text-faint">
                            {tc.file}
                            {tc.line ? `:${tc.line}` : ''}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'success' | 'failed' | 'muted';
}): JSX.Element {
  const toneClass =
    tone === 'success'
      ? 'text-status-success'
      : tone === 'failed'
        ? 'text-status-failed'
        : tone === 'muted'
          ? 'text-text-muted'
          : 'text-text-primary';
  return (
    <div className="rounded-card border border-border-subtle bg-bg-panel px-3 py-2">
      <div className={`font-mono text-[20px] leading-tight ${toneClass}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mt-0.5">
        {label}
      </div>
    </div>
  );
}

// UI v2 Faz 6.B — Annotations tab. Fetches GET /api/builds/:id/annotations
// (parsers persist to the build_annotations table; the endpoint just
// reads them out sorted by file/line). Groups by file so users can scan
// "this build's diagnostics" rather than scrolling a flat list.
function BuildAnnotationsTab({ buildId }: { buildId: string }): JSX.Element {
  const [report, setReport] = useState<AnnotationsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .buildAnnotations(buildId)
      .then((r) => {
        if (!alive) return;
        setReport(r);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [buildId]);

  const grouped = useMemo(() => {
    if (!report) return [];
    const m = new Map<string, AnnotationsReport['annotations']>();
    for (const a of report.annotations) {
      const list = m.get(a.file) ?? [];
      list.push(a);
      m.set(a.file, list);
    }
    return [...m.entries()];
  }, [report]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[12.5px] text-text-muted p-12">
        Loading annotations…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-[12.5px] text-text-muted p-12 text-center">
        Couldn't load annotations: {error}
      </div>
    );
  }
  if (!report || report.totalCount === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-12 text-center">
        <div className="text-[13px] text-text-primary">No annotations</div>
        <p className="max-w-md text-[12px] text-text-muted">
          {report?.note ??
            'No compiler warnings or lint diagnostics were captured for this build.'}
        </p>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
      <div className="grid grid-cols-3 gap-3 mb-4">
        <SummaryCard label="Errors" value={report.errorCount} tone="failed" />
        <SummaryCard label="Warnings" value={report.warningCount} tone="muted" />
        <SummaryCard label="Info" value={report.infoCount} tone="neutral" />
      </div>
      <div className="space-y-3">
        {grouped.map(([file, items]) => (
          <div
            key={file}
            className="rounded-card border border-border-subtle bg-bg-panel overflow-hidden"
          >
            <div className="flex items-baseline justify-between px-3 py-2 border-b border-border-subtle bg-bg-elevated">
              <span className="font-mono text-[12px] text-text-primary truncate">{file}</span>
              <span className="text-[11px] text-text-muted">
                {items.length} entr{items.length === 1 ? 'y' : 'ies'}
              </span>
            </div>
            <ul className="divide-y divide-border-subtle">
              {items.map((a, i) => (
                <li key={`${a.file}-${a.line}-${i}`} className="px-3 py-2">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`inline-block size-1.5 rounded-full shrink-0 ${
                        a.level === 'error'
                          ? 'bg-status-failed'
                          : a.level === 'warning'
                            ? 'bg-status-warn'
                            : 'bg-text-muted'
                      }`}
                      aria-hidden
                    />
                    <span className="font-mono text-[11.5px] text-text-faint shrink-0">
                      L{a.line}
                      {a.column ? `:${a.column}` : ''}
                    </span>
                    {a.ruleId && (
                      <span className="rounded bg-bg-elevated border border-border-subtle px-1.5 font-mono text-[10px] text-text-muted shrink-0">
                        {a.ruleId}
                      </span>
                    )}
                    <span className="text-[12px] text-text-primary">{a.message}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
