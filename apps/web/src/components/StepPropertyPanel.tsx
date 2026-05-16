import { useMemo, useState } from 'react';
import type { Node } from '@xyflow/react';
import type { BuildLogEntry, BuildLogLevel, SshHost, StepType } from '@buildpilot/shared-types';
import { STEP_DEFINITIONS, type StepFieldSchema } from '@buildpilot/step-registry';
import { BranchSelect } from './BranchSelect';
import { LogTable } from './LogTable';
import { LevelToggleBar, defaultActiveLevels } from './LevelToggleBar';
import { useStore } from '../store/store';
import { cn } from '../lib/cn';

const EMPTY: BuildLogEntry[] = [];

interface Props {
  node: Node | null;
  branches: string[];
  // Live entries from the latest build for this pipeline (any nodeId).
  entries: BuildLogEntry[];
  onChange(nodeId: string, data: Record<string, unknown>): void;
  onDelete(nodeId: string): void;
  onRunFrom?(nodeId: string): void;
  onSaveAsTemplate?(nodeId: string): void;
}

type Tab = 'properties' | 'logs';

export function StepPropertyPanel({
  node,
  branches,
  entries,
  onChange,
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
      <aside className="flex h-full w-80 shrink-0 flex-col border-l border-slate-800 bg-slate-950 p-4 text-sm text-slate-500">
        Select a node to edit its properties.
      </aside>
    );
  }

  const stepType = node.type as StepType;
  const def = STEP_DEFINITIONS[stepType];
  if (!def) return null;

  const updateField = (name: string, value: string | number) => {
    onChange(node.id, { ...(node.data as Record<string, unknown>), [name]: value });
  };

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-slate-800 bg-slate-950">
      <div className="border-b border-slate-800 px-4 py-3">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">
          Step properties
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-slate-100">{def.label}</h3>
          <div className="flex items-center gap-2">
            {onSaveAsTemplate && (
              <button
                type="button"
                onClick={() => onSaveAsTemplate(node.id)}
                className="text-[11px] text-sky-400 hover:text-sky-300"
                title="Save this node's configuration as a reusable palette entry"
              >
                Save as template
              </button>
            )}
            {onRunFrom && (
              <button
                type="button"
                onClick={() => onRunFrom(node.id)}
                className="text-[11px] text-emerald-400 hover:text-emerald-300"
                title="Trigger a build that runs this step and everything after it"
              >
                Run from here
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(node.id)}
              className="text-xs text-rose-400 hover:text-rose-300"
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
          <CommonControlsSection
            data={node.data as Record<string, unknown>}
            onChange={(patch) =>
              onChange(node.id, { ...(node.data as Record<string, unknown>), ...patch })
            }
          />
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
              <div className="px-4 py-6 text-xs text-slate-500">
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
      className={cn(
        'rounded-md px-2 py-0.5 font-semibold transition-colors',
        active
          ? 'bg-slate-800 text-slate-100'
          : 'text-slate-500 hover:bg-slate-900 hover:text-slate-300',
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
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">
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
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">
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
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">
              Prompt template ({"{{"}step{"}}"}, {"{{"}error{"}}"}, {"{{"}nodeId{"}}"})
            </span>
            <textarea
              value={prompt}
              onChange={(e) => update({ prompt: e.target.value })}
              placeholder={`The pipeline step "{{step}}" failed with:\n{{error}}\nFix the issue minimally and exit.`}
              rows={5}
              spellCheck={false}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-100 placeholder:text-slate-600"
            />
          </label>
          <p className="text-[10px] text-slate-500">
            On failure the pipeline runs the chosen CLI with this prompt, then re-runs
            the step. Loops up to maxRetries times before bailing out.
          </p>
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
      <div className="text-[10px] uppercase tracking-wider text-slate-500">Step controls</div>
      <label className="flex items-center gap-2 text-[12px] text-slate-300">
        <input
          type="checkbox"
          checked={continueOnError}
          onChange={(e) => onChange({ continueOnError: e.target.checked ? 'true' : 'false' })}
          className="h-3.5 w-3.5"
        />
        Continue on error (soft-fail; downstream success-edges still fire)
      </label>
      <p className="-mt-1 text-[10px] text-slate-500">
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
            <label className="text-[10px] uppercase tracking-wider text-slate-500">
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
            <label className="text-[10px] uppercase tracking-wider text-slate-500">
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
            <label className="text-[10px] uppercase tracking-wider text-slate-500">
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
            <label className="text-[10px] uppercase tracking-wider text-slate-500">
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
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-slate-400">{field.label}</span>
        {field.required && <span className="text-[10px] text-rose-400">required</span>}
      </span>
      {field.type === 'textarea' ? (
        <textarea
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          spellCheck={false}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-[12px] text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
        />
      ) : field.type === 'select' ? (
        <select
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[13px] text-slate-100 focus:border-sky-500 focus:outline-none"
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
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[13px] text-slate-100 focus:border-sky-500 focus:outline-none"
        >
          <option value="">(inline / fill below)</option>
          {hosts.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name} — {h.host}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === 'number' ? 'number' : 'text'}
          value={stringValue}
          onChange={(e) =>
            onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)
          }
          placeholder={field.placeholder}
          spellCheck={false}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[13px] text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
        />
      )}
      {field.help && <p className="mt-1 text-[11px] text-slate-500">{field.help}</p>}
    </label>
  );
}
