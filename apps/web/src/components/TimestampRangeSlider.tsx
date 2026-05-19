import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';

interface Props {
  // Outer build bounds — slider clamps to this. ms epoch.
  min: number;
  max: number;
  // Current selected window. Pass [min, max] to "no filter".
  value: [number, number];
  onChange(next: [number, number]): void;
  // Compact = thinner track + smaller handles for the BuildLogPanel.
  compact?: boolean;
}

// Dual-handle range slider over a build's start → end timestamps. Used to
// scope the log view to a window for hour-long Unity builds.
//
// Pure pointer-events implementation (no react-aria) so the bundle stays
// small; handle keyboard arrows for accessibility.
export function TimestampRangeSlider({ min, max, value, onChange, compact = false }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<'min' | 'max' | null>(null);

  const span = Math.max(1, max - min);
  const lowPct = ((value[0] - min) / span) * 100;
  const highPct = ((value[1] - min) / span) * 100;

  const setFromClient = useCallback(
    (which: 'min' | 'max', clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const ts = Math.round(min + pct * span);
      if (which === 'min') {
        onChange([Math.min(ts, value[1] - 1), value[1]]);
      } else {
        onChange([value[0], Math.max(ts, value[0] + 1)]);
      }
    },
    [min, span, value, onChange],
  );

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => setFromClient(drag, e.clientX);
    const onUp = () => setDrag(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, setFromClient]);

  // Keyboard nudges — 1% of the span per arrow key, 10% with shift.
  const nudge = (which: 'min' | 'max', dir: -1 | 1, big: boolean) => {
    const step = Math.max(1, Math.round(span * (big ? 0.1 : 0.01))) * dir;
    if (which === 'min') {
      onChange([Math.max(min, Math.min(value[1] - 1, value[0] + step)), value[1]]);
    } else {
      onChange([value[0], Math.min(max, Math.max(value[0] + 1, value[1] + step))]);
    }
  };

  const reset = () => onChange([min, max]);
  const isFull = value[0] <= min && value[1] >= max;

  const handleSize = compact ? 'h-3 w-3' : 'h-4 w-4';
  const trackHeight = compact ? 'h-1.5' : 'h-2';

  return (
    <div className="flex items-center gap-2 text-[10px] text-slate-400">
      <span className="font-mono text-slate-400">{fmtClock(value[0])}</span>
      <div className="relative flex-1">
        <div
          ref={trackRef}
          className={cn('relative w-full rounded-full bg-slate-800', trackHeight)}
        >
          <div
            className="absolute inset-y-0 rounded-full bg-sky-700/70"
            style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
          />
          <Handle
            pct={lowPct}
            size={handleSize}
            label={`Window start: ${fmtClock(value[0])}`}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDrag('min');
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') { e.preventDefault(); nudge('min', -1, e.shiftKey); }
              else if (e.key === 'ArrowRight') { e.preventDefault(); nudge('min', 1, e.shiftKey); }
            }}
          />
          <Handle
            pct={highPct}
            size={handleSize}
            label={`Window end: ${fmtClock(value[1])}`}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDrag('max');
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') { e.preventDefault(); nudge('max', -1, e.shiftKey); }
              else if (e.key === 'ArrowRight') { e.preventDefault(); nudge('max', 1, e.shiftKey); }
            }}
          />
        </div>
      </div>
      <span className="font-mono text-slate-400">{fmtClock(value[1])}</span>
      <button
        type="button"
        onClick={reset}
        disabled={isFull}
        className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-400 hover:border-sky-500 hover:text-sky-300 disabled:opacity-40"
        title="Reset to full build duration"
      >
        reset
      </button>
    </div>
  );
}

function Handle({
  pct,
  size,
  label,
  onPointerDown,
  onKeyDown,
}: {
  pct: number;
  size: string;
  label: string;
  onPointerDown(e: React.PointerEvent): void;
  onKeyDown(e: React.KeyboardEvent): void;
}) {
  return (
    <button
      type="button"
      role="slider"
      aria-label={label}
      aria-valuetext={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={cn(
        'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border border-sky-300 bg-sky-500 shadow ring-offset-1 ring-offset-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-400 active:cursor-grabbing',
        size,
      )}
      style={{ left: `${pct}%` }}
      title={label}
    />
  );
}

function fmtClock(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
