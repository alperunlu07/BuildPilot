import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, Download, FileBarChart, Filter, GitCompareArrows, Link2, RotateCcw, Square } from 'lucide-react';
import type {
  Build,
  BuildArtifact,
  BuildLogEntry,
  BuildLogLevel,
  StepType,
} from '@buildpilot/shared-types';
import { useStore } from '../store/store';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { statusIcon, statusIconAnimationClass, statusLabel } from '../lib/statusIcon';
import { LogTable } from '../components/LogTable';
import { StepGantt } from '../components/StepGantt';
import { defaultActiveLevels } from '../components/LevelToggleBar';
import { ArtifactPreviewModal } from '../components/ArtifactPreviewModal';
import { FailureSummaryCard } from '../components/FailureSummaryCard';
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

interface Props {
  buildId: string;
}

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
  // Selected artifact for the inline log viewer modal. null = closed.
  const [previewArtifact, setPreviewArtifact] = useState<BuildArtifact | null>(null);

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
    ])
      .then(([b, ents, arts]) => {
        if (!alive) return;
        setBuild(b);
        setArtifacts(arts);
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
    return <div className="p-8 text-sm text-slate-400">Loading build…</div>;
  }
  if (!build) {
    return (
      <div className="p-8 text-sm text-slate-400">
        Build not found.{' '}
        <button
          type="button"
          className="text-sky-400 hover:underline"
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-slate-800 bg-slate-900/40 px-3 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => setView({ type: 'builds' })}
          className="focusable inline-flex items-center gap-1 rounded text-[11px] uppercase tracking-wider text-slate-400 hover:text-slate-300"
          aria-label="Back to builds list"
        >
          <ChevronLeft size={12} /> Builds
        </button>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-lg font-semibold text-slate-100">
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
                  build.status === 'pending' && 'bg-slate-800 text-slate-400',
                  build.status === 'cancelled' && 'bg-slate-800 text-slate-400',
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
          <span className="text-xs text-slate-400">
            in <span className="text-slate-300">{proj?.name ?? '—'}</span>
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span className="font-mono">{build.id}</span>
          <span>·</span>
          <span>
            branch{' '}
            <span className="font-mono text-emerald-400">{build.triggerBranch || '—'}</span>
          </span>
          <span>·</span>
          <span>
            commit{' '}
            <span className="font-mono text-sky-400">
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
              className="focusable inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-0.5 text-slate-300 hover:border-sky-500 hover:text-sky-400"
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
              className="focusable inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-0.5 text-slate-300 hover:border-sky-500 hover:text-sky-400"
              title="Copy a shareable link to this build"
            >
              {linkCopied ? <Check size={11} className="text-emerald-400" /> : <Link2 size={11} />}{' '}
              {linkCopied ? 'Copied' : 'Copy link'}
            </button>
            <button
              type="button"
              onClick={downloadLog}
              className="focusable inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-0.5 text-slate-300 hover:border-sky-500 hover:text-sky-400"
              title="Download log as .txt"
            >
              <Download size={11} /> Download
            </button>
          </div>
        </div>
      </header>

      {build.status === 'failed' && (
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
        <div className="border-b border-slate-800 bg-slate-900/30 px-3 py-3 sm:px-6">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">
              Artifacts ({artifacts.length})
            </span>
            <span className="text-[10px] text-slate-400">
              {formatBytes(artifacts.reduce((acc, a) => acc + a.size, 0))} total
            </span>
          </div>
          <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
            {artifacts.map((a) => (
              <li
                key={a.id}
                className="group flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] hover:border-slate-700"
              >
                <button
                  type="button"
                  onClick={() => setPreviewArtifact(a)}
                  className="min-w-0 flex-1 truncate text-left font-mono text-slate-200 hover:text-sky-300"
                  title={`Preview ${a.path}`}
                >
                  {a.path}
                </button>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-slate-400">{formatBytes(a.size)}</span>
                  <button
                    type="button"
                    onClick={() => setPreviewArtifact(a)}
                    className="text-sky-400 hover:text-sky-300"
                  >
                    preview
                  </button>
                  <a
                    href={api.artifactDownloadUrl(a.id)}
                    className="text-sky-400 hover:text-sky-300"
                    download
                  >
                    download
                  </a>
                </span>
              </li>
            ))}
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

      <div className="flex flex-wrap items-center gap-3 border-b border-t border-slate-800 bg-slate-900/30 px-3 py-2 text-xs sm:px-6">
        <Filter size={12} className="text-slate-400" />
        <span className="text-slate-400">Levels</span>
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
                    ? 'border-slate-600 bg-slate-800 text-slate-100'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-400',
                )}
              >
                {lvl}
              </button>
            );
          })}
        </div>
        <span className="ml-2 text-slate-400">Node</span>
        <select
          value={activeNodeId}
          onChange={(e) => setActiveNodeId(e.target.value as typeof activeNodeId)}
          className="focusable rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100 focus:border-sky-500 focus:outline-none"
        >
          <option value="all">(all)</option>
          <option value="__pipeline__">pipeline-level</option>
          {distinctNodes.map(([id, type]) => (
            <option key={id} value={id}>
              {type ?? '?'} · {id.slice(0, 8)}
            </option>
          ))}
        </select>
        <span className="text-slate-400">
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
        <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-900/20 px-3 py-2 sm:px-6">
          <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-400">
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
