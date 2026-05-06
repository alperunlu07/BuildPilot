import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
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
import { Hammer, Save, Square, Trash2 } from 'lucide-react';
import type {
  NodeTemplate,
  Pipeline,
  PipelineEdge,
  PipelineNode,
  PipelineWatch,
  StepType,
} from '@buildpilot/shared-types';
import { STEP_DEFINITIONS, STEP_TYPES } from '@buildpilot/step-registry';
import { api } from '../lib/api';
import { useStore } from '../store/store';
import { BranchSelect } from './BranchSelect';
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
  const [name, setName] = useState(pipeline.name);
  const [watch, setWatch] = useState<PipelineWatch>(pipeline.watch);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  // Save-as-template dialog state. Holds the source node id whose data we
  // will snapshot when the user confirms.
  const [saveTemplateNodeId, setSaveTemplateNodeId] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Reset when the underlying pipeline changes (user navigated).
  useEffect(() => {
    setNodes(pipelineNodesToReactFlow(pipeline.nodes));
    setEdges(pipelineEdgesToReactFlow(pipeline.edges));
    setName(pipeline.name);
    setWatch(pipeline.watch);
    setDirty(false);
    setSelectedNodeId(null);
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
      setNodes((nds) => applyNodeChanges(changes, nds));
      if (changes.some((c) => c.type === 'position' || c.type === 'remove')) setDirty(true);
    },
    [],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
      if (changes.length > 0) setDirty(true);
    },
    [],
  );

  const onConnect = useCallback((connection: Connection) => {
    const newEdge: Edge = pipelineEdgeToReactFlow({
      id: `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      source: connection.source!,
      target: connection.target!,
      condition: 'success',
    });
    setEdges((eds) => addEdge(newEdge, eds));
    setDirty(true);
  }, []);

  const handleSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node[]; edges: Edge[] }) => {
      setSelectedNodeId(selected[0]?.id ?? null);
    },
    [],
  );

  const updateNodeData = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data } : n)));
    setDirty(true);
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId(null);
    setDirty(true);
  }, []);

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
    [screenToFlowPosition, nodeTemplates],
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
        </div>

        <div className="flex items-center gap-2">
          {dirty && <span className="text-[11px] text-amber-400">unsaved</span>}
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
            onEdgeClick={(_e, edge) => {
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
          </ReactFlow>
        </div>

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
  return (
    <div className="scrollbar-thin flex w-44 shrink-0 flex-col gap-2 overflow-y-auto border-r border-slate-800 bg-slate-950 p-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">Drag to canvas</div>
      {STEP_TYPES.map((type) => {
        const def = STEP_DEFINITIONS[type];
        return (
          <div
            key={type}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/buildpilot-step', type);
              e.dataTransfer.effectAllowed = 'move';
            }}
            className="cursor-grab rounded-md border bg-slate-900 px-2.5 py-1.5 text-[12px] text-slate-200 hover:border-slate-500"
            style={{ borderColor: def.color }}
            title={def.description}
          >
            {def.label}
          </div>
        );
      })}

      {templates.length > 0 && (
        <>
          <div className="mt-2 text-[11px] uppercase tracking-wider text-slate-500">
            Custom templates
          </div>
          {templates.map((t) => {
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
        </>
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
  }
}

function pipelineNodesToReactFlow(nodes: PipelineNode[]): Node[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
  }));
}

const EDGE_STYLE: Record<'success' | 'failure' | 'always', { stroke: string; label: string }> = {
  success: { stroke: '#10b981', label: '' },
  failure: { stroke: '#fb7185', label: 'on failure' },
  always:  { stroke: '#94a3b8', label: 'always' },
};

function pipelineEdgeToReactFlow(e: PipelineEdge): Edge {
  const cond = e.condition ?? 'success';
  const style = EDGE_STYLE[cond];
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    animated: true,
    label: style.label || undefined,
    labelStyle: { fill: style.stroke, fontSize: 10, fontWeight: 600 },
    labelBgStyle: { fill: '#0f172a' },
    labelBgPadding: [4, 2],
    style: { stroke: style.stroke, strokeWidth: 1.5 },
    data: { condition: cond },
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
