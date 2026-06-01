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
import { ChevronDown, ChevronRight, Hammer, LayoutGrid, Map as MapIcon, Redo2, Save, Search, Square, Trash2, Undo2, X } from 'lucide-react';
import type {
  Matrix,
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
import { useBelow } from '../lib/breakpoint';
import { cn } from '../lib/cn';
import {
  clearDraft,
  draftDiffersFromPipeline,
  readDraft,
  writeDraft,
  type PipelineDraft,
} from '../lib/draftStorage';
import { formatRelative } from '../lib/formatDate';
import { BranchSelect } from './BranchSelect';
import { CronBuilder } from './CronBuilder';
import { MatrixEditor } from './MatrixEditor';
import { SlashCommandConfig } from './SlashCommandConfig';
import { NodeContextMenu } from './NodeContextMenu';
import { PathFilterPreview } from './PathFilterPreview';
import { SaveTemplateDialog } from './SaveTemplateDialog';
import { StepNode } from './StepNode';
import { StepPropertyPanel, EMPTY_ENTRIES } from './StepPropertyPanel';
import { TagPatternPreview } from './TagPatternPreview';

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
  const softDeletePipeline = useStore((s) => s.softDeletePipeline);
  const requestConfirmation = useStore((s) => s.requestConfirmation);
  const nodeTemplates = useStore((s) => s.nodeTemplates);
  const saveNodeTemplate = useStore((s) => s.saveNodeTemplate);
  const deleteNodeTemplate = useStore((s) => s.deleteNodeTemplate);
  // WP7: lanes feed the Triggers panel's execution-lane dropdown. Loaded
  // app-wide in App.tsx; we just read here.
  const lanes = useStore((s) => s.lanes);
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
  // UI v2 Faz 5.B.1 — most recent finished build for the header meta
  // line ("last built X ago"). Pulled from the global builds list; we
  // filter to this pipeline + a terminal status so a stuck pending row
  // doesn't claim the slot.
  const lastFinishedBuild = useStore((s) =>
    s.builds.find(
      (b) =>
        b.pipelineId === pipeline.id &&
        (b.status === 'success' || b.status === 'failed' || b.status === 'cancelled'),
    ),
  );


  const [nodes, setNodes] = useState<Node[]>(() => pipelineNodesToReactFlow(pipeline.nodes));
  const [edges, setEdges] = useState<Edge[]>(() => pipelineEdgesToReactFlow(pipeline.edges));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [name, setName] = useState(pipeline.name);
  const [watch, setWatch] = useState<PipelineWatch>(pipeline.watch);
  const [matrix, setMatrix] = useState<Matrix | null>(pipeline.matrix ?? null);
  // WP7: lane assignment + scheduling priority (lower = earlier inside the lane).
  const [laneId, setLaneId] = useState(pipeline.laneId);
  const [priority, setPriority] = useState(pipeline.priority);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [triggersOpen, setTriggersOpen] = useState(false);
  // UI v2 Faz 5.B.3 — Triggers panel split into focused tabs so users
  // don't scan a 2-col grid to find one knob.
  const [triggersTab, setTriggersTab] = useState<
    'lane' | 'branch' | 'tag' | 'cron' | 'paths' | 'webhook'
  >('lane');
  // Cluster 11.C — matrix editor panel toggle. Lives alongside the
  // existing "Triggers" disclosure so the header stays uncluttered.
  const [matrixOpen, setMatrixOpen] = useState(false);
  // Save-as-template dialog state. Holds the source node id whose data we
  // will snapshot when the user confirms.
  const [saveTemplateNodeId, setSaveTemplateNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [edgeTooltip, setEdgeTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [findIndex, setFindIndex] = useState(0);
  const [showMinimap, setShowMinimap] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('buildpilot:editor:minimap') === '1';
  });
  // Responsive overhaul Faz 4 — minimap takes ~20% of a phone viewport,
  // making the canvas itself unreadable. Always hide it below md, even
  // when the user previously enabled it on desktop.
  const isMobile = useBelow('md');
  const effectiveShowMinimap = showMinimap && !isMobile;
  // Cluster 10.E — draft auto-save. We surface a banner if a localStorage
  // draft is newer than the server pipeline so the user can choose to
  // restore. Drafts are written debounced as they edit.
  const [draftBanner, setDraftBanner] = useState<PipelineDraft | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, setCenter } = useReactFlow();
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
    setMatrix(pipeline.matrix ?? null);
    setLaneId(pipeline.laneId);
    setPriority(pipeline.priority);
    setDirty(false);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    history.reset();
    // Surface a banner if a localStorage draft is newer than the server
    // pipeline. We don't auto-restore so the user keeps control.
    const draft = readDraft(pipeline.id);
    if (draft && draftDiffersFromPipeline(draft, pipeline)) {
      setDraftBanner(draft);
    } else {
      setDraftBanner(null);
      if (draft) clearDraft(pipeline.id);
    }
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

  const findMatches = useMemo(() => {
    const q = findQuery.trim().toLowerCase();
    if (!q) return [] as Node[];
    return nodes.filter((n) => {
      if (n.id.toLowerCase().includes(q)) return true;
      if (String(n.type ?? '').toLowerCase().includes(q)) return true;
      const data = n.data as Record<string, unknown>;
      for (const k of Object.keys(data)) {
        const v = data[k];
        if (typeof v === 'string' && v.toLowerCase().includes(q)) return true;
        if (typeof v === 'number' && String(v).includes(q)) return true;
      }
      return false;
    });
  }, [nodes, findQuery]);

  const focusMatch = useCallback(
    (idx: number) => {
      if (findMatches.length === 0) return;
      const wrapped = ((idx % findMatches.length) + findMatches.length) % findMatches.length;
      const target = findMatches[wrapped];
      if (!target) return;
      setFindIndex(wrapped);
      setSelectedNodeId(target.id);
      setSelectedNodeIds([target.id]);
      setNodes((nds) =>
        nds.map((n) => ({ ...n, selected: n.id === target.id })),
      );
      const w = target.width ?? 200;
      const h = target.height ?? 80;
      setCenter(target.position.x + w / 2, target.position.y + h / 2, { zoom: 1.25, duration: 200 });
    },
    [findMatches, setCenter],
  );

  const replaceCurrent = useCallback(() => {
    if (findMatches.length === 0) return;
    const target = findMatches[findIndex % findMatches.length];
    if (!target) return;
    const q = findQuery;
    if (!q) return;
    recordHistory();
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== target.id) return n;
        const data = n.data as Record<string, unknown>;
        const next: Record<string, unknown> = { ...data };
        for (const k of Object.keys(next)) {
          const v = next[k];
          if (typeof v === 'string' && v.toLowerCase().includes(q.toLowerCase())) {
            const re = new RegExp(escapeRegExp(q), 'gi');
            next[k] = v.replace(re, replaceQuery);
          }
        }
        return { ...n, data: next };
      }),
    );
    setDirty(true);
  }, [findMatches, findIndex, findQuery, replaceQuery, recordHistory]);

  const replaceAll = useCallback(() => {
    const q = findQuery;
    if (!q) return;
    const ids = new Set(findMatches.map((m) => m.id));
    if (ids.size === 0) return;
    recordHistory();
    const re = new RegExp(escapeRegExp(q), 'gi');
    setNodes((nds) =>
      nds.map((n) => {
        if (!ids.has(n.id)) return n;
        const data = n.data as Record<string, unknown>;
        const next: Record<string, unknown> = { ...data };
        for (const k of Object.keys(next)) {
          const v = next[k];
          if (typeof v === 'string') next[k] = v.replace(re, replaceQuery);
        }
        return { ...n, data: next };
      }),
    );
    setDirty(true);
  }, [findMatches, findQuery, replaceQuery, recordHistory]);

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
      // Cmd/Ctrl+F is special: open even when focus is in an input. The find
      // overlay's own input then takes over.
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFindOpen(true);
        return;
      }
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
  const selectedNodes = useMemo(
    () => nodes.filter((n) => selectedNodeIds.includes(n.id)),
    [nodes, selectedNodeIds],
  );

  const bulkChange = useCallback(
    (ids: string[], patch: Record<string, unknown>) => {
      recordHistory();
      const idSet = new Set(ids);
      setNodes((nds) =>
        nds.map((n) => (idSet.has(n.id) ? { ...n, data: { ...(n.data as Record<string, unknown>), ...patch } } : n)),
      );
      setDirty(true);
    },
    [recordHistory],
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

      // UI v2 Faz 5.A.3 — Recipe: drop N nodes laid out vertically + N-1
      // edges connecting them. Reuses the same dropPayload contract as
      // copy-paste so positioning + history work the same way.
      const recipeId = event.dataTransfer.getData('application/buildpilot-recipe');
      if (recipeId) {
        const recipe = RECIPES.find((r) => r.id === recipeId);
        if (!recipe) return;
        recordHistory();
        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];
        const stepVerticalGap = 90;
        recipe.steps.forEach((stepType, i) => {
          if (!STEP_DEFINITIONS[stepType]) return;
          const nid = `n_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2, 5)}`;
          newNodes.push({
            id: nid,
            type: stepType,
            position: { x: position.x, y: position.y + i * stepVerticalGap },
            data: defaultData(stepType),
          });
          const prev = newNodes[i - 1];
          if (prev) {
            newEdges.push({
              id: `e_${prev.id}_${nid}`,
              source: prev.id,
              target: nid,
            });
          }
        });
        setNodes((nds) => [...nds, ...newNodes]);
        setEdges((eds) => [...eds, ...newEdges]);
        setDirty(true);
        return;
      }

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

  // Debounced draft write — anytime the user touches the editor we shove
  // the current state into localStorage so a tab crash doesn't lose work.
  // The 1s debounce keeps us from thrashing localStorage on every drag tick.
  useEffect(() => {
    if (!dirty) return;
    const handle = window.setTimeout(() => {
      writeDraft(pipeline.id, {
        name,
        watch,
        nodes: reactFlowNodesToPipeline(nodes),
        edges: reactFlowEdgesToPipeline(edges),
        matrix,
        savedAt: Date.now(),
      });
    }, 1000);
    return () => window.clearTimeout(handle);
  }, [pipeline.id, dirty, name, watch, nodes, edges, matrix]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updatePipeline(pipeline.id, {
        name,
        watch,
        laneId,
        priority,
        nodes: reactFlowNodesToPipeline(nodes),
        edges: reactFlowEdgesToPipeline(edges),
        matrix,
      });
      upsertPipeline(updated);
      setDirty(false);
      // Successful save — the draft is now redundant. Clearing here means
      // the banner doesn't re-appear when the user closes and reopens.
      clearDraft(pipeline.id);
      setDraftBanner(null);
    } finally {
      setSaving(false);
    }
  };

  const restoreDraft = () => {
    if (!draftBanner) return;
    setName(draftBanner.name);
    setWatch(draftBanner.watch);
    setMatrix(draftBanner.matrix ?? null);
    setNodes(pipelineNodesToReactFlow(draftBanner.nodes));
    setEdges(pipelineEdgesToReactFlow(draftBanner.edges));
    setDirty(true);
    setDraftBanner(null);
    history.reset();
  };

  const discardDraft = () => {
    clearDraft(pipeline.id);
    setDraftBanner(null);
  };

  const runNow = async () => {
    if (dirty) await save();
    await triggerBuild(pipeline.id);
  };

  // UI v2 Faz 5.A.4 — graph validation overlay. Walks the current
  // nodes + edges to surface two classes of issue:
  //   1. Orphan nodes (no incoming AND no outgoing edge) — unreachable
  //      branches the user probably forgot to wire up
  //   2. Cycles — DFS that records the recursion stack and flags edges
  //      that close back into it. Reported as the node where the cycle
  //      closes so the user can locate it on the canvas
  // We recompute on every nodes/edges change, but the walk is O(N+E)
  // and N is bounded at ~hundreds, so this stays cheap.
  const validationIssues = useMemo(() => {
    const issues: Array<{ kind: 'orphan' | 'cycle'; nodeId: string; label: string }> = [];
    if (nodes.length <= 1) return issues;
    const inEdges = new Map<string, number>();
    const outEdges = new Map<string, string[]>();
    for (const n of nodes) {
      inEdges.set(n.id, 0);
      outEdges.set(n.id, []);
    }
    for (const e of edges) {
      inEdges.set(e.target, (inEdges.get(e.target) ?? 0) + 1);
      outEdges.get(e.source)?.push(e.target);
    }
    const labelFor = (id: string): string => {
      const n = nodes.find((x) => x.id === id);
      if (!n) return id.slice(0, 8);
      const data = n.data as { templateLabel?: string };
      const def = n.type ? STEP_DEFINITIONS[n.type as StepType] : undefined;
      return data?.templateLabel ?? def?.label ?? n.type ?? id.slice(0, 8);
    };
    // Orphans
    for (const n of nodes) {
      if ((inEdges.get(n.id) ?? 0) === 0 && (outEdges.get(n.id) ?? []).length === 0) {
        issues.push({ kind: 'orphan', nodeId: n.id, label: labelFor(n.id) });
      }
    }
    // Cycles via DFS
    const WHITE = 0;
    const GREY = 1;
    const BLACK = 2;
    const color = new Map<string, number>();
    for (const n of nodes) color.set(n.id, WHITE);
    const cyclesFound = new Set<string>();
    const dfs = (id: string) => {
      color.set(id, GREY);
      for (const next of outEdges.get(id) ?? []) {
        const c = color.get(next) ?? WHITE;
        if (c === GREY) cyclesFound.add(next);
        else if (c === WHITE) dfs(next);
      }
      color.set(id, BLACK);
    };
    for (const n of nodes) {
      if ((color.get(n.id) ?? WHITE) === WHITE) dfs(n.id);
    }
    for (const id of cyclesFound) {
      issues.push({ kind: 'cycle', nodeId: id, label: labelFor(id) });
    }
    return issues;
  }, [nodes, edges]);
  // UI v2 Faz 5.A.2 — decorate edges with a runtime-status class so the
  // CSS rules in index.css can paint them (animated dash for running,
  // status-coloured stroke for success/failed). The decoration is
  // derived, not stored, so React Flow's internal edge changes never
  // race with our paint.
  const decoratedEdges = useMemo(
    () =>
      edges.map((e) => {
        const target = nodes.find((n) => n.id === e.target);
        const status = (target?.data as { runtimeStatus?: string } | undefined)?.runtimeStatus;
        const cls =
          status === 'running'
            ? 'edge-running'
            : status === 'failed'
              ? 'edge-failed'
              : status === 'success'
                ? 'edge-success'
                : undefined;
        return cls ? { ...e, className: cls } : e;
      }),
    [edges, nodes],
  );
  const [validationOpen, setValidationOpen] = useState(false);
  const focusOnNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === id })));
      setValidationOpen(false);
    },
    [setNodes],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* UI v2 Faz 5.B — pipeline editor header. Watch / interval / Telegram
          / Triggers / Matrix render as chips on the left; undo/redo/save
          actions sit on the right. Chips use bg-bg-elevated so the active
          dot stands out, and a filled "●" marker shows when an advanced
          option (tag pattern, cron, path filter, etc.) is configured. */}
      <header className="flex flex-wrap items-center justify-between gap-y-2 border-b border-border-subtle bg-bg-panel px-3 py-2 sm:flex-nowrap sm:px-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex flex-col gap-0.5 min-w-0 mr-1">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              className="bg-transparent text-[15px] font-semibold text-text-primary outline-none min-w-0 max-w-[260px] truncate focus:bg-bg-hover rounded px-1 -mx-1 transition-colors"
              aria-label="Pipeline name"
            />
            {/* UI v2 Faz 5.B.1 — meta line: step + edge counts + last-build
                timing. Hidden when the pipeline is brand-new (no builds yet)
                so a fresh editor doesn't show "last built —" noise. */}
            <span className="text-[10.5px] text-text-faint font-mono leading-tight">
              {nodes.length} step{nodes.length === 1 ? '' : 's'} · {edges.length} edge
              {edges.length === 1 ? '' : 's'}
              {activeBuild && (
                <>
                  {' · '}
                  <span className="text-status-running">
                    running #{activeBuild.id.slice(0, 7)}
                  </span>
                </>
              )}
              {!activeBuild && lastFinishedBuild && (
                <>
                  {' · last built '}
                  <span className="text-text-muted">
                    {formatRelative(lastFinishedBuild.finishedAt ?? lastFinishedBuild.startedAt)}
                  </span>
                </>
              )}
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-btn bg-bg-elevated border border-border-subtle px-2 py-0.5 text-[11px] text-text-muted">
            <span className="uppercase tracking-wider text-text-faint font-semibold">Watch:</span>
            <BranchSelect
              value={watch.branch}
              onChange={(b) => {
                setWatch({ ...watch, branch: b });
                setDirty(true);
              }}
              branches={branches}
            />
          </span>
          <span className="rounded-btn bg-bg-elevated border border-border-subtle px-2 py-0.5 text-[11px] text-text-muted">
            every{' '}
            <input
              type="number"
              min={5}
              value={watch.intervalSec}
              onChange={(e) => {
                setWatch({ ...watch, intervalSec: Math.max(5, Number(e.target.value)) });
                setDirty(true);
              }}
              className="w-12 bg-transparent text-center text-text-primary outline-none"
            />
            s
          </span>
          <label
            className="inline-flex items-center gap-1 rounded-btn bg-bg-elevated border border-border-subtle px-2 py-0.5 text-[11px] text-text-muted hover:text-text-secondary cursor-pointer transition-colors"
            title="When the watched branch advances, send a Telegram message asking whether to build (requires bot configured in ~/.buildpilot/config.json)"
          >
            <input
              type="checkbox"
              checked={watch.telegramApprovals ?? false}
              onChange={(e) => {
                setWatch({ ...watch, telegramApprovals: e.target.checked });
                setDirty(true);
              }}
              className="h-3 w-3 accent-accent"
            />
            Telegram ask
          </label>
          <button
            type="button"
            onClick={() => setTriggersOpen((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1 rounded-btn border px-2 py-0.5 text-[11px] transition-colors',
              triggersOpen
                ? 'bg-accent-soft border-accent text-accent'
                : 'bg-bg-elevated border-border-subtle text-text-secondary hover:text-text-primary',
            )}
            title="Advanced trigger options (tag pattern, cron schedule, path filter, rolling builds)"
            aria-expanded={triggersOpen}
          >
            Triggers
            <span aria-hidden>
              {watch.tagPattern ||
              watch.cronExpr ||
              watch.pathFilter ||
              watch.cancelInProgressOnNewCommit ||
              watch.prCommands
                ? '●'
                : '…'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMatrixOpen((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1 rounded-btn border px-2 py-0.5 text-[11px] transition-colors',
              matrixOpen
                ? 'bg-accent-soft border-accent text-accent'
                : 'bg-bg-elevated border-border-subtle text-text-secondary hover:text-text-primary',
            )}
            title="Declarative build matrix — fan one trigger out into N parallel builds"
            aria-expanded={matrixOpen}
          >
            Matrix
            <span aria-hidden>{matrix && Object.keys(matrix.axes).length > 0 ? '●' : '…'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {dirty && <span className="text-[11px] text-status-running font-medium">unsaved</span>}
          {!dirty && !saving && (
            <span className="text-[11px] text-text-faint inline-flex items-center gap-1">
              <span className="inline-block size-1.5 rounded-full bg-status-success" aria-hidden />
              saved
            </span>
          )}
          <button
            type="button"
            onClick={doUndo}
            disabled={!history.canUndo}
            className="inline-flex items-center gap-1 rounded-btn border border-border-subtle bg-bg-elevated px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-border disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            title="Undo (Cmd/Ctrl+Z)"
            aria-label="Undo last edit"
          >
            <Undo2 size={12} />
          </button>
          <button
            type="button"
            onClick={doRedo}
            disabled={!history.canRedo}
            className="inline-flex items-center gap-1 rounded-btn border border-border-subtle bg-bg-elevated px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-border disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            title="Redo (Cmd/Ctrl+Shift+Z)"
            aria-label="Redo edit"
          >
            <Redo2 size={12} />
          </button>
          <button
            type="button"
            onClick={autoLayout}
            className="inline-flex items-center gap-1 rounded-btn border border-border-subtle bg-bg-elevated px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-border transition-colors"
            title="Auto-layout graph"
            aria-label="Auto-layout graph"
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
            // Responsive overhaul follow-up — hide the toggle on phones.
            // The minimap itself is force-hidden below md (see
            // effectiveShowMinimap), so leaving the button visible would
            // produce a no-op tap that flips aria-pressed without any
            // observable effect.
            className={cn(
              'hidden md:inline-flex items-center gap-1 rounded-btn border px-2 py-1 text-xs transition-colors',
              showMinimap
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border-subtle bg-bg-elevated text-text-secondary hover:text-text-primary hover:border-border',
            )}
            title="Toggle minimap"
            aria-label="Toggle minimap"
            aria-pressed={showMinimap}
          >
            <MapIcon size={12} />
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 rounded-btn bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
          >
            <Save size={12} /> {saving ? 'Saving…' : 'Save'}
          </button>
          {activeBuild ? (
            <button
              type="button"
              onClick={() => void cancelBuildAction(activeBuild.id)}
              className="focusable inline-flex items-center gap-1 rounded-md border border-rose-700 bg-rose-950/40 px-2.5 py-1 text-xs font-medium text-rose-200 hover:border-rose-500"
              title={`Cancel running build ${activeBuild.id.slice(0, 8)}`}
            >
              <Square size={11} /> Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={runNow}
              className="focusable inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-hover"
            >
              <Hammer size={12} /> Run
            </button>
          )}
          <button
            type="button"
            onClick={() => softDeletePipeline(pipeline.id)}
            className="focusable inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-xs text-rose-400 hover:border-rose-500 hover:text-rose-300"
            title="Delete this pipeline"
            aria-label="Delete this pipeline"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </header>

      {draftBanner && (
        <div className="flex items-center gap-3 border-b border-amber-700/50 bg-amber-950/30 px-4 py-2 text-xs text-amber-200">
          <span className="font-medium">Unsaved changes from {formatRelative(draftBanner.savedAt)}</span>
          <span className="text-amber-300/70">
            ({draftBanner.nodes.length} step{draftBanner.nodes.length === 1 ? '' : 's'},{' '}
            {draftBanner.edges.length} edge{draftBanner.edges.length === 1 ? '' : 's'})
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={restoreDraft}
              className="rounded-md border border-amber-600 bg-amber-900/30 px-2.5 py-0.5 text-amber-100 hover:bg-amber-800/40"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="rounded-md border border-border-subtle px-2.5 py-0.5 text-text-secondary hover:border-rose-500 hover:text-rose-300"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {triggersOpen && (
        <div className="border-b border-border-subtle bg-bg-panel">
          {/* UI v2 Faz 5.B.3 — tabbed Triggers panel. Each tab is a single
              concern so the user can focus instead of scanning a flat 6-row
              grid. Filled dot next to a tab signals that the underlying
              field is configured (so a user opening Triggers fresh sees
              which knobs already have values). */}
          <nav
            className="flex items-center gap-0.5 px-3 border-b border-border-subtle"
            role="tablist"
            aria-label="Trigger configuration"
          >
            <TriggerTabBtn
              active={triggersTab === 'lane'}
              configured={laneId !== 'default' || priority !== 100}
              onClick={() => setTriggersTab('lane')}
            >
              Lane &amp; Priority
            </TriggerTabBtn>
            <TriggerTabBtn
              active={triggersTab === 'branch'}
              configured={watch.cancelInProgressOnNewCommit === true}
              onClick={() => setTriggersTab('branch')}
            >
              Branch
            </TriggerTabBtn>
            <TriggerTabBtn
              active={triggersTab === 'tag'}
              configured={!!watch.tagPattern}
              onClick={() => setTriggersTab('tag')}
            >
              Tag
            </TriggerTabBtn>
            <TriggerTabBtn
              active={triggersTab === 'cron'}
              configured={!!watch.cronExpr}
              onClick={() => setTriggersTab('cron')}
            >
              Cron
            </TriggerTabBtn>
            <TriggerTabBtn
              active={triggersTab === 'paths'}
              configured={!!watch.pathFilter}
              onClick={() => setTriggersTab('paths')}
            >
              Paths
            </TriggerTabBtn>
            <TriggerTabBtn
              active={triggersTab === 'webhook'}
              configured={!!watch.prCommands}
              onClick={() => setTriggersTab('webhook')}
            >
              PR commands
            </TriggerTabBtn>
          </nav>

          <div className="px-4 py-3">
            {triggersTab === 'lane' && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="block text-xs text-text-secondary">
                  <span className="mb-1 block text-[11px] uppercase tracking-wide text-text-faint">
                    Execution Lane
                  </span>
                  {lanes.length === 0 ? (
                    <select
                      disabled
                      className="w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-xs text-text-faint"
                    >
                      <option>Loading lanes…</option>
                    </select>
                  ) : (
                    <select
                      value={laneId}
                      onChange={(e) => {
                        setLaneId(e.target.value);
                        setDirty(true);
                      }}
                      className="w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
                    >
                      {!lanes.some((l) => l.id === laneId) && (
                        <option value={laneId}>(orphan: {laneId})</option>
                      )}
                      {lanes.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} (max {l.maxConcurrency})
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="mt-1 block text-[10px] text-text-faint">
                    Lanes cap concurrency for a pool of pipelines.
                  </span>
                </label>
                <label className="block text-xs text-text-secondary">
                  <span className="mb-1 block text-[11px] uppercase tracking-wide text-text-faint">
                    Priority
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={priority}
                    onChange={(e) => {
                      setPriority(Number(e.target.value));
                      setDirty(true);
                    }}
                    className="w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
                  />
                  <span className="mt-1 block text-[10px] text-text-faint">
                    Lower runs first within the lane. Default 100.
                  </span>
                </label>
              </div>
            )}

            {triggersTab === 'branch' && (
              <div className="space-y-3">
                <p className="text-[11px] text-text-muted">
                  The branch + poll interval live in the header chip. This tab
                  controls how the branch trigger behaves when a new commit
                  arrives while a build is still running.
                </p>
                <label className="inline-flex items-start gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={watch.cancelInProgressOnNewCommit ?? false}
                    onChange={(e) => {
                      setWatch({ ...watch, cancelInProgressOnNewCommit: e.target.checked });
                      setDirty(true);
                    }}
                    className="mt-0.5 h-3 w-3 accent-accent"
                  />
                  <span>
                    <span className="block text-text-primary">Rolling builds</span>
                    <span className="block text-[10.5px] text-text-faint">
                      Cancel previous in-flight build when a new commit / trigger arrives.
                      Saves builder cycles on a busy branch.
                    </span>
                  </span>
                </label>
              </div>
            )}

            {triggersTab === 'tag' && (
              <div className="space-y-2">
                <span className="block text-[11px] uppercase tracking-wide text-text-muted">
                  Tag pattern (glob)
                </span>
                <TagPatternPreview
                  projectId={pipeline.projectId}
                  value={watch.tagPattern ?? ''}
                  onChange={(pattern) => {
                    setWatch({ ...watch, tagPattern: pattern });
                    setDirty(true);
                  }}
                />
                <p className="text-[10.5px] text-text-faint">
                  Builds fire when a tag matching the glob lands. e.g.{' '}
                  <code className="font-mono text-text-secondary">v*</code> matches
                  any v-prefixed release tag.
                </p>
              </div>
            )}

            {triggersTab === 'cron' && (
              <div className="space-y-2">
                <span className="block text-[11px] uppercase tracking-wide text-text-muted">
                  Cron (5-field, UTC)
                </span>
                <CronBuilder
                  value={watch.cronExpr ?? ''}
                  onChange={(expr) => {
                    setWatch({ ...watch, cronExpr: expr });
                    setDirty(true);
                  }}
                />
                <p className="text-[10.5px] text-text-faint">
                  Scheduled trigger. Independent of branch polling — fires on its
                  own clock.
                </p>
              </div>
            )}

            {triggersTab === 'paths' && (
              <div className="space-y-2">
                <span className="block text-[11px] uppercase tracking-wide text-text-muted">
                  Path filter globs (one per line)
                </span>
                <PathFilterPreview
                  projectId={pipeline.projectId}
                  branch={watch.branch}
                  value={watch.pathFilter ?? ''}
                  onChange={(spec) => {
                    setWatch({ ...watch, pathFilter: spec });
                    setDirty(true);
                  }}
                />
                <p className="text-[10.5px] text-text-faint">
                  Empty = build on every commit. With a filter set, builds only
                  fire when at least one changed file matches.
                </p>
              </div>
            )}

            {triggersTab === 'webhook' && (
              <SlashCommandConfig
                commands={watch.prCommands ?? ''}
                onCommandsChange={(value) => {
                  setWatch({ ...watch, prCommands: value });
                  setDirty(true);
                }}
                authors={watch.prCommandAuthors ?? ''}
                onAuthorsChange={(value) => {
                  setWatch({ ...watch, prCommandAuthors: value });
                  setDirty(true);
                }}
              />
            )}
          </div>
        </div>
      )}

      {matrixOpen && (
        <div className="border-b border-border-subtle bg-bg-panel px-4 py-3">
          <MatrixEditor
            value={matrix}
            onChange={(next) => {
              setMatrix(next);
              setDirty(true);
            }}
          />
          <label
            className="mt-3 inline-flex items-center gap-2 text-[11px] text-text-secondary"
            title="When on, child cells skip their notify steps; the parent build emits one rolled-up notification when all cells finish."
          >
            <input
              type="checkbox"
              checked={watch.matrixSummary !== false}
              onChange={(e) => {
                setWatch({ ...watch, matrixSummary: e.target.checked });
                setDirty(true);
              }}
              className="h-3 w-3"
            />
            Rolled-up notifications (single message per matrix instead of one per cell)
          </label>
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
          {/* Responsive overhaul follow-up — read-only banner on phones.
              The Palette + StepPropertyPanel + BulkEditPanel are all
              `hidden md:flex` because their interactions (drag-and-drop,
              per-field sliders) need a desktop pointer. Surface that
              limitation explicitly so phone users don't conclude the
              feature is broken when tapping a node selects it but
              produces no edit affordance. */}
          {isMobile && (
            <div
              role="note"
              className="absolute left-2 right-2 top-2 z-30 rounded-md border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-200 shadow-md backdrop-blur md:hidden"
            >
              Read-only on phones — open on a tablet or desktop to drag steps and edit their properties.
            </div>
          )}
          {/* UI v2 Faz 5.A.4 — validation overlay. Floats top-left so it
              doesn't clash with the find dialog (top-right) or the canvas
              controls (bottom-right). */}
          {validationIssues.length > 0 && (
            <div className="absolute left-3 top-3 z-30">
              {validationOpen ? (
                <div className="w-72 rounded-card border border-status-warn/40 bg-bg-panel/95 shadow-xl backdrop-blur">
                  <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-status-warn">
                      {validationIssues.length} issue{validationIssues.length === 1 ? '' : 's'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setValidationOpen(false)}
                      className="rounded p-0.5 text-text-muted hover:text-text-primary"
                      aria-label="Close validation panel"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <ul className="max-h-64 overflow-y-auto p-2 space-y-1">
                    {validationIssues.map((iss, idx) => (
                      <li key={`${iss.kind}-${iss.nodeId}-${idx}`}>
                        <button
                          type="button"
                          onClick={() => focusOnNode(iss.nodeId)}
                          className="w-full text-left rounded px-2 py-1 text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
                        >
                          <span
                            className={cn(
                              'inline-block w-1.5 h-1.5 rounded-full mr-2',
                              iss.kind === 'cycle' ? 'bg-status-failed' : 'bg-status-warn',
                            )}
                            aria-hidden
                          />
                          <span className="font-medium">
                            {iss.kind === 'cycle' ? 'Cycle' : 'Orphan'}
                          </span>
                          <span className="ml-1 text-text-muted">{iss.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setValidationOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-status-warn/40 bg-bg-panel/95 px-2.5 h-7 text-[11px] font-medium text-status-warn shadow-md backdrop-blur hover:border-status-warn transition-colors"
                  title="Pipeline validation issues — click to inspect"
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-warn animate-pulse-dot" aria-hidden />
                  {validationIssues.length} issue{validationIssues.length === 1 ? '' : 's'}
                </button>
              )}
            </div>
          )}
          {findOpen && (
            <div className="absolute right-3 top-3 z-30 w-80 rounded-md border border-border-subtle bg-bg-panel/95 p-2 shadow-xl backdrop-blur">
              <div className="flex items-center gap-2">
                <Search size={12} className="text-text-muted" />
                <input
                  autoFocus
                  type="text"
                  value={findQuery}
                  onChange={(e) => {
                    setFindQuery(e.target.value);
                    setFindIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusMatch(findIndex + (e.shiftKey ? -1 : 1));
                    } else if (e.key === 'Escape') {
                      setFindOpen(false);
                    }
                  }}
                  placeholder="Find in node ids, types, field values…"
                  className="flex-1 rounded border border-border-subtle bg-bg-base px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none"
                />
                <span className="font-mono text-[10px] text-text-muted">
                  {findMatches.length === 0
                    ? '0/0'
                    : `${(findIndex % findMatches.length) + 1}/${findMatches.length}`}
                </span>
                <button
                  type="button"
                  onClick={() => setFindOpen(false)}
                  className="focusable rounded p-0.5 text-text-muted hover:text-text-secondary"
                  title="Close"
                  aria-label="Close find/replace"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="text"
                  value={replaceQuery}
                  onChange={(e) => setReplaceQuery(e.target.value)}
                  placeholder="Replace with…"
                  className="flex-1 rounded border border-border-subtle bg-bg-base px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={replaceCurrent}
                  disabled={findMatches.length === 0 || findQuery === ''}
                  className="rounded border border-border-subtle px-2 py-1 text-[11px] text-text-primary hover:border-accent disabled:opacity-40"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={replaceAll}
                  disabled={findMatches.length === 0 || findQuery === ''}
                  className="rounded border border-border-subtle px-2 py-1 text-[11px] text-text-primary hover:border-accent disabled:opacity-40"
                >
                  All
                </button>
              </div>
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={decoratedEdges}
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
                className="pointer-events-none fixed z-50 rounded-md border border-border-subtle bg-bg-panel px-2 py-1 text-[11px] text-text-primary shadow-lg"
                style={{ left: edgeTooltip.x + 12, top: edgeTooltip.y + 12 }}
              >
                {edgeTooltip.text}
                <div className="text-[9px] text-text-muted">click to cycle</div>
              </div>
            )}
            {effectiveShowMinimap && (
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
          selectedNodes={selectedNodes}
          branches={branches}
          entries={latestEntries}
          onChange={updateNodeData}
          onBulkChange={bulkChange}
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

// UI v2 Faz 5.A.3 — Recipes. Pre-built step chains the user can drop in
// as a starting point. Each entry produces N nodes + N-1 edges via the
// existing dropPayload path so the editor handles them like any other
// drag-drop. Keep the list short — these are quick-starts, not a
// full template gallery.
interface Recipe {
  id: string;
  name: string;
  description: string;
  steps: ReadonlyArray<StepType>;
}
const RECIPES: ReadonlyArray<Recipe> = [
  {
    id: 'git-build-notify',
    name: 'Git → Shell → Notify',
    description: 'Checkout, run a shell command, ping Slack on outcome.',
    steps: ['checkout', 'shell', 'slackNotify'],
  },
  {
    id: 'ios-test-flight',
    name: 'iOS → TestFlight',
    description: 'Checkout → xcodebuild archive → TestFlight upload.',
    steps: ['checkout', 'xcodebuild', 'testflightUpload'],
  },
  {
    id: 'ios-quality-gate',
    name: 'iOS quality gate',
    description: 'SwiftLint + xcodebuild analyze + coverage gate.',
    steps: ['checkout', 'swiftlint', 'xcodebuildAnalyze', 'slatherCoverage', 'xcovGate'],
  },
  {
    id: 'http-webhook-fan-out',
    name: 'Webhook fan-out',
    description: 'POST one HTTP call, then notify two channels.',
    steps: ['httpRequest', 'slackNotify', 'discordNotify'],
  },
];

// UI v2 Faz 5.A — palette "Recently used" tracking. Stored as a string[]
// of step types, MRU at index 0, capped at 6 entries.
const RECENTLY_USED_KEY = 'buildpilot.pipeline.palette.recentlyUsed';
const RECENTLY_USED_LIMIT = 6;
function readRecentlyUsed(): StepType[] {
  try {
    const raw = localStorage.getItem(RECENTLY_USED_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((v): v is string => typeof v === 'string')
      .filter((v): v is StepType => v in STEP_DEFINITIONS)
      .slice(0, RECENTLY_USED_LIMIT);
  } catch {
    return [];
  }
}
export function trackPaletteUse(type: StepType): void {
  try {
    const current = readRecentlyUsed().filter((t) => t !== type);
    const next = [type, ...current].slice(0, RECENTLY_USED_LIMIT);
    localStorage.setItem(RECENTLY_USED_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('buildpilot:palette-recently-used'));
  } catch {
    /* ignore */
  }
}

// UI v2 Faz 5.B.3 — Triggers panel tab button. Configured dot signals
// the underlying field has a value so users see at-a-glance which knobs
// have been touched.
function TriggerTabBtn({
  active,
  configured,
  onClick,
  children,
}: {
  active: boolean;
  configured: boolean;
  onClick(): void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'relative px-3 h-8 text-[12px] font-medium transition-colors inline-flex items-center gap-1.5',
        active
          ? 'text-text-primary'
          : 'text-text-muted hover:text-text-secondary',
      )}
    >
      {children}
      {configured && !active && (
        <span className="inline-block w-1 h-1 rounded-full bg-accent" aria-hidden />
      )}
      {active && (
        <span className="absolute inset-x-2 bottom-0 h-[2px] bg-accent rounded-t-sm" aria-hidden />
      )}
    </button>
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
  // Recently used types — refreshed on a custom event fired by
  // PaletteItem.onDragStart so multi-palette views stay in sync.
  const [recentlyUsed, setRecentlyUsed] = useState<StepType[]>(() => readRecentlyUsed());
  // UI v2 Faz 8.6 — Catalog → Pipeline handoff. When the user clicks
  // "Insert into pipeline" on the catalog detail panel, the step type
  // lands in sessionStorage; on mount we read it and pre-fill the search
  // so the step is immediately findable.
  const [pendingInsert, setPendingInsert] = useState<StepType | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('buildpilot.catalog.pendingInsert');
      if (!raw) return;
      sessionStorage.removeItem('buildpilot.catalog.pendingInsert');
      if (raw in STEP_DEFINITIONS) {
        setPendingInsert(raw as StepType);
        setQuery(STEP_DEFINITIONS[raw as StepType].label);
        // Clear the highlight after 4s so it stops competing for attention.
        const timeout = setTimeout(() => setPendingInsert(null), 4000);
        return () => clearTimeout(timeout);
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    const onChange = () => setRecentlyUsed(readRecentlyUsed());
    window.addEventListener('buildpilot:palette-recently-used', onChange);
    return () => window.removeEventListener('buildpilot:palette-recently-used', onChange);
  }, []);

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
    // Responsive overhaul Faz 4 — hide the drag-source palette on
    // phones. Drag-and-drop node creation isn't usable from a touch
    // viewport anyway, and the 224px sidebar otherwise leaves <100px
    // for the canvas on a 320px screen. md+ keeps the original layout.
    <div className="scrollbar-thin hidden w-56 shrink-0 flex-col gap-2 overflow-y-auto border-r border-border-subtle bg-bg-panel p-2.5 md:flex">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search nodes…"
        className="w-full rounded-btn border border-border-subtle bg-bg-base px-2 py-1.5 text-[12px] text-text-primary placeholder:text-text-faint focus:border-accent focus:ring-2 focus:ring-accent-soft focus:outline-none transition-colors"
      />

      {/* UI v2 Faz 5.A.3 — Recipes: drop a preset chain in one drag. Each
          recipe shows its step types as a 3-dot icon row so users can see
          the shape before they drop. Hidden during search since recipes
          aren't searchable. */}
      {q === '' && (
        <div className="flex flex-col gap-1 pt-1">
          <div className="px-1 text-[9px] font-semibold uppercase tracking-wider text-text-muted">
            Recipes
          </div>
          {RECIPES.map((recipe) => (
            <RecipeItem key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}

      {/* Recently used — last 6 dragged types, persisted to localStorage.
          Hidden while searching since the search hit-list is more useful. */}
      {q === '' && recentlyUsed.length > 0 && (
        <div className="flex flex-col gap-1 pt-1">
          <div className="px-1 text-[9px] font-semibold uppercase tracking-wider text-text-muted">
            Recently used
          </div>
          {recentlyUsed.map((type) => {
            const def = STEP_DEFINITIONS[type];
            if (!def) return null;
            return <PaletteItem key={`recent-${type}`} type={type} def={def} />;
          })}
        </div>
      )}

      {STEP_CATEGORIES.map((group) => {
        const items = group.types
          .map((type) => ({ type, def: STEP_DEFINITIONS[type] }))
          .filter(({ def }) => matches(def.label, def.description));
        if (items.length === 0) return null;
        // While searching, force-expand groups so matches are always visible.
        const isOpen = q !== '' || !collapsed.has(group.key);
        return (
          <div key={group.key} className="flex flex-col gap-1 pt-1">
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              className="flex items-center gap-1 rounded px-1 py-0.5 text-left text-[9px] font-semibold uppercase tracking-wider text-text-muted hover:text-text-primary"
            >
              {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <span className="flex-1 truncate">{group.label}</span>
              <span className="font-mono text-text-faint">{items.length}</span>
            </button>
            {isOpen &&
              items.map(({ type, def }) => (
                <PaletteItem
                  key={type}
                  type={type}
                  def={def}
                  highlight={pendingInsert === type}
                />
              ))}
          </div>
        );
      })}

      {filteredTemplates.length > 0 && (
        <div className="flex flex-col gap-1 pt-2 mt-1 border-t border-border-subtle">
          <div className="px-1 text-[9px] font-semibold uppercase tracking-wider text-text-muted">
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
                className="group relative touch-target cursor-grab rounded-btn border border-dashed bg-bg-elevated px-2.5 py-1.5 text-[12px] text-text-primary hover:border-border transition-colors"
                style={{ borderColor: def.color }}
                title={t.description ?? `${def.label} preset`}
              >
                <div className="truncate">{t.name}</div>
                <div className="text-[9px] uppercase tracking-wider text-text-muted">
                  {def.label}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTemplate(t);
                  }}
                  className="touch-target absolute right-1 top-1 rounded p-0.5 text-text-muted opacity-0 hover:text-rose-300 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
                  title="Delete this template"
                  aria-label={`Delete template ${t.name}`}
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

// UI v2 Faz 5.A.3 — recipe palette tile. Carries a dragstart payload on a
// dedicated mime type so the canvas's onDrop handler can branch on it.
function RecipeItem({ recipe }: { recipe: Recipe }): JSX.Element {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/buildpilot-recipe', recipe.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="group cursor-grab rounded-btn border border-border-subtle bg-bg-elevated px-2.5 py-1.5 hover:border-border transition-colors"
      title={recipe.description}
    >
      <div className="text-[12px] font-medium text-text-primary truncate">
        {recipe.name}
      </div>
      <div className="mt-1 flex items-center gap-0.5">
        {recipe.steps.map((stepType, i) => {
          const def = STEP_DEFINITIONS[stepType];
          if (!def) return null;
          return (
            <span key={`${stepType}-${i}`} className="inline-flex items-center">
              <span
                className="block w-1.5 h-1.5 rounded-sm shrink-0"
                style={{ backgroundColor: def.color }}
                aria-hidden
              />
              {i < recipe.steps.length - 1 && (
                <span className="block w-1.5 h-px bg-border-subtle" aria-hidden />
              )}
            </span>
          );
        })}
        <span className="ml-1.5 text-[10px] text-text-faint">
          {recipe.steps.length} step{recipe.steps.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}

function PaletteItem({
  type,
  def,
  highlight = false,
}: {
  type: StepType;
  def: (typeof STEP_DEFINITIONS)[StepType];
  highlight?: boolean;
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
          // UI v2 Faz 5.A — feed the "Recently used" rail when the user
          // actually grabs a tile (not on hover) so the list reflects real
          // intent.
          trackPaletteUse(type);
        }}
        // touch-target so palette tiles stay comfortably tappable on touch
        // devices — drag-from-palette still works because we listen for
        // dragstart, not pointerdown.
        className={cn(
          'touch-target cursor-grab rounded-btn border bg-bg-elevated px-2.5 py-1.5 text-[12px] text-text-primary hover:border-border transition-colors',
          // UI v2 Faz 8.6 — soft accent halo when this tile is the
          // pending insert from the catalog. Drops automatically after
          // a few seconds so it stops competing for attention.
          highlight && 'ring-2 ring-accent/60 ring-offset-2 ring-offset-bg-panel',
        )}
        style={{ borderColor: def.color }}
      >
        {def.label}
      </div>
      {hover && (
        <div className="pointer-events-none absolute left-full top-0 z-50 ml-2 w-72 rounded-card border border-border bg-bg-panel p-3 text-[11px] text-text-primary shadow-xl">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: def.color }}
            />
            <span className="font-semibold text-text-primary">{def.label}</span>
          </div>
          <p className="mt-1 text-[10.5px] text-text-muted">{def.description}</p>
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
                  <li className="text-text-muted">+{required.length - 8} more…</li>
                )}
              </ul>
            </div>
          )}
          {optional.length > 0 && (
            <div className="mt-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                Optional ({optional.length})
              </div>
              <ul className="mt-0.5 space-y-0.5 text-text-muted">
                {optional.slice(0, 6).map((f) => (
                  <li key={f.name} className="truncate">
                    · {f.label}
                  </li>
                ))}
                {optional.length > 6 && (
                  <li className="text-text-muted">+{optional.length - 6} more…</li>
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
        clientVersionFile: 'ProjectSettings/ProjectSettings.asset',
        clientVersionPattern: 'bundleVersion:\\s*(.+)',
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
