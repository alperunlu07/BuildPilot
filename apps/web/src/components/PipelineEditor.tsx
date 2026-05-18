import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import dagre from 'dagre';
import { ChevronDown, ChevronRight, Hammer, LayoutGrid, Map as MapIcon, Redo2, Save, Square, Trash2, Undo2 } from 'lucide-react';
import type {
  NodeTemplate,
  Pipeline,
  PipelineEdge,
  PipelineNode,
  PipelineWatch,
  StepType,
} from '@buildpilot/shared-types';
import { STEP_CATEGORIES, STEP_DEFINITIONS } from '@buildpilot/step-registry';
import { api } from '../lib/api';
import { usePipelineClipboard } from '../lib/usePipelineClipboard';
import { usePipelineHistory } from '../lib/usePipelineHistory';
import { useStore } from '../store/store';
import { BranchSelect } from './BranchSelect';
import { NodeContextMenu } from './NodeContextMenu';
import { SaveTemplateDialog } from './SaveTemplateDialog';
import { StepNode } from './StepNode';
import { StepPropertyPanel, EMPTY_ENTRIES } from './StepPropertyPanel';

const nodeTypes = {
  checkout: StepNode,
  pull: StepNode,
  shell: StepNode,
  unityBatch: StepNode,
  httpRequest: StepNode,
  slackNotify: StepNode,
  discordNotify: StepNode,
  telegramNotify: StepNode,
  aiPrompt: StepNode,
  artifact: StepNode,
  remoteSsh: StepNode,
  sftpUpload: StepNode,
  xcodebuild: StepNode,
  gitMerge: StepNode,
  s3Upload: StepNode,
  testflightUpload: StepNode,
  keychainUnlock: StepNode,
  provisioningProfileInstall: StepNode,
  notarize: StepNode,
  stapleNotarization: StepNode,
  fastlaneMatch: StepNode,
  cocoapodsInstall: StepNode,
  swiftPackageResolve: StepNode,
  dsymUpload: StepNode,
  xcresultParse: StepNode,
  xcodeSelect: StepNode,
  ensureGitStatusClean: StepNode,
  incrementBuildNumber: StepNode,
  getBuildNumber: StepNode,
  changelogFromGitCommits: StepNode,
  updateInfoPlist: StepNode,
  swiftlint: StepNode,
  swiftFormat: StepNode,
  xcodebuildAnalyze: StepNode,
  peripheryScan: StepNode,
  slatherCoverage: StepNode,
  xcovGate: StepNode,
  resign: StepNode,
  snapshot: StepNode,
  frameit: StepNode,
  gradleBuild: StepNode,
  adbConnect: StepNode,
  adbInstall: StepNode,
  adbShellLaunch: StepNode,
  adbLogcat: StepNode,
  teamsNotify: StepNode,
  emailNotify: StepNode,
  appStoreConnectApi: StepNode,
  testflightSetWhatToTest: StepNode,
  testflightPublicLink: StepNode,
  testflightManage: StepNode,
  appStorePrecheck: StepNode,
  appStoreCreate: StepNode,
  appStoreUpload: StepNode,
  buildAppGym: StepNode,
  pushCertificate: StepNode,
  certManage: StepNode,
  registerDevices: StepNode,
  sigh: StepNode,
  simctlPrepare: StepNode,
  simctlInstallLaunch: StepNode,
  simctlScreenshot: StepNode,
  simctlPushNotification: StepNode,
  simctlStatusBarOverride: StepNode,
  simctlPrivacyGrant: StepNode,
  securityKeychainImport: StepNode,
  codesignArbitrary: StepNode,
  dsymVerify: StepNode,
  privacyManifestValidate: StepNode,
  privacyManifestAggregate: StepNode,
  appThinningReportParse: StepNode,
  linkMapAnalyze: StepNode,
  bitcodeStrip: StepNode,
  otaManifestGenerate: StepNode,
  firebaseAppDistribution: StepNode,
  distributionGroups: StepNode,
  phasedRollout: StepNode,
  branchTargetedTestFlight: StepNode,
  storekitConfigure: StepNode,
  steamcmdSetup: StepNode,
  steamUpload: StepNode,
  steamSetLive: StepNode,
  steamWorkshopUpload: StepNode,
  iosDeviceLog: StepNode,
  adbPair: StepNode,
  bundletool: StepNode,
  androidSign: StepNode,
  playConsoleUpload: StepNode,
};

interface Props {
  pipeline: Pipeline;
}

export function PipelineEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}

function Editor({ pipeline }: Props) {
  const upsertPipeline = useStore((s) => s.upsertPipeline);
  const triggerBuild = useStore((s) => s.triggerBuild);
  const cancelBuildAction = useStore((s) => s.cancelBuild);
  const deletePipelineAction = useStore((s) => s.deletePipeline);
  const requestConfirmation = useStore((s) => s.requestConfirmation);
  const nodeTemplates = useStore((s) => s.nodeTemplates);
  const saveNodeTemplate = useStore((s) => s.saveNodeTemplate);
  const deleteNodeTemplate = useStore((s) => s.deleteNodeTemplate);
  const stepStatus = useStore((s) => s.stepStatus[pipeline.id]);
  const stepTimings = useStore((s) => s.stepTimings[pipeline.id]);
  // Pull entries for the most recent build of this pipeline so the per-node
  // Logs tab in the property panel can show that step's output.
  const latestBuildId = useStore((s) => {
    const b = s.builds.find((b) => b.pipelineId === pipeline.id);
    return b?.id;
  });
  const latestEntries = useStore((s) =>
    latestBuildId ? (s.entriesByBuild[latestBuildId] ?? EMPTY_ENTRIES) : EMPTY_ENTRIES,
  );
  const activeBuild = useStore((s) =>
    s.activeBuild &&
    s.activeBuild.pipelineId === pipeline.id &&
    (s.activeBuild.status === 'running' || s.activeBuild.status === 'pending')
      ? s.activeBuild
      : null,
  );

  const [nodes, setNodes] = useState<Node[]>(() => pipelineNodesToReactFlow(pipeline.nodes));
  const [edges, setEdges] = useState<Edge[]>(() => pipelineEdgesToReactFlow(pipeline.edges));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [name, setName] = useState(pipeline.name);
  const [watch, setWatch] = useState<PipelineWatch>(pipeline.watch);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [triggersOpen, setTriggersOpen] = useState(false);
  // Save-as-template dialog state. Holds the source node id whose data we
  // will snapshot when the user confirms.
  const [saveTemplateNodeId, setSaveTemplateNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [edgeTooltip, setEdgeTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [showMinimap, setShowMinimap] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('buildpilot:editor:minimap') === '1';
  });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const history = usePipelineHistory();
  const clipboard = usePipelineClipboard();
  const nodesRef = useRef<Node[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const recordHistory = useCallback(() => {
    history.record({ nodes: nodesRef.current, edges: edgesRef.current });
  }, [history]);

  // Reset when the underlying pipeline changes (user navigated).
  useEffect(() => {
    setNodes(pipelineNodesToReactFlow(pipeline.nodes));
    setEdges(pipelineEdgesToReactFlow(pipeline.edges));
    setName(pipeline.name);
    setWatch(pipeline.watch);
    setDirty(false);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    history.reset();
  }, [pipeline.id]);

  // Push the current per-node runtime status + timing into each node's data
  // so the StepNode component can render glow + duration without us having
  // to re-mount or re-shape nodes when the run state ticks.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const status = stepStatus?.[n.id];
        const timing = stepTimings?.[n.id];
        const data = n.data as {
          runtimeStatus?: string;
          runtimeStartedAt?: number;
          runtimeFinishedAt?: number;
        };
        if (
          data.runtimeStatus === status &&
          data.runtimeStartedAt === timing?.startedAt &&
          data.runtimeFinishedAt === timing?.finishedAt
        ) {
          return n;
        }
        return {
          ...n,
          data: {
            ...(n.data as Record<string, unknown>),
            runtimeStatus: status,
            runtimeStartedAt: timing?.startedAt,
            runtimeFinishedAt: timing?.finishedAt,
          },
        };
      }),
    );
  }, [stepStatus, stepTimings]);

  const cloneNode = useCallback((nodeId: string) => {
    const src = nodesRef.current.find((n) => n.id === nodeId);
    if (!src) return;
    recordHistory();
    const id = `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
    const data = { ...(src.data as Record<string, unknown>) };
    delete (data as { runtimeStatus?: unknown }).runtimeStatus;
    delete (data as { runtimeStartedAt?: unknown }).runtimeStartedAt;
    delete (data as { runtimeFinishedAt?: unknown }).runtimeFinishedAt;
    setNodes((nds) => [
      ...nds,
      {
        ...src,
        id,
        position: { x: src.position.x + 40, y: src.position.y + 40 },
        data,
        selected: false,
      },
    ]);
    setDirty(true);
  }, [recordHistory]);

  const toggleDisableNode = useCallback((nodeId: string) => {
    recordHistory();
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const data = n.data as Record<string, unknown> & { disabled?: boolean | string };
        const cur = data.disabled === true || data.disabled === 'true';
        return { ...n, data: { ...data, disabled: !cur } };
      }),
    );
    setDirty(true);
  }, [recordHistory]);

  const copySingle = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      clipboard.copy([node], edgesRef.current);
    },
    [clipboard],
  );

  const doCopy = useCallback(() => {
    const ids = new Set(selectedNodeIds);
    const picked = nodesRef.current.filter((n) => ids.has(n.id));
    if (picked.length === 0) return;
    clipboard.copy(picked, edgesRef.current);
  }, [clipboard, selectedNodeIds]);

  const doPaste = useCallback(() => {
    const payload = clipboard.paste();
    if (!payload) return;
    recordHistory();
    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      ...payload.nodes.map((n) => ({ ...n, selected: true })),
    ]);
    setEdges((eds) => [...eds, ...payload.edges]);
    setSelectedNodeIds(payload.nodes.map((n) => n.id));
    setSelectedNodeId(payload.nodes[0]?.id ?? null);
    setDirty(true);
  }, [clipboard, recordHistory]);

  const autoLayout = useCallback(() => {
    recordHistory();
    setNodes((nds) => {
      const next = layoutWithDagre(nds, edgesRef.current);
      return next;
    });
    setDirty(true);
  }, [recordHistory]);

  const doUndo = useCallback(() => {
    const prev = history.undo({ nodes: nodesRef.current, edges: edgesRef.current });
    if (!prev) return;
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setDirty(true);
  }, [history]);

  const doRedo = useCallback(() => {
    const next = history.redo({ nodes: nodesRef.current, edges: edgesRef.current });
    if (!next) return;
    setNodes(next.nodes);
    setEdges(next.edges);
    setDirty(true);
  }, [history]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      // Skip undo/redo when the user is editing inside a text field — those
      // have their own native undo we don't want to clobber.
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        doUndo();
      } else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
        e.preventDefault();
        doRedo();
      } else if (e.key.toLowerCase() === 'c') {
        // Don't preempt the browser when nothing is selected; let native
        // text-copy work in case the user has a selection elsewhere.
        if (selectedNodeIds.length === 0) return;
        e.preventDefault();
        doCopy();
      } else if (e.key.toLowerCase() === 'v') {
        e.preventDefault();
        doPaste();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUndo, doRedo, doCopy, doPaste, selectedNodeIds.length]);

  // Load branches for the project so the watch + checkout combobox have data.
  useEffect(() => {
    let alive = true;
    api
      .branches(pipeline.projectId)
      .then((bs) => {
        if (alive) setBranches(bs);
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [pipeline.projectId]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const commit = changes.some(
        (c) =>
          c.type === 'remove' ||
          (c.type === 'position' && c.dragging === false),
      );
      if (commit) recordHistory();
      setNodes((nds) => applyNodeChanges(changes, nds));
      if (changes.some((c) => c.type === 'position' || c.type === 'remove')) setDirty(true);
    },
    [recordHistory],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const commit = changes.some((c) => c.type === 'remove');
      if (commit) recordHistory();
      setEdges((eds) => applyEdgeChanges(changes, eds));
      if (changes.length > 0) setDirty(true);
    },
    [recordHistory],
  );

  const onConnect = useCallback((connection: Connection) => {
    recordHistory();
    const newEdge: Edge = pipelineEdgeToReactFlow({
      id: `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      source: connection.source!,
      target: connection.target!,
      condition: 'success',
    });
    setEdges((eds) => addEdge(newEdge, eds));
    setDirty(true);
  }, [recordHistory]);

  const handleSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node[]; edges: Edge[] }) => {
      setSelectedNodeId(selected[0]?.id ?? null);
      setSelectedNodeIds(selected.map((n) => n.id));
    },
    [],
  );

  const updateNodeData = useCallback((nodeId: string, data: Record<string, unknown>) => {
    recordHistory();
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data } : n)));
    setDirty(true);
  }, [recordHistory]);

  const deleteNode = useCallback((nodeId: string) => {
    recordHistory();
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId(null);
    setDirty(true);
  }, [recordHistory]);

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const id = `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;

      // Templates take precedence — the dragged item carries the template id.
      const templateId = event.dataTransfer.getData('application/buildpilot-template');
      if (templateId) {
        const tpl = nodeTemplates.find((t) => t.id === templateId);
        if (!tpl) return;
        recordHistory();
        setNodes((nds) => [
          ...nds,
          {
            id,
            type: tpl.baseStepType,
            position,
            // Clone template data + tag with templateLabel so the canvas
            // shows the template name. templateId is informational.
            data: { ...tpl.data, templateLabel: tpl.name, templateId: tpl.id },
          },
        ]);
        setDirty(true);
        return;
      }

      const stepType = event.dataTransfer.getData('application/buildpilot-step') as StepType;
      if (!stepType || !STEP_DEFINITIONS[stepType]) return;
      recordHistory();
      setNodes((nds) => [
        ...nds,
        {
          id,
          type: stepType,
          position,
          data: defaultData(stepType),
        },
      ]);
      setDirty(true);
    },
    [screenToFlowPosition, nodeTemplates, recordHistory],
  );

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updatePipeline(pipeline.id, {
        name,
        watch,
        nodes: reactFlowNodesToPipeline(nodes),
        edges: reactFlowEdgesToPipeline(edges),
      });
      upsertPipeline(updated);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    if (dirty) await save();
    await triggerBuild(pipeline.id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/50 px-4 py-2">
        <div className="flex items-center gap-3">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            className="bg-transparent text-base font-semibold text-slate-100 outline-none"
          />
          <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2 py-0.5 text-[11px] uppercase tracking-wider text-slate-400">
            Watch:
            <BranchSelect
              value={watch.branch}
              onChange={(b) => {
                setWatch({ ...watch, branch: b });
                setDirty(true);
              }}
              branches={branches}
            />
          </span>
          <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">
            every{' '}
            <input
              type="number"
              min={5}
              value={watch.intervalSec}
              onChange={(e) => {
                setWatch({ ...watch, intervalSec: Math.max(5, Number(e.target.value)) });
                setDirty(true);
              }}
              className="w-12 bg-transparent text-center text-slate-100 outline-none"
            />
            s
          </span>
          <label
            className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400"
            title="When the watched branch advances, send a Telegram message asking whether to build (requires bot configured in ~/.buildpilot/config.json)"
          >
            <input
              type="checkbox"
              checked={watch.telegramApprovals ?? false}
              onChange={(e) => {
                setWatch({ ...watch, telegramApprovals: e.target.checked });
                setDirty(true);
              }}
              className="h-3 w-3"
            />
            Telegram ask
          </label>
          <button
            type="button"
            onClick={() => setTriggersOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 hover:text-slate-100"
            title="Advanced trigger options (tag pattern, cron schedule, path filter, rolling builds)"
          >
            Triggers{' '}
            {watch.tagPattern || watch.cronExpr || watch.pathFilter || watch.cancelInProgressOnNewCommit
              ? '●'
              : '…'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {dirty && <span className="text-[11px] text-amber-400">unsaved</span>}
          <button
            type="button"
            onClick={doUndo}
            disabled={!history.canUndo}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-sky-500 hover:text-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
            title="Undo (Cmd/Ctrl+Z)"
          >
            <Undo2 size={12} />
          </button>
          <button
            type="button"
            onClick={doRedo}
            disabled={!history.canRedo}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-sky-500 hover:text-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
            title="Redo (Cmd/Ctrl+Shift+Z)"
          >
            <Redo2 size={12} />
          </button>
          <button
            type="button"
            onClick={autoLayout}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-sky-500 hover:text-sky-400"
            title="Auto-layout graph"
          >
            <LayoutGrid size={12} />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowMinimap((v) => {
                const next = !v;
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem('buildpilot:editor:minimap', next ? '1' : '0');
                }
                return next;
              });
            }}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
              showMinimap
                ? 'border-sky-500 bg-sky-950/40 text-sky-300'
                : 'border-slate-700 text-slate-300 hover:border-sky-500 hover:text-sky-400'
            }`}
            title="Toggle minimap"
          >
            <MapIcon size={12} />
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:border-sky-500 hover:text-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save size={12} /> {saving ? 'Saving…' : 'Save'}
          </button>
          {activeBuild ? (
            <button
              type="button"
              onClick={() => void cancelBuildAction(activeBuild.id)}
              className="inline-flex items-center gap-1 rounded-md border border-rose-700 bg-rose-950/40 px-2.5 py-1 text-xs font-medium text-rose-200 hover:border-rose-500"
              title={`Cancel running build ${activeBuild.id.slice(0, 8)}`}
            >
              <Square size={11} /> Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={runNow}
              className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500"
            >
              <Hammer size={12} /> Run
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              requestConfirmation({
                title: `Delete pipeline "${pipeline.name}"?`,
                body: "Build history for this pipeline is kept; only the pipeline definition is removed.",
                variant: 'destructive',
                confirmLabel: 'Delete pipeline',
                onConfirm: () => deletePipelineAction(pipeline.id),
              });
            }}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-rose-400 hover:border-rose-500 hover:text-rose-300"
            title="Delete this pipeline"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </header>

      {triggersOpen && (
        <div className="border-b border-slate-800 bg-slate-900/60 px-4 py-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block text-xs text-slate-300">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">
                Tag pattern (glob — e.g. v*.*.*)
              </span>
              <input
                type="text"
                value={watch.tagPattern ?? ''}
                onChange={(e) => {
                  setWatch({ ...watch, tagPattern: e.target.value });
                  setDirty(true);
                }}
                placeholder="v*.*.*"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
              />
            </label>
            <label className="block text-xs text-slate-300">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">
                Cron (5-field, UTC — e.g. "0 9 * * *")
              </span>
              <input
                type="text"
                value={watch.cronExpr ?? ''}
                onChange={(e) => {
                  setWatch({ ...watch, cronExpr: e.target.value });
                  setDirty(true);
                }}
                placeholder="0 9 * * *"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
              />
            </label>
            <label className="block text-xs text-slate-300 md:col-span-2">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">
                Path filter globs (one per line — empty = build on every commit)
              </span>
              <textarea
                value={watch.pathFilter ?? ''}
                onChange={(e) => {
                  setWatch({ ...watch, pathFilter: e.target.value });
                  setDirty(true);
                }}
                rows={3}
                placeholder={'ios/**\nshared/**'}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-xs text-slate-100"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 md:col-span-2">
              <input
                type="checkbox"
                checked={watch.cancelInProgressOnNewCommit ?? false}
                onChange={(e) => {
                  setWatch({ ...watch, cancelInProgressOnNewCommit: e.target.checked });
                  setDirty(true);
                }}
                className="h-3 w-3"
              />
              Cancel previous in-flight build when a new commit / trigger arrives
              (rolling-build mode)
            </label>
          </div>
        </div>
      )}

      <SaveTemplateDialog
        open={saveTemplateNodeId !== null}
        baseStepType={
          (nodes.find((n) => n.id === saveTemplateNodeId)?.type as StepType) ?? 'shell'
        }
        initialName={
          (nodes.find((n) => n.id === saveTemplateNodeId)?.data as { templateLabel?: string })
            ?.templateLabel ?? ''
        }
        onClose={() => setSaveTemplateNodeId(null)}
        onSubmit={async ({ name, description }) => {
          const node = nodes.find((n) => n.id === saveTemplateNodeId);
          if (!node) return;
          // Strip runtime + template-bookkeeping fields from the snapshot —
          // those are per-instance metadata, not part of the preset.
          const {
            runtimeStatus: _s,
            runtimeStartedAt: _a,
            runtimeFinishedAt: _b,
            templateLabel: _tl,
            templateId: _ti,
            ...persisted
          } = node.data as Record<string, unknown> & {
            runtimeStatus?: unknown;
            runtimeStartedAt?: unknown;
            runtimeFinishedAt?: unknown;
            templateLabel?: unknown;
            templateId?: unknown;
          };
          void _s;
          void _a;
          void _b;
          void _tl;
          void _ti;
          await saveNodeTemplate({
            name,
            description,
            baseStepType: node.type as StepType,
            data: persisted,
          });
        }}
      />

      <div className="flex min-h-0 flex-1">
        <Palette
          templates={nodeTemplates}
          onDeleteTemplate={(t) =>
            requestConfirmation({
              title: `Delete template "${t.name}"?`,
              body: 'Pipelines that already have this template placed will keep the existing nodes.',
              variant: 'destructive',
              confirmLabel: 'Delete template',
              onConfirm: () => deleteNodeTemplate(t.id),
            })
          }
        />

        <div ref={wrapperRef} className="relative min-h-0 flex-1" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={handleSelectionChange}
            onNodeContextMenu={(ev, node) => {
              ev.preventDefault();
              setContextMenu({ x: ev.clientX, y: ev.clientY, nodeId: node.id });
            }}
            onPaneContextMenu={() => setContextMenu(null)}
            onEdgeMouseEnter={(ev, edge) => {
              const tip =
                (edge.data as { conditionTooltip?: string } | undefined)?.conditionTooltip ??
                'condition';
              setEdgeTooltip({ x: ev.clientX, y: ev.clientY, text: tip });
            }}
            onEdgeMouseMove={(ev) => {
              setEdgeTooltip((prev) => (prev ? { ...prev, x: ev.clientX, y: ev.clientY } : null));
            }}
            onEdgeMouseLeave={() => setEdgeTooltip(null)}
            onEdgeClick={(_e, edge) => {
              recordHistory();
              setEdges((eds) =>
                eds.map((x) => {
                  if (x.id !== edge.id) return x;
                  const cur = ((x.data as { condition?: 'success' | 'failure' | 'always' } | undefined)?.condition) ?? 'success';
                  const next: 'success' | 'failure' | 'always' =
                    cur === 'success' ? 'failure' : cur === 'failure' ? 'always' : 'success';
                  return pipelineEdgeToReactFlow({
                    id: x.id,
                    source: x.source,
                    target: x.target,
                    condition: next,
                  });
                }),
              );
              setDirty(true);
            }}
            fitView
            colorMode="dark"
          >
            <Background gap={16} color="#1e293b" />
            <Controls position="bottom-right" showInteractive={false} />
            {edgeTooltip && (
              <div
                className="pointer-events-none fixed z-50 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 shadow-lg"
                style={{ left: edgeTooltip.x + 12, top: edgeTooltip.y + 12 }}
              >
                {edgeTooltip.text}
                <div className="text-[9px] text-slate-500">click to cycle</div>
              </div>
            )}
            {showMinimap && (
              <MiniMap
                pannable
                zoomable
                position="bottom-left"
                maskColor="rgba(2, 6, 23, 0.7)"
                style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }}
                nodeColor={(n) => {
                  const def = STEP_DEFINITIONS[n.type as StepType];
                  return def?.color ?? '#475569';
                }}
                nodeStrokeColor="#1e293b"
              />
            )}
          </ReactFlow>
        </div>

        {contextMenu && (
          <NodeContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            nodeId={contextMenu.nodeId}
            disabled={(() => {
              const n = nodesRef.current.find((x) => x.id === contextMenu.nodeId);
              const d = (n?.data as { disabled?: boolean | string } | undefined)?.disabled;
              return d === true || d === 'true';
            })()}
            onClose={() => setContextMenu(null)}
            onRunFrom={async (nodeId) => {
              if (dirty) await save();
              await triggerBuild(pipeline.id, nodeId);
            }}
            onClone={cloneNode}
            onDelete={deleteNode}
            onCopy={copySingle}
            onToggleDisable={toggleDisableNode}
          />
        )}

        <StepPropertyPanel
          node={selectedNode}
          branches={branches}
          entries={latestEntries}
          onChange={updateNodeData}
          onDelete={deleteNode}
          onRunFrom={async (nodeId) => {
            if (dirty) await save();
            await triggerBuild(pipeline.id, nodeId);
          }}
          onSaveAsTemplate={(nodeId) => setSaveTemplateNodeId(nodeId)}
        />
      </div>
    </div>
  );
}

function Palette({
  templates,
  onDeleteTemplate,
}: {
  templates: NodeTemplate[];
  onDeleteTemplate(t: NodeTemplate): void;
}) {
  const [query, setQuery] = useState('');
  // Track which groups are collapsed. Empty Set = all open. Persists for the
  // editor's lifetime; resets on page reload.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const q = query.trim().toLowerCase();
  const matches = (label: string, description: string) =>
    q === '' || label.toLowerCase().includes(q) || description.toLowerCase().includes(q);

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredTemplates =
    q === ''
      ? templates
      : templates.filter((t) => {
          const def = STEP_DEFINITIONS[t.baseStepType];
          return matches(t.name, t.description ?? def.label);
        });

  return (
    <div className="scrollbar-thin flex w-52 shrink-0 flex-col gap-2 overflow-y-auto border-r border-slate-800 bg-slate-950 p-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search nodes…"
        className="w-full rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-[12px] text-slate-200 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
      />
      <div className="text-[11px] uppercase tracking-wider text-slate-500">Drag to canvas</div>

      {STEP_CATEGORIES.map((group) => {
        const items = group.types
          .map((type) => ({ type, def: STEP_DEFINITIONS[type] }))
          .filter(({ def }) => matches(def.label, def.description));
        if (items.length === 0) return null;
        // While searching, force-expand groups so matches are always visible.
        const isOpen = q !== '' || !collapsed.has(group.key);
        return (
          <div key={group.key} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              className="flex items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200"
            >
              {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <span className="flex-1 truncate">{group.label}</span>
              <span className="text-slate-600">{items.length}</span>
            </button>
            {isOpen &&
              items.map(({ type, def }) => (
                <PaletteItem key={type} type={type} def={def} />
              ))}
          </div>
        );
      })}

      {filteredTemplates.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="mt-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Custom templates
          </div>
          {filteredTemplates.map((t) => {
            const def = STEP_DEFINITIONS[t.baseStepType];
            return (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/buildpilot-template', t.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                className="group relative cursor-grab rounded-md border bg-slate-900 px-2.5 py-1.5 text-[12px] text-slate-200 hover:border-slate-500"
                style={{ borderColor: def.color, borderStyle: 'dashed' }}
                title={t.description ?? `${def.label} preset`}
              >
                <div className="truncate">{t.name}</div>
                <div className="text-[9px] uppercase tracking-wider text-slate-500">
                  {def.label}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTemplate(t);
                  }}
                  className="absolute right-1 top-1 rounded p-0.5 text-slate-500 opacity-0 hover:text-rose-400 group-hover:opacity-100"
                  title="Delete this template"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PaletteItem({
  type,
  def,
}: {
  type: StepType;
  def: (typeof STEP_DEFINITIONS)[StepType];
}) {
  const [hover, setHover] = useState(false);
  const required = def.fields.filter((f) => f.required);
  const optional = def.fields.filter((f) => !f.required);
  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/buildpilot-step', type);
          e.dataTransfer.effectAllowed = 'move';
          setHover(false);
        }}
        className="cursor-grab rounded-md border bg-slate-900 px-2.5 py-1.5 text-[12px] text-slate-200 hover:border-slate-500"
        style={{ borderColor: def.color }}
      >
        {def.label}
      </div>
      {hover && (
        <div className="pointer-events-none absolute left-full top-0 z-50 ml-2 w-72 rounded-md border border-slate-700 bg-slate-900 p-3 text-[11px] text-slate-200 shadow-xl">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: def.color }}
            />
            <span className="font-semibold text-slate-100">{def.label}</span>
          </div>
          <p className="mt-1 text-[10.5px] text-slate-400">{def.description}</p>
          {required.length > 0 && (
            <div className="mt-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-rose-400">
                Required ({required.length})
              </div>
              <ul className="mt-0.5 space-y-0.5">
                {required.slice(0, 8).map((f) => (
                  <li key={f.name} className="truncate">
                    · {f.label}
                  </li>
                ))}
                {required.length > 8 && (
                  <li className="text-slate-500">+{required.length - 8} more…</li>
                )}
              </ul>
            </div>
          )}
          {optional.length > 0 && (
            <div className="mt-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                Optional ({optional.length})
              </div>
              <ul className="mt-0.5 space-y-0.5 text-slate-400">
                {optional.slice(0, 6).map((f) => (
                  <li key={f.name} className="truncate">
                    · {f.label}
                  </li>
                ))}
                {optional.length > 6 && (
                  <li className="text-slate-500">+{optional.length - 6} more…</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function defaultData(type: StepType): Record<string, unknown> {
  switch (type) {
    case 'checkout':
      return { branch: 'main' };
    case 'pull':
      return { remote: 'origin' };
    case 'shell':
      return { command: '' };
    case 'unityBatch':
      return {
        unityPath: '',
        buildTarget: 'StandaloneLinux64',
        executeMethod: '',
        extraArgs: '',
        logPath: '',
      };
    case 'httpRequest':
      return { method: 'POST', url: '', headers: '', body: '', expectedStatus: '' };
    case 'slackNotify':
      return { webhookUrl: '', text: '' };
    case 'discordNotify':
      return { webhookUrl: '', content: '' };
    case 'telegramNotify':
      return { botToken: '', chatId: '', text: '', parseMode: 'plain', silent: 'false' };
    case 'aiPrompt':
      return { tool: 'claude', command: '', prompt: '', cwd: '', allowFailure: 'false' };
    case 'artifact':
      return { paths: '' };
    case 'remoteSsh':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        cwd: '',
        command: '',
        skipStrictHostKey: 'false',
      };
    case 'xcodebuild':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        workspacePath: '',
        projectPath: '',
        scheme: '',
        configuration: 'Release',
        buildAction: 'archive',
        destination: 'generic/platform=iOS',
        archivePath: '',
        exportPath: '',
        exportOptionsPlist: '',
        additionalArgs: '',
      };
    case 'gitMerge':
      return { sourceBranch: '', noFastForward: 'false', message: '' };
    case 'sftpUpload':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        localPath: '',
        remotePath: '',
        skipStrictHostKey: 'false',
      };
    case 'testflightUpload':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        ipaPath: '',
        platform: 'ios',
        authMethod: 'apiKey',
        apiKeyId: '',
        apiIssuerId: '',
        appleId: '',
        appPassword: '',
        additionalArgs: '',
      };
    case 'keychainUnlock':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        keychain: '',
        unlockTimeoutSec: 3600,
      };
    case 'provisioningProfileInstall':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        profilePath: '',
      };
    case 'notarize':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        bundlePath: '',
        authMethod: 'apiKey',
        apiKeyPath: '',
        apiKeyId: '',
        apiIssuerId: '',
        appleId: '',
        appPassword: '',
        teamId: '',
        wait: 'true',
        additionalArgs: '',
      };
    case 'stapleNotarization':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        bundlePath: '',
      };
    case 'fastlaneMatch':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        matchType: 'appstore',
        appIdentifier: '',
        gitUrl: '',
        gitBranch: '',
        keychainName: '',
        keychainPassword: '',
        readonly: 'true',
        cwd: '',
        additionalArgs: '',
      };
    case 'cocoapodsInstall':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        command: 'install',
        repoUpdate: 'false',
        useBundleExec: 'false',
        cwd: '',
        additionalArgs: '',
      };
    case 'swiftPackageResolve':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        workspacePath: '',
        projectPath: '',
        scheme: '',
        clonedSourcePackagesDirPath: '',
        additionalArgs: '',
      };
    case 'dsymUpload':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        backend: 'sentry',
        dsymPath: '',
        googleServicePlistPath: '',
        uploadSymbolsBinary: '',
        platform: 'ios',
        sentryOrg: '',
        sentryProject: '',
        sentryAuthToken: '',
        bugsnagApiKey: '',
        bugsnagCliPath: '',
        additionalArgs: '',
      };
    case 'xcresultParse':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        bundlePath: '',
        failOnTestFailure: 'true',
      };
    case 'xcodeSelect':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        xcodePath: '',
      };
    case 'ensureGitStatusClean':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        cwd: '',
      };
    case 'incrementBuildNumber':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        mode: 'agvtool',
        versionString: '',
        plistPath: '',
        cwd: '',
      };
    case 'getBuildNumber':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        mode: 'agvtool',
        plistPath: '',
        cwd: '',
      };
    case 'changelogFromGitCommits':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        fromRef: '',
        toRef: '',
        format: 'subject',
        maxCommits: 1000,
        cwd: '',
      };
    case 'updateInfoPlist':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        plistPath: '',
        key: '',
        operation: 'set',
        value: '',
        cwd: '',
      };
    case 'swiftlint':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        mode: 'lint',
        configFile: '',
        paths: '',
        strict: 'false',
        reporter: 'xcode',
        quiet: 'false',
        cwd: '',
      };
    case 'swiftFormat':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        mode: 'lint',
        configFile: '',
        paths: '',
        recursive: 'true',
        parallel: 'false',
        cwd: '',
      };
    case 'xcodebuildAnalyze':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        workspacePath: '',
        projectPath: '',
        scheme: '',
        configuration: 'Release',
        destination: 'generic/platform=iOS',
        additionalArgs: '',
        cwd: '',
      };
    case 'peripheryScan':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        workspacePath: '',
        projectPath: '',
        schemes: '',
        targets: '',
        format: 'xcode',
        strict: 'false',
        configFile: '',
        additionalArgs: '',
        cwd: '',
      };
    case 'slatherCoverage':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        projectPath: '',
        workspacePath: '',
        scheme: '',
        format: 'html',
        outputDirectory: '',
        buildDirectory: '',
        additionalArgs: '',
        cwd: '',
      };
    case 'xcovGate':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        workspacePath: '',
        projectPath: '',
        scheme: '',
        minimumCoveragePercentage: 0,
        outputDirectory: 'xcov_report',
        includeTargets: '',
        excludeTargets: '',
        jsonReport: 'false',
        markdownReport: 'false',
        additionalArgs: '',
        cwd: '',
      };
    case 'resign':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        ipaPath: '',
        signingIdentity: '',
        provisioningProfile: '',
        bundleId: '',
        displayName: '',
        entitlements: '',
        keychainPath: '',
        additionalArgs: '',
        cwd: '',
      };
    case 'snapshot':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        outputDirectory: 'screenshots',
        scheme: '',
        workspacePath: '',
        projectPath: '',
        devices: '',
        languages: '',
        launchArguments: '',
        iosVersion: '',
        clearPreviousScreenshots: 'false',
        outputSimulatorLogs: 'false',
        additionalArgs: '',
        cwd: '',
      };
    case 'frameit':
      return {
        hostId: '',
        host: '',
        identityFile: '',
        password: '',
        pathToScreenshots: './screenshots',
        colorFlag: 'none',
        force: 'false',
        useLegacyIphone5s: 'false',
        usePlatform: '',
        additionalArgs: '',
        cwd: '',
      };
    case 's3Upload':
      return {
        accessKeyId: '',
        secretAccessKey: '',
        region: 'eu-central-1',
        bucket: '',
        localPath: '',
        key: '',
        storageClass: 'STANDARD',
        makePresignedUrl: 'false',
        presignedExpiresSec: 604800,
        manifestKey: '',
        manifestChannel: 'stable',
        manifestPlatform: 'linux-x86_64',
      };
    case 'gradleBuild':
      return {
        output: 'apk',
        variant: 'Release',
        module: ':app',
        gradleTask: '',
        gradleArgs: '',
        cwd: '',
        registerArtifact: 'true',
      };
    case 'adbConnect':
      return {
        address: '',
        adbPath: '',
      };
    case 'adbInstall':
      return {
        apkPath: '',
        serial: '',
        replace: 'true',
        allowDowngrade: 'false',
        allowTest: 'false',
        adbPath: '',
      };
    case 'adbShellLaunch':
      return {
        packageName: '',
        activity: '',
        serial: '',
        waitForLaunch: 'false',
        adbPath: '',
      };
    case 'adbLogcat':
      return {
        durationSec: 30,
        serial: '',
        filter: '',
        outputPath: '',
        clearFirst: 'true',
        registerArtifact: 'true',
        adbPath: '',
      };
  }
  return {};
}

function layoutWithDagre(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 90, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  const NODE_W = 200;
  const NODE_H = 80;
  for (const n of nodes) {
    const width = n.width ?? NODE_W;
    const height = n.height ?? NODE_H;
    g.setNode(n.id, { width, height });
  }
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return nodes.map((n) => {
    const laid = g.node(n.id);
    if (!laid) return n;
    return {
      ...n,
      position: { x: laid.x - (laid.width ?? NODE_W) / 2, y: laid.y - (laid.height ?? NODE_H) / 2 },
    };
  });
}

function pipelineNodesToReactFlow(nodes: PipelineNode[]): Node[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
  }));
}

const EDGE_STYLE: Record<'success' | 'failure' | 'always', { stroke: string; glyph: string; tooltip: string }> = {
  success: { stroke: '#10b981', glyph: '✓', tooltip: 'on success (default)' },
  failure: { stroke: '#fb7185', glyph: '✕', tooltip: 'on failure' },
  always:  { stroke: '#94a3b8', glyph: '∞', tooltip: 'always (success or failure)' },
};

function pipelineEdgeToReactFlow(e: PipelineEdge): Edge {
  const cond = e.condition ?? 'success';
  const style = EDGE_STYLE[cond];
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    animated: true,
    label: style.glyph,
    labelStyle: { fill: style.stroke, fontSize: 13, fontWeight: 700 },
    labelBgStyle: { fill: '#0f172a', stroke: style.stroke, strokeWidth: 1 },
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 999,
    style: { stroke: style.stroke, strokeWidth: 1.5 },
    data: { condition: cond, conditionTooltip: style.tooltip },
  };
}

function pipelineEdgesToReactFlow(edges: PipelineEdge[]): Edge[] {
  return edges.map(pipelineEdgeToReactFlow);
}

function reactFlowNodesToPipeline(nodes: Node[]): PipelineNode[] {
  return nodes.map((n) => {
    // Strip transient UI-only state before persisting.
    const {
      runtimeStatus: _s,
      runtimeStartedAt: _a,
      runtimeFinishedAt: _b,
      ...persisted
    } = n.data as Record<string, unknown> & {
      runtimeStatus?: unknown;
      runtimeStartedAt?: unknown;
      runtimeFinishedAt?: unknown;
    };
    void _s;
    void _a;
    void _b;
    return {
      id: n.id,
      type: n.type as StepType,
      position: n.position,
      data: persisted,
    };
  });
}

function reactFlowEdgesToPipeline(edges: Edge[]): PipelineEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    condition:
      (e.data as { condition?: 'success' | 'failure' | 'always' } | undefined)?.condition ??
      'success',
  }));
}
