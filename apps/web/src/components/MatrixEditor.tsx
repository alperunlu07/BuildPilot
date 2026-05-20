import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Matrix } from '@buildpilot/shared-types';

// Cluster 11.C — declarative matrix editor.
//
// Each axis is one row: the user types the axis name (e.g. "xcode") on the
// left and a comma-separated list of values (e.g. "15, 16") on the right.
// A live preview block underneath shows the cross-product expansion so the
// user can see "this will generate N builds" before saving.
//
// The component is a controlled, value-only widget — it never talks to the
// API itself. PipelineEditor pipes the saved matrix back through its
// existing dirty-tracking / save flow so undo/redo + drafts work without
// extra plumbing.

interface Props {
  value: Matrix | null;
  onChange: (next: Matrix | null) => void;
}

// Internal editor row shape — we keep values as a single string so the
// "comma-separated" UX matches the placeholder. On change we re-derive
// the Matrix object.
interface AxisRow {
  name: string;
  // Raw text exactly as the user typed it, including stray whitespace.
  // Split on commas with empties trimmed when we serialise to Matrix.
  valuesText: string;
}

function matrixToRows(matrix: Matrix | null): AxisRow[] {
  if (!matrix) return [];
  return Object.entries(matrix.axes).map(([name, vals]) => ({
    name,
    valuesText: vals.join(', '),
  }));
}

function rowsToMatrix(rows: AxisRow[]): Matrix | null {
  const axes: Record<string, string[]> = {};
  for (const r of rows) {
    const name = r.name.trim();
    if (name.length === 0) continue;
    const vals = r.valuesText
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    if (vals.length === 0) continue;
    axes[name] = vals;
  }
  if (Object.keys(axes).length === 0) return null;
  return { axes };
}

// Compute the cross-product preview without going through the server.
// Stable insertion-order axis enumeration matches what `expandMatrix`
// produces in apps/server/src/runner/matrix.ts.
function previewCombos(matrix: Matrix | null): Array<Record<string, string>> {
  if (!matrix) return [];
  const axisNames = Object.keys(matrix.axes);
  if (axisNames.length === 0) return [];
  let acc: Array<Record<string, string>> = [{}];
  for (const name of axisNames) {
    const vals = matrix.axes[name] ?? [];
    if (vals.length === 0) return [];
    acc = acc.flatMap((curr) => vals.map((v) => ({ ...curr, [name]: v })));
  }
  return acc;
}

function labelOf(combo: Record<string, string>): string {
  return Object.keys(combo)
    .sort()
    .map((k) => `${k}=${combo[k]}`)
    .join(', ');
}

// Hard ceiling on the preview list so an axis with 100 values doesn't
// freeze the editor. We still report the total count above the list.
const PREVIEW_LIMIT = 25;

export function MatrixEditor({ value, onChange }: Props) {
  // Read-only derivation — the editor uses the rows directly so the user
  // can keep trailing commas, blank names, etc. while editing; only the
  // serialised matrix below reflects the cleaned-up form.
  const rows = useMemo(() => matrixToRows(value), [value]);

  const commit = (next: AxisRow[]) => {
    onChange(rowsToMatrix(next));
  };

  const setRow = (idx: number, patch: Partial<AxisRow>) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    commit(next);
  };

  const addRow = () => {
    commit([...rows, { name: '', valuesText: '' }]);
  };

  const removeRow = (idx: number) => {
    commit(rows.filter((_, i) => i !== idx));
  };

  const matrix = useMemo(() => rowsToMatrix(rows), [rows]);
  const combos = useMemo(() => previewCombos(matrix), [matrix]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Build matrix</h3>
          <p className="text-[11px] text-text-muted">
            Each axis fans the build out into one run per value combination.
            Use <code className="rounded bg-bg-elevated px-1">{'${{ matrix.<axis> }}'}</code> inside any step field to interpolate.
          </p>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="focusable inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-xs text-text-primary hover:border-accent hover:text-accent"
        >
          <Plus size={12} /> Axis
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-subtle bg-bg-panel/60 px-3 py-4 text-center text-[11px] text-text-muted">
          No matrix declared — this pipeline runs as a single build per trigger.
          Click <strong>Axis</strong> to fan out (e.g.{' '}
          <code className="rounded bg-bg-elevated px-1">xcode</code> = 15, 16).
        </div>
      ) : (
        <table className="w-full table-fixed text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-text-faint">
              <th className="w-1/3 pb-1 pr-2">Axis name</th>
              <th className="pb-1 pr-2">Values (comma-separated)</th>
              <th className="w-7 pb-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                <td className="pb-1 pr-2">
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => setRow(idx, { name: e.target.value })}
                    placeholder="xcode"
                    spellCheck={false}
                    aria-label="Axis name"
                    className="focusable w-full rounded-md border border-border-subtle bg-bg-panel px-2 py-1 font-mono text-text-primary focus:border-accent focus:outline-none"
                  />
                </td>
                <td className="pb-1 pr-2">
                  <input
                    type="text"
                    value={row.valuesText}
                    onChange={(e) => setRow(idx, { valuesText: e.target.value })}
                    placeholder="15, 16"
                    spellCheck={false}
                    aria-label="Axis values"
                    className="focusable w-full rounded-md border border-border-subtle bg-bg-panel px-2 py-1 font-mono text-text-primary focus:border-accent focus:outline-none"
                  />
                </td>
                <td className="pb-1">
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    aria-label={`Remove axis ${row.name || idx + 1}`}
                    className="focusable inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle text-text-muted hover:border-rose-500 hover:text-rose-300"
                  >
                    <Trash2 size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Preview block — empty axes collapse cleanly to "no matrix". */}
      {combos.length > 0 && (
        <div className="rounded-md border border-border-subtle bg-bg-panel/60 p-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-text-muted">
            Generates {combos.length} run{combos.length === 1 ? '' : 's'}
          </div>
          <ul className="space-y-0.5">
            {combos.slice(0, PREVIEW_LIMIT).map((c, i) => (
              <li
                key={i}
                className="font-mono text-[11px] text-text-secondary"
                title={labelOf(c)}
              >
                {labelOf(c)}
              </li>
            ))}
            {combos.length > PREVIEW_LIMIT && (
              <li className="text-[10px] italic text-text-faint">
                …and {combos.length - PREVIEW_LIMIT} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
