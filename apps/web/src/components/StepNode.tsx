import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { useCallback } from 'react';
import {
  AlertCircle,
  Apple,
  ArrowDownToLine,
  BadgeCheck,
  Ban,
  Box,
  Boxes,
  Bug,
  AlignLeft,
  Camera,
  Check,
  CloudUpload,
  CodeXml,
  FileCog,
  Frame,
  Gauge,
  GitBranch,
  Loader2,
  Microscope,
  PenTool,
  Percent,
  GitMerge,
  Gamepad2,
  Globe,
  Hash,
  KeyRound,
  ListChecks,
  MessageCircle,
  MessageSquare,
  Package,
  PlaneTakeoff,
  Plus,
  ScrollText,
  Search,
  Send,
  Server,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Stamp,
  Terminal,
  Upload,
  Wand2,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { StepType } from '@buildpilot/shared-types';
import { STEP_DEFINITIONS } from '@buildpilot/step-registry';

const ICONS: Record<string, LucideIcon> = {
  GitBranch,
  GitMerge,
  ArrowDownToLine,
  Terminal,
  Gamepad2,
  Globe,
  MessageSquare,
  MessageCircle,
  Sparkles,
  Package,
  Send,
  Server,
  Apple,
  CloudUpload,
  Upload,
  PlaneTakeoff,
  KeyRound,
  BadgeCheck,
  ShieldAlert,
  ShieldCheck,
  Stamp,
  Wand2,
  Wrench,
  Box,
  Boxes,
  Bug,
  ListChecks,
  Plus,
  Hash,
  ScrollText,
  FileCog,
  CodeXml,
  AlignLeft,
  Microscope,
  Search,
  Percent,
  Gauge,
  PenTool,
  Camera,
  Frame,
};

type RuntimeStatus = 'running' | 'success' | 'failed' | 'skipped' | undefined;

interface StepNodeData {
  runtimeStatus?: RuntimeStatus;
  runtimeStartedAt?: number;
  runtimeFinishedAt?: number;
  // Optional friendly name when the node was spawned from a saved template.
  // Falls back to the step type's built-in label.
  templateLabel?: string;
  // TODO(engine): when true, the engine should treat this step as a no-op
  // (skip execution and propagate a 'skipped' status to downstream edges).
  // Until then this flag is UI-only and visually grays the node.
  disabled?: boolean | string;
  [key: string]: unknown;
}

export function StepNode({ id, type, data, selected }: NodeProps) {
  const def = STEP_DEFINITIONS[type as StepType];
  const { setNodes } = useReactFlow();

  // Cluster 10.F · keyboard navigation. tabIndex=0 makes the node a tab
  // stop so screen-reader / keyboard users can iterate through the graph
  // without touching the canvas pan/zoom shortcuts. Enter / Space toggles
  // selection — once selected, the existing StepPropertyPanel pops out
  // on the right.
  //
  // Tradeoff: react-flow installs its own keydown handlers on the canvas
  // for Delete / Backspace / arrows. We don't preventDefault on those so
  // they continue to bubble; we only swallow Enter / Space because those
  // would otherwise scroll the surrounding container.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      setNodes((nds) =>
        nds.map((n) => ({ ...n, selected: n.id === id ? true : false })),
      );
    },
    [id, setNodes],
  );

  if (!def) return null;
  const Icon = ICONS[def.icon] ?? Terminal;

  const d = data as StepNodeData;
  const disabled = d.disabled === true || d.disabled === 'true';
  const status = d.runtimeStatus;
  const runtime = runtimeAppearance(status);
  const duration = formatDuration(d.runtimeStartedAt, d.runtimeFinishedAt, status);
  const missing = collectMissingRequired(type as StepType, data as Record<string, unknown>);

  // Try to surface a one-line summary of the configured data.
  const summary = summariseData(type as StepType, data as Record<string, unknown>);

  const borderColor = selected ? '#38bdf8' : runtime.borderColor ?? def.color;
  const baseRing = selected ? '0 0 0 2px rgba(56,189,248,0.25)' : undefined;
  const boxShadow = runtime.boxShadow ?? baseRing;

  return (
    <div
      className={`rounded-md border bg-slate-900 px-3 py-2 shadow-md transition-shadow ${runtime.className} ${disabled ? 'opacity-50 [filter:grayscale(0.7)]' : ''}`}
      style={{
        borderColor,
        boxShadow,
        minWidth: 180,
        borderStyle: disabled ? 'dashed' : 'solid',
      }}
      tabIndex={0}
      role="button"
      aria-label={`${d.templateLabel || def.label}${status ? `, ${status}` : ''}${disabled ? ', skipped' : ''}`}
      aria-pressed={selected}
      onKeyDown={onKeyDown}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <span
          className="relative inline-flex h-6 w-6 items-center justify-center rounded-md"
          style={{ backgroundColor: `${def.color}20`, color: def.color }}
        >
          <Icon size={13} />
          {status === 'running' && (
            // motion-safe so reduced-motion users don't get the ping pulse
            <span className="absolute inset-0 motion-safe:animate-ping rounded-md ring-2 ring-amber-400/50" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium text-slate-100">
            {d.templateLabel || def.label}
          </span>
          {d.templateLabel && (
            <span className="truncate text-[9px] uppercase tracking-wider text-slate-500">
              {def.label}
            </span>
          )}
        </span>
        {disabled && (
          <span
            className="ml-auto inline-flex items-center gap-1 rounded bg-slate-700/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400"
            role="status"
            aria-label="Skipped"
          >
            <Ban size={9} aria-hidden="true" /> skipped
          </span>
        )}
        {status && !disabled && (
          <span
            className={`ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${runtime.badgeClass}`}
            role="status"
            aria-label={`Step ${status}`}
          >
            {status === 'running' && (
              <Loader2 size={9} className="motion-safe:animate-spin" aria-hidden="true" />
            )}
            {status === 'success' && <Check size={9} aria-hidden="true" />}
            {status === 'failed' && <X size={9} aria-hidden="true" />}
            {status === 'skipped' && <Ban size={9} aria-hidden="true" />}
            {status}
          </span>
        )}
        {missing.length > 0 && !status && !disabled && (
          <span
            className="ml-auto inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500/20 text-rose-300"
            title={`Missing required fields: ${missing.join(', ')}`}
          >
            <AlertCircle size={11} />
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

function collectMissingRequired(type: StepType, data: Record<string, unknown>): string[] {
  const def = STEP_DEFINITIONS[type];
  if (!def) return [];
  const out: string[] = [];
  for (const field of def.fields) {
    if (!field.required) continue;
    const v = data[field.name];
    const empty =
      v === undefined ||
      v === null ||
      (typeof v === 'string' && v.trim().length === 0);
    if (empty) out.push(field.label);
  }
  return out;
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
    case 'telegramNotify':
      return `chat ${data.chatId || '(default)'}`;
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
    case 'gitMerge':
      return data.sourceBranch ? `merge ${data.sourceBranch}${data.noFastForward === 'true' ? ' --no-ff' : ''}` : '';
    case 'sftpUpload':
      return data.host
        ? `${data.host} ← ${String(data.localPath ?? '')}`
        : '';
    case 's3Upload':
      return data.bucket && data.key
        ? `s3://${data.bucket}/${data.key}`
        : '';
    case 'testflightUpload':
      return data.ipaPath
        ? `${data.platform ?? 'ios'} ← ${String(data.ipaPath).split('/').pop()}`
        : '';
    case 'keychainUnlock':
      return data.keychain ? String(data.keychain) : 'login.keychain-db';
    case 'provisioningProfileInstall':
      return data.profilePath ? String(data.profilePath).split('/').pop() ?? '' : '';
    case 'notarize':
      return data.bundlePath
        ? `${(data.authMethod as string) ?? 'apiKey'}: ${String(data.bundlePath).split('/').pop()}`
        : '';
    case 'stapleNotarization':
      return data.bundlePath ? String(data.bundlePath).split('/').pop() ?? '' : '';
    case 'fastlaneMatch':
      return data.matchType
        ? `${data.matchType}${data.readonly === 'true' ? ' (readonly)' : ''}`
        : '';
    case 'cocoapodsInstall':
      return `${data.useBundleExec === 'true' ? 'bundle exec ' : ''}pod ${(data.command as string) ?? 'install'}${data.repoUpdate === 'true' ? ' --repo-update' : ''}`;
    case 'swiftPackageResolve':
      return data.workspacePath
        ? String(data.workspacePath)
        : data.projectPath
          ? String(data.projectPath)
          : '';
    case 'dsymUpload':
      return data.dsymPath
        ? `${(data.backend as string) ?? 'sentry'} ← ${String(data.dsymPath).split('/').pop()}`
        : '';
    case 'xcresultParse':
      return data.bundlePath ? String(data.bundlePath).split('/').pop() ?? '' : '';
    case 'xcodeSelect':
      return data.xcodePath ? String(data.xcodePath).split('/').pop() ?? '' : '';
    case 'ensureGitStatusClean':
      return data.cwd ? `clean? ${String(data.cwd)}` : 'git status --porcelain';
    case 'incrementBuildNumber': {
      const mode = (data.mode as string) || 'agvtool';
      if (mode === 'plistBuddy') {
        return data.versionString
          ? `plistBuddy → ${data.versionString}`
          : 'plistBuddy';
      }
      return data.versionString ? `agvtool → ${data.versionString}` : 'agvtool +1';
    }
    case 'getBuildNumber': {
      const mode = (data.mode as string) || 'agvtool';
      if (mode === 'plistBuddy') {
        return data.plistPath ? `plistBuddy ← ${String(data.plistPath).split('/').pop()}` : 'plistBuddy';
      }
      return 'agvtool what-version';
    }
    case 'changelogFromGitCommits': {
      if (!data.fromRef) return '';
      const to = data.toRef ? String(data.toRef) : 'HEAD';
      const fmt = (data.format as string) || 'subject';
      return `${data.fromRef}..${to} (${fmt})`;
    }
    case 'updateInfoPlist': {
      const op = (data.operation as string) || 'set';
      if (!data.key) return op;
      const path = data.plistPath ? String(data.plistPath).split('/').pop() : '';
      return path ? `${op} ${data.key} → ${path}` : `${op} ${data.key}`;
    }
    case 'swiftlint': {
      const mode = (data.mode as string) || 'lint';
      return data.strict === 'true' ? `${mode} --strict` : mode;
    }
    case 'swiftFormat': {
      const mode = (data.mode as string) || 'lint';
      return mode;
    }
    case 'xcodebuildAnalyze':
      return data.scheme ? `analyze ${data.scheme}` : '';
    case 'peripheryScan': {
      const fmt = (data.format as string) || 'xcode';
      return data.strict === 'true' ? `${fmt} --strict` : fmt;
    }
    case 'slatherCoverage':
      return data.projectPath
        ? `${(data.format as string) ?? 'html'} ← ${String(data.projectPath).split('/').pop()}`
        : '';
    case 'xcovGate': {
      const min = typeof data.minimumCoveragePercentage === 'number'
        ? data.minimumCoveragePercentage
        : 0;
      return min > 0 ? `≥ ${min}% (${data.scheme || 'no scheme'})` : `${data.scheme || 'no scheme'}`;
    }
    case 'resign':
      return data.ipaPath ? String(data.ipaPath).split('/').pop() ?? '' : '';
    case 'snapshot':
      return data.devices
        ? `${String(data.devices).split(',')[0]?.trim() ?? '?'}${String(data.devices).includes(',') ? ' +N' : ''}`
        : (data.scheme ? String(data.scheme) : '');
    case 'frameit': {
      const color = (data.colorFlag as string) || 'none';
      return color === 'none' ? '' : color;
    }
    default:
      return '';
  }
}
