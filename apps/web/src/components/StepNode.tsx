import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  ArrowDownToLine,
  GitBranch,
  Gamepad2,
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
};

export function StepNode({ type, data, selected }: NodeProps) {
  const def = STEP_DEFINITIONS[type as StepType];
  if (!def) return null;
  const Icon = ICONS[def.icon] ?? Terminal;

  // Try to surface a one-line summary of the configured data.
  const summary = summariseData(type as StepType, data as Record<string, unknown>);

  return (
    <div
      className="rounded-md border bg-slate-900 px-3 py-2 shadow-md transition-shadow"
      style={{
        borderColor: selected ? '#38bdf8' : def.color,
        boxShadow: selected ? '0 0 0 2px rgba(56,189,248,0.25)' : undefined,
        minWidth: 180,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-md"
          style={{ backgroundColor: `${def.color}20`, color: def.color }}
        >
          <Icon size={13} />
        </span>
        <span className="text-[13px] font-medium text-slate-100">{def.label}</span>
      </div>
      {summary && (
        <div className="mt-1 truncate text-[11px] text-slate-400" title={summary}>
          {summary}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
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
    default:
      return '';
  }
}
