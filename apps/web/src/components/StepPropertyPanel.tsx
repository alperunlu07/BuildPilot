import { useMemo, useState } from 'react';
import type { Node } from '@xyflow/react';
import type { BuildLogEntry, BuildLogLevel, SshHost, StepType } from '@buildpilot/shared-types';
import { STEP_DEFINITIONS, type StepFieldSchema } from '@buildpilot/step-registry';
import { BranchSelect } from './BranchSelect';
import { LogTable } from './LogTable';
import { LevelToggleBar, defaultActiveLevels } from './LevelToggleBar';
import { useStore } from '../store/store';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { SecretReferenceAutocomplete } from './SecretReferenceAutocomplete';

const EMPTY: BuildLogEntry[] = [];

// Cluster 11.I — step types that participate in the per-step notifyOn
// policy. Mirrored on the server side by the test-notify allow-list and
// (eventually) the engine-side filter that consults node.data.notifyOn.
const NOTIFY_STEP_TYPES = new Set<StepType>([
  'slackNotify',
  'discordNotify',
  'telegramNotify',
  'teamsNotify',
  'emailNotify',
  'httpRequest',
]);

type NotifyOn = 'always' | 'failure' | 'recovered';
const NOTIFY_OPTIONS: { value: NotifyOn; label: string; help: string }[] = [
  { value: 'always', label: 'Always', help: 'Fire on every build outcome.' },
  {
    value: 'failure',
    label: 'On failure only',
    help: 'Skip when the build succeeds.',
  },
  {
    value: 'recovered',
    label: 'On recovery',
    help: 'Only when this build succeeded and the previous build had failed.',
  },
];

interface Props {
  node: Node | null;
  // Full set of selected nodes; when > 1 the panel shows bulk-edit UI.
  selectedNodes?: Node[];
  branches: string[];
  // Live entries from the latest build for this pipeline (any nodeId).
  entries: BuildLogEntry[];
  onChange(nodeId: string, data: Record<string, unknown>): void;
  onBulkChange?(nodeIds: string[], patch: Record<string, unknown>): void;
  onDelete(nodeId: string): void;
  onRunFrom?(nodeId: string): void;
  onSaveAsTemplate?(nodeId: string): void;
}

type Tab = 'properties' | 'logs';

export function StepPropertyPanel({
  node,
  selectedNodes,
  branches,
  entries,
  onChange,
  onBulkChange,
  onDelete,
  onRunFrom,
  onSaveAsTemplate,
}: Props) {
  // All hooks must run unconditionally (React rules of hooks), so they live
  // above the null/missing-def early returns.
  const [tab, setTab] = useState<Tab>('properties');
  const [activeLevels, setActiveLevels] = useState<Set<BuildLogLevel>>(() => defaultActiveLevels());
  const hosts = useStore((s) => s.hosts);
  const nodeId = node?.id ?? null;
  const nodeEntries = useMemo(
    () =>
      nodeId
        ? entries.filter((e) => e.nodeId === nodeId && activeLevels.has(e.level))
        : EMPTY,
    [entries, nodeId, activeLevels],
  );

  const toggleLevel = (lvl: BuildLogLevel) => {
    setActiveLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl);
      else next.add(lvl);
      return next;
    });
  };

  if (!node) {
    return (
      <aside className="flex h-full w-80 shrink-0 flex-col border-l border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
        Select a node to edit its properties.
      </aside>
    );
  }

  if (selectedNodes && selectedNodes.length > 1 && onBulkChange) {
    return (
      <BulkEditPanel
        nodes={selectedNodes}
        hosts={hosts}
        onApply={(patch) => onBulkChange(selectedNodes.map((n) => n.id), patch)}
      />
    );
  }

  const stepType = node.type as StepType;
  const def = STEP_DEFINITIONS[stepType];
  if (!def) return null;

  const updateField = (name: string, value: string | number) => {
    onChange(node.id, { ...(node.data as Record<string, unknown>), [name]: value });
  };

  // Cluster 11.H — only steps that pick a host (iOS / SSH family) get the
  // "Requires capabilities" affordance. Detect via the field schema so any
  // new host-aware step type opts in automatically.
  const stepAcceptsHost = def.fields.some((f) => f.type === 'hostSelect');

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-slate-800 bg-slate-950">
      <div className="border-b border-slate-800 px-4 py-3">
        <div className="text-[11px] uppercase tracking-wider text-slate-400">
          Step properties
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-slate-100">{def.label}</h3>
          <div className="flex items-center gap-2">
            {onSaveAsTemplate && (
              <button
                type="button"
                onClick={() => onSaveAsTemplate(node.id)}
                className="focusable rounded text-[11px] text-sky-400 hover:text-sky-300"
                title="Save this node's configuration as a reusable palette entry"
              >
                Save as template
              </button>
            )}
            {onRunFrom && (
              <button
                type="button"
                onClick={() => onRunFrom(node.id)}
                className="focusable rounded text-[11px] text-emerald-400 hover:text-emerald-300"
                title="Trigger a build that runs this step and everything after it"
              >
                Run from here
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(node.id)}
              className="focusable rounded text-xs text-rose-400 hover:text-rose-300"
            >
              Delete
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-400">{def.description}</p>

        <div className="mt-3 flex gap-1 text-[11px] uppercase tracking-wider">
          <TabButton active={tab === 'properties'} onClick={() => setTab('properties')}>
            Properties
          </TabButton>
          <TabButton active={tab === 'logs'} onClick={() => setTab('logs')}>
            Logs
            {nodeEntries.length > 0 && (
              <span className="ml-1 rounded bg-slate-800 px-1 font-mono text-[10px] text-slate-300">
                {nodeEntries.length}
              </span>
            )}
          </TabButton>
        </div>
      </div>

      {tab === 'properties' ? (
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {def.fields.map((field) => (
            <Field
              key={field.name}
              field={field}
              value={(node.data as Record<string, unknown>)[field.name]}
              branches={branches}
              hosts={hosts}
              onChange={(v) => updateField(field.name, v)}
            />
          ))}
          {stepAcceptsHost && (
            <CapabilityTagsSection
              value={(node.data as Record<string, unknown>).requires as string[] | undefined}
              hostCapabilities={pickHostCapabilities(
                hosts,
                (node.data as Record<string, unknown>).hostId as string | undefined,
              )}
              onChange={(next) =>
                onChange(node.id, { ...(node.data as Record<string, unknown>), requires: next })
              }
            />
          )}
          <CommonControlsSection
            data={node.data as Record<string, unknown>}
            onChange={(patch) =>
              onChange(node.id, { ...(node.data as Record<string, unknown>), ...patch })
            }
          />
          {NOTIFY_STEP_TYPES.has(stepType) && (
            <>
              <NotifyPolicySection
                data={node.data as Record<string, unknown>}
                onChange={(patch) =>
                  onChange(node.id, { ...(node.data as Record<string, unknown>), ...patch })
                }
              />
              <TestChannelSection
                stepType={stepType}
                data={node.data as Record<string, unknown>}
              />
            </>
          )}
          <AiAutoFixSection
            value={(node.data as Record<string, unknown>).aiAutoFix as Record<string, unknown> | undefined}
            onChange={(next) =>
              onChange(node.id, { ...(node.data as Record<string, unknown>), aiAutoFix: next })
            }
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-slate-800 px-3 py-1.5">
            <LevelToggleBar active={activeLevels} onToggle={toggleLevel} compact />
          </div>
          <div className="min-h-0 flex-1">
            {nodeEntries.length === 0 ? (
              <div className="px-4 py-6 text-xs text-slate-400">
                No log entries for this node yet. Run the pipeline to see step output here.
              </div>
            ) : (
              <LogTable entries={nodeEntries} compact emptyMessage="No entries." />
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'focusable rounded-md px-2 py-0.5 font-semibold transition-colors',
        active
          ? 'bg-slate-800 text-slate-100'
          : 'text-slate-400 hover:bg-slate-900 hover:text-slate-300',
      )}
    >
      {children}
    </button>
  );
}

function AiAutoFixSection({
  value,
  onChange,
}: {
  value: Record<string, unknown> | undefined;
  onChange(next: Record<string, unknown> | undefined): void;
}) {
  const enabled = value?.enabled === true || value?.enabled === 'true';
  const tool = (value?.tool as string) ?? 'claude';
  const prompt = (value?.prompt as string) ?? '';
  const maxRetries = typeof value?.maxRetries === 'number' ? (value.maxRetries as number) : 3;

  const update = (patch: Record<string, unknown>) =>
    onChange({ enabled, tool, prompt, maxRetries, ...value, ...patch });

  return (
    <div className="mt-2 rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-300">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
          className="h-3.5 w-3.5"
        />
        AI Auto-Fix on failure
      </label>
      {enabled && (
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">
              Tool
            </span>
            <select
              value={tool}
              onChange={(e) => update({ tool: e.target.value })}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[12px] text-slate-100"
            >
              {['claude', 'codex', 'aider', 'gemini'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">
              Max retries
            </span>
            <input
              type="number"
              min={1}
              max={10}
              value={maxRetries}
              onChange={(e) => update({ maxRetries: Math.max(1, Number(e.target.value)) })}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[12px] text-slate-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">
              Prompt template ({"{{"}step{"}}"}, {"{{"}error{"}}"}, {"{{"}nodeId{"}}"})
            </span>
            <textarea
              value={prompt}
              onChange={(e) => update({ prompt: e.target.value })}
              placeholder={`The pipeline step "{{step}}" failed with:\n{{error}}\nFix the issue minimally and exit.`}
              rows={5}
              spellCheck={false}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-100 placeholder:text-slate-400"
            />
          </label>
          <p className="text-[10px] text-slate-400">
            On failure the pipeline runs the chosen CLI with this prompt, then re-runs
            the step. Loops up to maxRetries times before bailing out.
          </p>
        </div>
      )}
    </div>
  );
}

// Cluster 11.H — tag-based step routing UI. Persists in `node.data.requires`
// as a string[] so the dispatcher (TODO Phase 4.D #multi-agent) can later
// pick an eligible host. For now the chips are documentation-only and we
// surface a hint when the currently-selected hostId doesn't appear to
// satisfy a tag (informational; doesn't block save).
const CAPABILITY_TAG_OPTIONS = [
  'mac',
  'linux',
  'xcode15',
  'xcode16',
  'arch:arm64',
  'arch:x86_64',
] as const;

function pickHostCapabilities(
  hosts: SshHost[],
  hostId: string | undefined,
): import('@buildpilot/shared-types').HostCapabilities | undefined {
  if (!hostId || hostId.trim().length === 0) return undefined;
  return hosts.find((h) => h.id === hostId)?.capabilities;
}

// Compare a requested tag against a host's capability snapshot. Returns
// undefined for unknown tags (so we don't render a false-negative warning).
function tagMatches(
  tag: string,
  caps: import('@buildpilot/shared-types').HostCapabilities | undefined,
): boolean | undefined {
  if (!caps) return undefined;
  if (tag === 'mac') return !!caps.macosVersion;
  if (tag === 'linux') return !caps.macosVersion;
  if (tag === 'xcode15') return !!caps.xcodeVersion && caps.xcodeVersion.includes('15');
  if (tag === 'xcode16') return !!caps.xcodeVersion && caps.xcodeVersion.includes('16');
  if (tag === 'arch:arm64') return caps.arch === 'arm64';
  if (tag === 'arch:x86_64') return caps.arch === 'x86_64';
  return undefined;
}

function CapabilityTagsSection({
  value,
  hostCapabilities,
  onChange,
}: {
  value: string[] | undefined;
  hostCapabilities: import('@buildpilot/shared-types').HostCapabilities | undefined;
  onChange(next: string[] | undefined): void;
}) {
  const tags = Array.isArray(value) ? value : [];
  const toggle = (tag: string) => {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    onChange(next.length > 0 ? next : undefined);
  };
  const unsatisfied = tags
    .map((t) => ({ tag: t, ok: tagMatches(t, hostCapabilities) }))
    .filter((x) => x.ok === false);
  return (
    <div className="mt-2 rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">
        Requires capabilities
      </div>
      <p className="mt-1 text-[10px] text-slate-400">
        Capability tags are currently surfaced for documentation; engine routing
        comes in <code>TODO.md</code> Phase 4.D #multi-agent.
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {CAPABILITY_TAG_OPTIONS.map((tag) => {
          const active = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(tag)}
              className={cn(
                'focusable rounded-full border px-2 py-0.5 text-[10px] font-medium',
                active
                  ? 'border-sky-500 bg-sky-900/40 text-sky-100'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500',
              )}
            >
              {tag}
            </button>
          );
        })}
      </div>
      {unsatisfied.length > 0 && (
        <div className="mt-2 rounded border border-amber-800/60 bg-amber-950/30 px-2 py-1 text-[10px] text-amber-200">
          Heads up: the selected host's capability snapshot doesn't satisfy{' '}
          {unsatisfied.map((u) => u.tag).join(', ')}. Probe the host or pick a different one.
        </div>
      )}
    </div>
  );
}

function CommonControlsSection({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange(patch: Record<string, unknown>): void;
}) {
  const disabled = data.disabled === true || data.disabled === 'true';
  const continueOnError = data.continueOnError === 'true' || data.continueOnError === true;
  const retry = (data.retryPolicy as Record<string, unknown> | undefined) ?? {};
  const retryEnabled = retry.enabled === true;
  const retryMax = typeof retry.maxRetries === 'number' ? retry.maxRetries : 3;
  const retryBackoff = typeof retry.backoffMs === 'number' ? retry.backoffMs : 1000;
  const retryBackoffMax = typeof retry.backoffMaxMs === 'number' ? retry.backoffMaxMs : 30000;
  const watchdog = (data.watchdog as Record<string, unknown> | undefined) ?? {};
  const watchdogEnabled = watchdog.enabled === true;
  const watchdogIdle = typeof watchdog.idleSec === 'number' ? watchdog.idleSec : 600;
  return (
    <div className="mt-2 rounded-md border border-slate-800 bg-slate-900/40 p-3 space-y-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">Step controls</div>
      <label className="flex items-center gap-2 text-[12px] text-slate-300">
        <input
          type="checkbox"
          checked={disabled}
          onChange={(e) => onChange({ disabled: e.target.checked })}
          className="h-3.5 w-3.5"
        />
        Disable / skip this step
      </label>
      <p className="-mt-1 text-[10px] text-slate-400">
        Visually grayed out. TODO(engine): treat as a no-op at run time.
      </p>
      <label className="flex items-center gap-2 text-[12px] text-slate-300">
        <input
          type="checkbox"
          checked={continueOnError}
          onChange={(e) => onChange({ continueOnError: e.target.checked ? 'true' : 'false' })}
          className="h-3.5 w-3.5"
        />
        Continue on error (soft-fail; downstream success-edges still fire)
      </label>
      <p className="-mt-1 text-[10px] text-slate-400">
        Mirrors GH <code>continue-on-error</code>, Buildkite <code>soft_fail</code>,
        GitLab <code>allow_failure</code>. The failure is logged but the pipeline keeps going.
      </p>

      <div className="border-t border-slate-800 pt-2">
        <label className="flex items-center gap-2 text-[12px] text-slate-300">
          <input
            type="checkbox"
            checked={retryEnabled}
            onChange={(e) =>
              onChange({
                retryPolicy: {
                  ...retry,
                  enabled: e.target.checked,
                  maxRetries: retryMax,
                  backoffMs: retryBackoff,
                  backoffMaxMs: retryBackoffMax,
                },
              })
            }
            className="h-3.5 w-3.5"
          />
          Auto-retry on failure (exponential backoff)
        </label>
        {retryEnabled && (
          <div className="ml-5 mt-2 grid grid-cols-3 gap-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-400">
              Max retries
              <input
                type="number"
                min={0}
                max={10}
                value={retryMax}
                onChange={(e) =>
                  onChange({
                    retryPolicy: {
                      ...retry,
                      enabled: true,
                      maxRetries: Math.max(0, Math.min(10, Number(e.target.value) || 0)),
                      backoffMs: retryBackoff,
                      backoffMaxMs: retryBackoffMax,
                    },
                  })
                }
                className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[12px] text-slate-100"
              />
            </label>
            <label className="text-[10px] uppercase tracking-wider text-slate-400">
              Backoff (ms)
              <input
                type="number"
                min={0}
                value={retryBackoff}
                onChange={(e) =>
                  onChange({
                    retryPolicy: {
                      ...retry,
                      enabled: true,
                      maxRetries: retryMax,
                      backoffMs: Math.max(0, Number(e.target.value) || 0),
                      backoffMaxMs: retryBackoffMax,
                    },
                  })
                }
                className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[12px] text-slate-100"
              />
            </label>
            <label className="text-[10px] uppercase tracking-wider text-slate-400">
              Cap (ms)
              <input
                type="number"
                min={0}
                value={retryBackoffMax}
                onChange={(e) =>
                  onChange({
                    retryPolicy: {
                      ...retry,
                      enabled: true,
                      maxRetries: retryMax,
                      backoffMs: retryBackoff,
                      backoffMaxMs: Math.max(retryBackoff, Number(e.target.value) || 0),
                    },
                  })
                }
                className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[12px] text-slate-100"
              />
            </label>
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 pt-2">
        <label className="flex items-center gap-2 text-[12px] text-slate-300">
          <input
            type="checkbox"
            checked={watchdogEnabled}
            onChange={(e) =>
              onChange({
                watchdog: { ...watchdog, enabled: e.target.checked, idleSec: watchdogIdle },
              })
            }
            className="h-3.5 w-3.5"
          />
          Watchdog: kill the step after N seconds of log silence
        </label>
        {watchdogEnabled && (
          <div className="ml-5 mt-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-400">
              Idle threshold (sec)
              <input
                type="number"
                min={10}
                value={watchdogIdle}
                onChange={(e) =>
                  onChange({
                    watchdog: {
                      ...watchdog,
                      enabled: true,
                      idleSec: Math.max(10, Number(e.target.value) || 600),
                    },
                  })
                }
                className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[12px] text-slate-100"
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

function NotifyPolicySection({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange(patch: Record<string, unknown>): void;
}) {
  // Default to "always" so existing pipelines preserve current behaviour
  // (the engine treats absent notifyOn the same way).
  const current = (data.notifyOn as NotifyOn | undefined) ?? 'always';
  const selected = NOTIFY_OPTIONS.find((o) => o.value === current) ?? NOTIFY_OPTIONS[0];
  return (
    <div className="mt-2 rounded-md border border-slate-800 bg-slate-900/40 p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">
        Notification policy
      </div>
      <label className="block">
        <span className="sr-only">When to send</span>
        <select
          value={current}
          onChange={(e) => onChange({ notifyOn: e.target.value as NotifyOn })}
          className="focusable w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[12px] text-slate-100 focus:border-sky-500 focus:outline-none"
        >
          {NOTIFY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[10px] text-slate-400">
        {selected?.help}{' '}
        <span className="text-slate-500">
          {/* The runner does not yet filter on this field — UI only. */}
          (TODO engine: filter on this at run time)
        </span>
      </p>
    </div>
  );
}

// Cluster 11.I — fires the actual notify executor with this step's data
// and reports the response inline. Mirrors the existing /api/config/telegram/test
// "Send test message" button on the Settings page, but generalised so every
// notify step type gets one.
function TestChannelSection({
  stepType,
  data,
}: {
  stepType: StepType;
  data: Record<string, unknown>;
}) {
  type Status =
    | { kind: 'idle' }
    | { kind: 'running' }
    | { kind: 'ok'; lines: Array<{ level: string; message: string }> }
    | { kind: 'fail'; error: string; lines: Array<{ level: string; message: string }> };
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function run(): Promise<void> {
    setStatus({ kind: 'running' });
    try {
      const res = await api.testNotify({ stepType, data });
      if (res.ok) {
        setStatus({ kind: 'ok', lines: res.lines });
      } else {
        setStatus({ kind: 'fail', error: res.error, lines: res.lines ?? [] });
      }
    } catch (err) {
      setStatus({
        kind: 'fail',
        error: err instanceof Error ? err.message : String(err),
        lines: [],
      });
    }
  }

  return (
    <div className="mt-2 rounded-md border border-slate-800 bg-slate-900/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-400">
          Test channel
        </div>
        <button
          type="button"
          onClick={run}
          disabled={status.kind === 'running'}
          className="focusable rounded-md border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-sky-500 hover:text-sky-300 disabled:opacity-50"
          title="Send a test message using this step's current configuration"
        >
          {status.kind === 'running' ? 'Sending…' : 'Send test'}
        </button>
      </div>
      {status.kind === 'ok' && (
        <div className="text-[11px] text-emerald-400">
          ✓ Test message delivered.
          {status.lines.length > 0 && (
            <pre className="mt-1 max-h-24 overflow-y-auto rounded bg-slate-950 p-1.5 font-mono text-[10px] text-slate-300">
              {status.lines.map((l) => `[${l.level}] ${l.message}`).join('\n').slice(0, 800)}
            </pre>
          )}
        </div>
      )}
      {status.kind === 'fail' && (
        <div className="text-[11px] text-amber-400">
          ✖ Test failed: {status.error}
          {status.lines.length > 0 && (
            <pre className="mt-1 max-h-24 overflow-y-auto rounded bg-slate-950 p-1.5 font-mono text-[10px] text-slate-400">
              {status.lines.map((l) => `[${l.level}] ${l.message}`).join('\n').slice(0, 800)}
            </pre>
          )}
        </div>
      )}
      {status.kind === 'idle' && (
        <p className="text-[10px] text-slate-400">
          Uses this step&apos;s data — saves nothing. Server-side log lines from the
          executor are echoed back here.
        </p>
      )}
    </div>
  );
}

function BulkEditPanel({
  nodes,
  hosts,
  onApply,
}: {
  nodes: Node[];
  hosts: SshHost[];
  onApply(patch: Record<string, unknown>): void;
}) {
  const [setHost, setSetHost] = useState(false);
  const [hostId, setHostId] = useState('');
  const [applyContinue, setApplyContinue] = useState(false);
  const [continueOnError, setContinueOnError] = useState(false);
  const [applyDisabled, setApplyDisabled] = useState(false);
  const [disabledFlag, setDisabledFlag] = useState(false);
  const [applyRetry, setApplyRetry] = useState(false);
  const [retryEnabled, setRetryEnabled] = useState(true);
  const [retryMax, setRetryMax] = useState(3);
  const [retryBackoff, setRetryBackoff] = useState(1000);

  const apply = () => {
    const patch: Record<string, unknown> = {};
    if (setHost) patch.hostId = hostId;
    if (applyContinue) patch.continueOnError = continueOnError ? 'true' : 'false';
    if (applyDisabled) patch.disabled = disabledFlag;
    if (applyRetry) {
      patch.retryPolicy = {
        enabled: retryEnabled,
        maxRetries: retryMax,
        backoffMs: retryBackoff,
        backoffMaxMs: Math.max(retryBackoff, 30000),
      };
    }
    if (Object.keys(patch).length === 0) return;
    onApply(patch);
  };

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-slate-800 bg-slate-950">
      <div className="border-b border-slate-800 px-4 py-3">
        <div className="text-[11px] uppercase tracking-wider text-slate-400">Bulk edit</div>
        <h3 className="mt-1 text-sm font-semibold text-slate-100">
          {nodes.length} steps selected
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          Tick a field and set a value; only ticked fields are applied to every selected node.
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3 text-[12px] text-slate-200">
        <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={setHost}
              onChange={(e) => setSetHost(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            <span className="text-[11px] uppercase tracking-wider text-slate-400">
              Saved Mac host
            </span>
          </label>
          {setHost && (
            <select
              value={hostId}
              onChange={(e) => setHostId(e.target.value)}
              className="mt-2 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[12px] text-slate-100"
            >
              <option value="">(inline / clear)</option>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} — {h.host}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={applyContinue}
              onChange={(e) => setApplyContinue(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            <span className="text-[11px] uppercase tracking-wider text-slate-400">
              Continue on error
            </span>
          </label>
          {applyContinue && (
            <label className="mt-2 flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={continueOnError}
                onChange={(e) => setContinueOnError(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              soft-fail
            </label>
          )}
        </div>

        <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={applyDisabled}
              onChange={(e) => setApplyDisabled(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            <span className="text-[11px] uppercase tracking-wider text-slate-400">
              Disable / skip
            </span>
          </label>
          {applyDisabled && (
            <label className="mt-2 flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={disabledFlag}
                onChange={(e) => setDisabledFlag(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              skip these steps
            </label>
          )}
        </div>

        <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={applyRetry}
              onChange={(e) => setApplyRetry(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            <span className="text-[11px] uppercase tracking-wider text-slate-400">
              Retry policy
            </span>
          </label>
          {applyRetry && (
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={retryEnabled}
                  onChange={(e) => setRetryEnabled(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                enabled
              </label>
              <label className="block text-[10px] uppercase tracking-wider text-slate-400">
                Max retries
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={retryMax}
                  onChange={(e) => setRetryMax(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
                  className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[12px] text-slate-100"
                />
              </label>
              <label className="block text-[10px] uppercase tracking-wider text-slate-400">
                Backoff (ms)
                <input
                  type="number"
                  min={0}
                  value={retryBackoff}
                  onChange={(e) => setRetryBackoff(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[12px] text-slate-100"
                />
              </label>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={apply}
          className="w-full rounded-md bg-sky-600 px-3 py-2 text-[12px] font-medium text-white hover:bg-sky-500"
        >
          Apply to {nodes.length} step{nodes.length === 1 ? '' : 's'}
        </button>
      </div>
    </aside>
  );
}

// re-export EMPTY so PipelineEditor can use the same stable reference
export { EMPTY as EMPTY_ENTRIES };

function Field({
  field,
  value,
  branches,
  hosts,
  onChange,
}: {
  field: StepFieldSchema;
  value: unknown;
  branches: string[];
  hosts: SshHost[];
  onChange(v: string | number): void;
}) {
  const stringValue = value === undefined || value === null ? '' : String(value);
  // Cluster 11.B — every free-text field on a step participates in the
  // `${{ secrets.X }}` / `${{ files.X }}` autocomplete. Suggestions only
  // surface when the user actually types the trigger sequence, so this
  // is opt-in from the user's perspective. The "where is this used?"
  // affordance also fires when the value contains a recognised marker.
  const referencedSecret = stringValue.match(/\$\{\{\s*secrets\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/);
  const isFreeText =
    field.type === 'text' || field.type === 'textarea' || field.type === 'number';
  const renderSecretAffordance = isFreeText && referencedSecret !== null && referencedSecret[1];
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-slate-400">{field.label}</span>
        {field.required && <span className="text-[10px] text-rose-400">required</span>}
      </span>
      {field.type === 'textarea' ? (
        <SecretReferenceAutocomplete
          as="textarea"
          value={stringValue}
          onChange={onChange}
          placeholder={field.placeholder}
          rows={4}
          spellCheck={false}
          className="focusable w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-[12px] text-slate-100 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
        />
      ) : field.type === 'select' ? (
        <select
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          className="focusable w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[13px] text-slate-100 focus:border-sky-500 focus:outline-none"
        >
          <option value="" disabled>
            (choose…)
          </option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.type === 'branchSelect' ? (
        <BranchSelect
          value={stringValue}
          onChange={onChange}
          branches={branches}
          required={field.required}
          className="w-full [&>select]:w-full [&>select]:px-2.5 [&>select]:py-1.5 [&>select]:text-[13px]"
        />
      ) : field.type === 'hostSelect' ? (
        <select
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          className="focusable w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[13px] text-slate-100 focus:border-sky-500 focus:outline-none"
        >
          <option value="">(inline / fill below)</option>
          {hosts.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name} — {h.host}
            </option>
          ))}
        </select>
      ) : field.type === 'number' ? (
        <input
          type="number"
          value={stringValue}
          onChange={(e) => onChange(Number(e.target.value))}
          placeholder={field.placeholder}
          spellCheck={false}
          className="focusable w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[13px] text-slate-100 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
        />
      ) : (
        <SecretReferenceAutocomplete
          as="input"
          value={stringValue}
          onChange={(v) => onChange(v)}
          placeholder={field.placeholder}
          spellCheck={false}
          className="focusable w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[13px] text-slate-100 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
        />
      )}
      {renderSecretAffordance && (
        <SecretUsageHint name={referencedSecret![1]!} />
      )}
      {field.help && <p className="mt-1 text-[11px] text-slate-400">{field.help}</p>}
    </label>
  );
}

// "Where is this secret used?" jump-link. Visible whenever a free-text
// field's value contains a `${{ secrets.NAME }}` reference — clicking
// navigates to the secret detail page on /secrets.
function SecretUsageHint({ name }: { name: string }) {
  const setView = useStore((s) => s.setView);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        setView({ type: 'secrets', name });
      }}
      className="focusable mt-1 text-[11px] text-sky-400 hover:text-sky-300 hover:underline"
      title={`See every pipeline node that references secrets.${name}`}
    >
      ↳ where is <code className="font-mono">{name}</code> used?
    </button>
  );
}
