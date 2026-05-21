import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Pipeline, PipelineEdge, PipelineNode } from '@buildpilot/shared-types';
import { useStore } from '../store/store';
import { api } from '../lib/api';
import { BranchSelect } from './BranchSelect';

interface Props {
  open: boolean;
  projectId: string;
  defaultBranch: string;
  onClose(): void;
  onCreated(p: Pipeline): void;
}

export function CreatePipelineDialog({ open, projectId, defaultBranch, onClose, onCreated }: Props) {
  const upsertPipeline = useStore((s) => s.upsertPipeline);
  const [name, setName] = useState('Dedicated Server');
  const [branch, setBranch] = useState(defaultBranch);
  const [intervalSec, setIntervalSec] = useState(60);
  const [includeUnity, setIncludeUnity] = useState(true);
  const [branches, setBranches] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    api
      .branches(projectId)
      .then((bs) => {
        if (alive) setBranches(bs);
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [open, projectId]);

  useEffect(() => {
    if (open) setBranch(defaultBranch);
  }, [open, defaultBranch]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { nodes, edges } = starterGraph(branch, includeUnity);
      const created = await api.createPipeline({
        projectId,
        name,
        watch: { branch, intervalSec, autoTrigger: 'ask' },
        nodes,
        edges,
        matrix: null,
      });
      upsertPipeline(created);
      onCreated(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/60 backdrop-blur-sm p-3 sm:p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        // Responsive overhaul Faz 2 — phone-width fluid, snaps to 460px sm+.
        className="w-full max-h-[calc(100dvh-24px)] overflow-y-auto sm:w-[460px] rounded-lg border border-border-subtle bg-bg-panel p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">New pipeline</h2>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-text-muted">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary"
          />
        </label>

        <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-text-muted">
              Watch branch
            </span>
            <BranchSelect
              value={branch}
              onChange={setBranch}
              branches={branches}
              required
              className="w-full [&>select]:w-full [&>select]:px-3 [&>select]:py-2 [&>select]:text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-text-muted">
              Poll interval (s)
            </span>
            <input
              type="number"
              min={5}
              value={intervalSec}
              onChange={(e) => setIntervalSec(Math.max(5, Number(e.target.value)))}
              className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary"
            />
          </label>
        </div>

        <label className="mb-4 flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={includeUnity}
            onChange={(e) => setIncludeUnity(e.target.checked)}
            className="rounded border-border-subtle bg-bg-base"
          />
          Seed graph with checkout → pull → unity batch (you can edit later)
        </label>

        {error && (
          <div className="mb-3 rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim() || !branch.trim()}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-bg-elevated"
          >
            {busy ? 'Creating…' : 'Create pipeline'}
          </button>
        </div>
      </form>
    </div>
  );
}

function starterGraph(
  branch: string,
  includeUnity: boolean,
): { nodes: PipelineNode[]; edges: PipelineEdge[] } {
  const checkout: PipelineNode = {
    id: 'n_checkout',
    type: 'checkout',
    position: { x: 0, y: 0 },
    data: { branch },
  };
  const pull: PipelineNode = {
    id: 'n_pull',
    type: 'pull',
    position: { x: 240, y: 0 },
    data: { remote: 'origin' },
  };

  const nodes: PipelineNode[] = [checkout, pull];
  const edges: PipelineEdge[] = [
    { id: 'e_checkout_pull', source: checkout.id, target: pull.id, condition: 'success' },
  ];

  if (includeUnity) {
    const unity: PipelineNode = {
      id: 'n_unity',
      type: 'unityBatch',
      position: { x: 480, y: 0 },
      data: {
        unityPath: '',
        buildTarget: 'StandaloneLinux64',
        executeMethod: '',
        extraArgs: '',
        logPath: '',
      },
    };
    nodes.push(unity);
    edges.push({ id: 'e_pull_unity', source: pull.id, target: unity.id, condition: 'success' });
  }

  return { nodes, edges };
}
