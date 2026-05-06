import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Apple,
  ArrowDownToLine,
  GitBranch,
  Gamepad2,
  Globe,
  MessageCircle,
  MessageSquare,
  Package,
  Server,
  Sparkles,
  Terminal,
  type LucideIcon,
} from 'lucide-react';
import type { StepType } from '@buildpilot/shared-types';
import { STEP_DEFINITIONS } from '@buildpilot/step-registry';

const ICONS: Record<string, LucideIcon> = {
  GitBranch,
  ArrowDownToLine,
  Terminal,
  Gamepad2,
  Globe,
  MessageSquare,
  MessageCircle,
  Sparkles,
  Package,
  Server,
  Apple,
};

type RuntimeStatus = 'running' | 'success' | 'failed' | 'skipped' | undefined;

interface StepNodeData {
  runtimeStatus?: RuntimeStatus;
  runtimeStartedAt?: number;
  runtimeFinishedAt?: number;
  [key: string]: unknown;
}

export function StepNode({ type, data, selected }: NodeProps) {
  const def = STEP_DEFINITIONS[type as StepType];
  if (!def) return null;
  const Icon = ICONS[def.icon] ?? Terminal;

  const d = data as StepNodeData;
  const status = d.runtimeStatus;
  const runtime = runtimeAppearance(status);
  const duration = formatDuration(d.runtimeStartedAt, d.runtimeFinishedAt, status);

  // Try to surface a one-line summary of the configured data.
  const summary = summariseData(type as StepType, data as Record<string, unknown>);

  const borderColor = selected ? '#38bdf8' : runtime.borderColor ?? def.color;
  const baseRing = selected ? '0 0 0 2px rgba(56,189,248,0.25)' : undefined;
  const boxShadow = runtime.boxShadow ?? baseRing;

  return (
    <div
      className={`rounded-md border bg-slate-900 px-3 py-2 shadow-md transition-shadow ${runtime.className}`}
      style={{ borderColor, boxShadow, minWidth: 180 }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <span
          className="relative inline-flex h-6 w-6 items-center justify-center rounded-md"
          style={{ backgroundColor: `${def.color}20`, color: def.color }}
        >
          <Icon size={13} />
          {status === 'running' && (
            <span className="absolute inset-0 animate-ping rounded-md ring-2 ring-amber-400/50" />
          )}
        </span>
        <span className="text-[13px] font-medium text-slate-100">{def.label}</span>
        {status && (
          <span
            className={`ml-auto rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${runtime.badgeClass}`}
          >
            {status}
          </span>
        )}
      </div>
      {summary && (
        <div className="mt-1 truncate text-[11px] text-slate-400" title={summary}>
          {summary}
        </div>
      )}
      {duration && (
        <div className="mt-0.5 text-right font-mono text-[10px] text-slate-500">{duration}</div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function formatDuration(
  startedAt: number | undefined,
  finishedAt: number | undefined,
  status: RuntimeStatus,
): string | null {
  if (!startedAt) return null;
  const end = finishedAt ?? (status === 'running' ? Date.now() : startedAt);
  const ms = Math.max(0, end - startedAt);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function runtimeAppearance(status: RuntimeStatus): {
  className: string;
  borderColor?: string;
  boxShadow?: string;
  badgeClass: string;
} {
  switch (status) {
    case 'running':
      return {
        className: 'animate-pulse',
        borderColor: '#fbbf24',
        boxShadow: '0 0 0 2px rgba(251,191,36,0.35), 0 0 24px rgba(251,191,36,0.55)',
        badgeClass: 'bg-amber-500/20 text-amber-300',
      };
    case 'success':
      return {
        className: '',
        borderColor: '#34d399',
        boxShadow: '0 0 0 2px rgba(52,211,153,0.25)',
        badgeClass: 'bg-emerald-500/15 text-emerald-300',
      };
    case 'failed':
      return {
        className: '',
        borderColor: '#fb7185',
        boxShadow: '0 0 0 2px rgba(251,113,133,0.30), 0 0 18px rgba(251,113,133,0.40)',
        badgeClass: 'bg-rose-500/20 text-rose-300',
      };
    case 'skipped':
      return {
        className: 'opacity-60',
        borderColor: '#475569',
        boxShadow: undefined,
        badgeClass: 'bg-slate-700/40 text-slate-400',
      };
    default:
      return { className: '', badgeClass: '' };
  }
}

function summariseData(type: StepType, data: Record<string, unknown>): string {
  switch (type) {
    case 'checkout':
      return data.branch ? String(data.branch) : '';
    case 'pull':
      return data.remote ? String(data.remote) : 'origin';
    case 'shell':
      return data.command ? String(data.command).split('\n')[0]!.slice(0, 60) : '';
    case 'unityBatch':
      return data.executeMethod
        ? `${data.buildTarget ?? '?'} → ${data.executeMethod}`
        : '';
    case 'httpRequest':
      return data.url ? `${(data.method as string) ?? 'GET'} ${data.url}` : '';
    case 'slackNotify':
    case 'discordNotify':
      return data.webhookUrl ? '→ webhook' : '';
    case 'aiPrompt':
      return data.tool
        ? `${data.tool}: ${String(data.prompt ?? '').split('\n')[0]!.slice(0, 60)}`
        : '';
    case 'artifact':
      return data.paths
        ? `${String(data.paths).split('\n').filter((l) => l.trim().length > 0).length} path(s)`
        : '';
    case 'remoteSsh':
      return data.host ? `${data.host} → ${String(data.command ?? '').split('\n')[0]!.slice(0, 40)}` : '';
    case 'xcodebuild':
      return data.scheme ? `${data.buildAction ?? 'build'} ${data.scheme}` : '';
    default:
      return '';
  }
}
