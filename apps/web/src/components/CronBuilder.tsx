import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, AlertCircle, Check } from 'lucide-react';

interface Props {
  value: string;
  onChange(expr: string): void;
}

// Cluster 11.G — visual cron builder. Lets the user edit a 5-field cron
// expression either by typing the raw string or by toggling form controls
// (every N minutes/hours, specific hour, day-of-week, day-of-month). Both
// views are two-way bound: editing the form rewrites the string and vice
// versa whenever the string parses. Mirrors the parser in
// `apps/server/src/poller/triggers.ts` (5 fields, `*`, `*/N`, plain ints,
// comma lists — no ranges or names).

type FieldKind = 'every' | 'list';

interface ParsedField {
  kind: FieldKind;
  every?: number;
  values?: number[];
  raw: string;
}

const BOUNDS: Record<'minute' | 'hour' | 'dom' | 'month' | 'dow', [number, number]> = {
  minute: [0, 59],
  hour: [0, 23],
  dom: [1, 31],
  month: [1, 12],
  dow: [0, 6],
};

export interface ParsedCron {
  minute: ParsedField;
  hour: ParsedField;
  dom: ParsedField;
  month: ParsedField;
  dow: ParsedField;
}

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseField(raw: string, [lo, hi]: [number, number]): ParsedField | null {
  if (raw === '*') {
    return { kind: 'every', every: 1, values: [], raw };
  }
  const stepMatch = /^\*\/(\d+)$/.exec(raw);
  if (stepMatch) {
    const n = Number(stepMatch[1]);
    if (n <= 0 || n > hi - lo + 1) return null;
    return { kind: 'every', every: n, values: [], raw };
  }
  const parts = raw.split(',');
  const values: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const v = Number(p);
    if (v < lo || v > hi) return null;
    values.push(v);
  }
  if (values.length === 0) return null;
  return { kind: 'list', values: Array.from(new Set(values)).sort((a, b) => a - b), raw };
}

export function parseCronExpr(expr: string): ParsedCron | null {
  if (!expr || expr.trim().length === 0) return null;
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [m, h, dom, mo, dow] = fields as [string, string, string, string, string];
  const pm = parseField(m, BOUNDS.minute);
  const ph = parseField(h, BOUNDS.hour);
  const pdom = parseField(dom, BOUNDS.dom);
  const pmo = parseField(mo, BOUNDS.month);
  const pdow = parseField(dow, BOUNDS.dow);
  if (!pm || !ph || !pdom || !pmo || !pdow) return null;
  return { minute: pm, hour: ph, dom: pdom, month: pmo, dow: pdow };
}

// Human description — short, single sentence, English, no localisation.
export function describeCron(spec: ParsedCron): string {
  const { minute, hour, dom, month, dow } = spec;
  const isStar = (f: ParsedField) => f.kind === 'every' && f.every === 1;
  const minDesc = (() => {
    if (isStar(minute)) return 'every minute';
    if (minute.kind === 'every') return `every ${minute.every} min`;
    return `at minute ${minute.values!.join(', ')}`;
  })();
  const hourDesc = (() => {
    if (isStar(hour)) return null;
    if (hour.kind === 'every') return `every ${hour.every}h`;
    const hh = hour.values!.map((v) => `${String(v).padStart(2, '0')}:00`);
    return `at ${hh.join(', ')} UTC`;
  })();
  const dowDesc = (() => {
    if (isStar(dow)) return null;
    if (dow.kind === 'every') return null;
    return `on ${dow.values!.map((v) => DOW_NAMES[v]).join(', ')}`;
  })();
  const domDesc = (() => {
    if (isStar(dom)) return null;
    if (dom.kind === 'every') return null;
    return `on day ${dom.values!.join(', ')}`;
  })();
  const monDesc = (() => {
    if (isStar(month)) return null;
    return `in month ${month.values?.join(', ') ?? ''}`;
  })();

  // Special cases for prettier output of common shapes
  if (
    minute.kind === 'list' && minute.values!.length === 1 && minute.values![0] === 0 &&
    isStar(hour) && isStar(dom) && isStar(month) && isStar(dow)
  ) return 'Every hour at :00';
  if (
    minute.kind === 'list' && minute.values!.length === 1 && minute.values![0] === 0 &&
    hour.kind === 'every' && hour.every === 1 &&
    isStar(dom) && isStar(month) && isStar(dow)
  ) return 'Every hour';

  const parts = [minDesc, hourDesc, dowDesc, domDesc, monDesc].filter(Boolean);
  return parts.join(', ');
}

interface Preset {
  label: string;
  expr: string;
}

const PRESETS: Preset[] = [
  { label: 'Every hour', expr: '0 * * * *' },
  { label: 'Every 4 hours', expr: '0 */4 * * *' },
  { label: 'Daily 09:00 UTC', expr: '0 9 * * *' },
  { label: 'Weekly Mon 09:00 UTC', expr: '0 9 * * 1' },
  { label: 'Monthly 1st 09:00 UTC', expr: '0 9 1 * *' },
];

type Mode = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

interface FormState {
  mode: Mode;
  // hourly mode
  everyHours: number; // 1..23 (1 = every hour)
  minuteOfHour: number; // 0..59
  // daily mode
  dailyHour: number; // 0..23
  dailyMinute: number; // 0..59
  // weekly mode
  weeklyHour: number;
  weeklyMinute: number;
  weeklyDays: number[]; // 0..6
  // monthly mode
  monthlyDay: number; // 1..31
  monthlyHour: number;
  monthlyMinute: number;
}

const DEFAULT_FORM: FormState = {
  mode: 'daily',
  everyHours: 4,
  minuteOfHour: 0,
  dailyHour: 9,
  dailyMinute: 0,
  weeklyHour: 9,
  weeklyMinute: 0,
  weeklyDays: [1],
  monthlyDay: 1,
  monthlyHour: 9,
  monthlyMinute: 0,
};

function formToExpr(f: FormState): string {
  switch (f.mode) {
    case 'hourly':
      return `${f.minuteOfHour} ${f.everyHours === 1 ? '*' : `*/${f.everyHours}`} * * *`;
    case 'daily':
      return `${f.dailyMinute} ${f.dailyHour} * * *`;
    case 'weekly': {
      const days = f.weeklyDays.length > 0 ? [...f.weeklyDays].sort().join(',') : '1';
      return `${f.weeklyMinute} ${f.weeklyHour} * * ${days}`;
    }
    case 'monthly':
      return `${f.monthlyMinute} ${f.monthlyHour} ${f.monthlyDay} * *`;
    case 'custom':
      return '';
  }
}

function specToForm(spec: ParsedCron): FormState | null {
  // Try to recognise the shapes the form can render. Anything else → null
  // (caller falls back to 'custom' mode, hiding the form).
  const isStar = (f: ParsedField) => f.kind === 'every' && f.every === 1;
  const single = (f: ParsedField) => f.kind === 'list' && f.values!.length === 1;
  const everyN = (f: ParsedField) => f.kind === 'every' && (f.every ?? 0) > 1;

  if (!isStar(spec.month)) return null;

  // Hourly: `M */H * * *` (H>=2) or `M * * * *`
  if (isStar(spec.dom) && isStar(spec.dow) && single(spec.minute)) {
    if (isStar(spec.hour)) {
      return { ...DEFAULT_FORM, mode: 'hourly', everyHours: 1, minuteOfHour: spec.minute.values![0]! };
    }
    if (everyN(spec.hour)) {
      return {
        ...DEFAULT_FORM,
        mode: 'hourly',
        everyHours: spec.hour.every!,
        minuteOfHour: spec.minute.values![0]!,
      };
    }
  }

  // Daily: `M H * * *` (single hour, single minute)
  if (
    isStar(spec.dom) && isStar(spec.dow) &&
    single(spec.minute) && single(spec.hour)
  ) {
    return {
      ...DEFAULT_FORM,
      mode: 'daily',
      dailyHour: spec.hour.values![0]!,
      dailyMinute: spec.minute.values![0]!,
    };
  }

  // Weekly: `M H * * D[,D...]`
  if (
    isStar(spec.dom) && single(spec.minute) && single(spec.hour) &&
    spec.dow.kind === 'list'
  ) {
    return {
      ...DEFAULT_FORM,
      mode: 'weekly',
      weeklyHour: spec.hour.values![0]!,
      weeklyMinute: spec.minute.values![0]!,
      weeklyDays: spec.dow.values!.slice(),
    };
  }

  // Monthly: `M H D * *`
  if (
    isStar(spec.dow) && single(spec.dom) &&
    single(spec.minute) && single(spec.hour)
  ) {
    return {
      ...DEFAULT_FORM,
      mode: 'monthly',
      monthlyDay: spec.dom.values![0]!,
      monthlyHour: spec.hour.values![0]!,
      monthlyMinute: spec.minute.values![0]!,
    };
  }

  return null;
}

export function CronBuilder({ value, onChange }: Props) {
  const [rawValue, setRawValue] = useState(value);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  // Tracks whether the user is currently typing in the raw input — we don't
  // want to overwrite their keystrokes from the form syncing effect.
  const editingRawRef = useRef(false);

  // Sync from external `value` prop changes (e.g. parent reset, preset click)
  useEffect(() => {
    if (value === rawValue) return;
    setRawValue(value);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = useMemo(() => parseCronExpr(rawValue), [rawValue]);
  const valid = rawValue.trim().length === 0 || parsed !== null;
  const description = parsed ? describeCron(parsed) : null;

  // Sync the form state to match the parsed expression whenever it changes
  // (so toggling a preset or editing the raw input updates the toggles).
  useEffect(() => {
    if (!parsed) return;
    const next = specToForm(parsed);
    if (next) setForm(next);
  }, [rawValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const inCustomMode = parsed !== null && specToForm(parsed) === null;

  const commit = (expr: string) => {
    setRawValue(expr);
    onChange(expr);
  };

  const applyForm = (next: FormState) => {
    setForm(next);
    if (next.mode === 'custom') return;
    const expr = formToExpr(next);
    commit(expr);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Clock size={12} className="text-text-muted" />
        <input
          type="text"
          value={rawValue}
          onFocus={() => {
            editingRawRef.current = true;
          }}
          onBlur={() => {
            editingRawRef.current = false;
          }}
          onChange={(e) => {
            const v = e.target.value;
            setRawValue(v);
            onChange(v);
          }}
          placeholder="0 9 * * *"
          spellCheck={false}
          className={`w-full rounded-md border bg-bg-base px-2 py-1.5 font-mono text-xs text-text-primary focus:outline-none ${
            valid ? 'border-border-subtle focus:border-accent' : 'border-rose-700 focus:border-rose-500'
          }`}
        />
      </div>

      {rawValue.trim().length > 0 && !valid && (
        <div className="flex items-start gap-1.5 text-[11px] text-rose-300">
          <AlertCircle size={11} className="mt-0.5 shrink-0" />
          <span>
            Invalid cron — needs 5 fields. Supports <code>*</code>, <code>*/N</code>, integers,
            and comma lists. Ranges and names not supported.
          </span>
        </div>
      )}

      {rawValue.trim().length > 0 && valid && description && (
        <div className="flex items-start gap-1.5 text-[11px] text-emerald-300/90">
          <Check size={11} className="mt-0.5 shrink-0" />
          <span>{description} (UTC)</span>
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.expr}
            type="button"
            onClick={() => commit(p.expr)}
            className={`rounded border px-1.5 py-0.5 text-[10px] ${
              rawValue.trim() === p.expr
                ? 'border-accent bg-sky-950/40 text-accent-hover'
                : 'border-border-subtle text-text-muted hover:border-accent hover:text-accent-hover'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {!inCustomMode && (
        <div className="rounded border border-border-subtle bg-bg-base/40 p-2">
          <div className="mb-2 flex gap-1">
            {(['hourly', 'daily', 'weekly', 'monthly'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => applyForm({ ...form, mode: m })}
                className={`rounded px-1.5 py-0.5 text-[10px] capitalize ${
                  form.mode === m
                    ? 'bg-sky-700 text-white'
                    : 'bg-bg-elevated text-text-muted hover:text-text-primary'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {form.mode === 'hourly' && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-secondary">
              <span>Every</span>
              <input
                type="number"
                min={1}
                max={23}
                value={form.everyHours}
                onChange={(e) =>
                  applyForm({ ...form, everyHours: Math.min(23, Math.max(1, Number(e.target.value))) })
                }
                className="w-12 rounded border border-border-subtle bg-bg-base px-1 py-0.5 text-center text-text-primary"
              />
              <span>hour(s) at minute</span>
              <input
                type="number"
                min={0}
                max={59}
                value={form.minuteOfHour}
                onChange={(e) =>
                  applyForm({ ...form, minuteOfHour: Math.min(59, Math.max(0, Number(e.target.value))) })
                }
                className="w-12 rounded border border-border-subtle bg-bg-base px-1 py-0.5 text-center text-text-primary"
              />
            </div>
          )}

          {form.mode === 'daily' && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-secondary">
              <span>At</span>
              <input
                type="number"
                min={0}
                max={23}
                value={form.dailyHour}
                onChange={(e) =>
                  applyForm({ ...form, dailyHour: Math.min(23, Math.max(0, Number(e.target.value))) })
                }
                className="w-12 rounded border border-border-subtle bg-bg-base px-1 py-0.5 text-center text-text-primary"
              />
              <span>:</span>
              <input
                type="number"
                min={0}
                max={59}
                value={form.dailyMinute}
                onChange={(e) =>
                  applyForm({ ...form, dailyMinute: Math.min(59, Math.max(0, Number(e.target.value))) })
                }
                className="w-12 rounded border border-border-subtle bg-bg-base px-1 py-0.5 text-center text-text-primary"
              />
              <span>UTC, every day</span>
            </div>
          )}

          {form.mode === 'weekly' && (
            <div className="space-y-2 text-[11px] text-text-secondary">
              <div className="flex flex-wrap items-center gap-2">
                <span>At</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={form.weeklyHour}
                  onChange={(e) =>
                    applyForm({ ...form, weeklyHour: Math.min(23, Math.max(0, Number(e.target.value))) })
                  }
                  className="w-12 rounded border border-border-subtle bg-bg-base px-1 py-0.5 text-center text-text-primary"
                />
                <span>:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={form.weeklyMinute}
                  onChange={(e) =>
                    applyForm({ ...form, weeklyMinute: Math.min(59, Math.max(0, Number(e.target.value))) })
                  }
                  className="w-12 rounded border border-border-subtle bg-bg-base px-1 py-0.5 text-center text-text-primary"
                />
                <span>UTC, on:</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {DOW_NAMES.map((name, idx) => {
                  const active = form.weeklyDays.includes(idx);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        const set = new Set(form.weeklyDays);
                        if (set.has(idx)) set.delete(idx);
                        else set.add(idx);
                        applyForm({ ...form, weeklyDays: Array.from(set).sort() });
                      }}
                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                        active
                          ? 'bg-sky-700 text-white'
                          : 'bg-bg-elevated text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {form.mode === 'monthly' && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-secondary">
              <span>On day</span>
              <input
                type="number"
                min={1}
                max={31}
                value={form.monthlyDay}
                onChange={(e) =>
                  applyForm({ ...form, monthlyDay: Math.min(31, Math.max(1, Number(e.target.value))) })
                }
                className="w-12 rounded border border-border-subtle bg-bg-base px-1 py-0.5 text-center text-text-primary"
              />
              <span>at</span>
              <input
                type="number"
                min={0}
                max={23}
                value={form.monthlyHour}
                onChange={(e) =>
                  applyForm({ ...form, monthlyHour: Math.min(23, Math.max(0, Number(e.target.value))) })
                }
                className="w-12 rounded border border-border-subtle bg-bg-base px-1 py-0.5 text-center text-text-primary"
              />
              <span>:</span>
              <input
                type="number"
                min={0}
                max={59}
                value={form.monthlyMinute}
                onChange={(e) =>
                  applyForm({ ...form, monthlyMinute: Math.min(59, Math.max(0, Number(e.target.value))) })
                }
                className="w-12 rounded border border-border-subtle bg-bg-base px-1 py-0.5 text-center text-text-primary"
              />
              <span>UTC</span>
            </div>
          )}
        </div>
      )}

      {inCustomMode && (
        <div className="rounded border border-border-subtle bg-bg-base/40 px-2 py-1.5 text-[11px] text-text-muted">
          Custom expression — form editor doesn't represent this exact shape. Use the raw input
          above or pick a preset.
        </div>
      )}
    </div>
  );
}
