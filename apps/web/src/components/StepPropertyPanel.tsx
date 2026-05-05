import type { Node } from '@xyflow/react';
import type { StepType } from '@buildpilot/shared-types';
import { STEP_DEFINITIONS, type StepFieldSchema } from '@buildpilot/step-registry';

interface Props {
  node: Node | null;
  onChange(nodeId: string, data: Record<string, unknown>): void;
  onDelete(nodeId: string): void;
}

export function StepPropertyPanel({ node, onChange, onDelete }: Props) {
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
        <div className="mt-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">{def.label}</h3>
          <button
            type="button"
            onClick={() => onDelete(node.id)}
            className="text-xs text-rose-400 hover:text-rose-300"
          >
            Delete
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">{def.description}</p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {def.fields.map((field) => (
          <Field
            key={field.name}
            field={field}
            value={(node.data as Record<string, unknown>)[field.name]}
            onChange={(v) => updateField(field.name, v)}
          />
        ))}
      </div>
    </aside>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: StepFieldSchema;
  value: unknown;
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
