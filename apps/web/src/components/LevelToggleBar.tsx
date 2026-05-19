import type { BuildLogLevel } from '@buildpilot/shared-types';
import { cn } from '../lib/cn';

export const ALL_LEVELS: readonly BuildLogLevel[] = [
  'system',
  'info',
  'success',
  'failure',
  'stderr',
  'stdout',
];

// stdout is default-off because Unity / xcodebuild floods 25k+ lines per
// build, which freezes the browser tab. Users can re-enable it any time.
export const DEFAULT_HIDDEN_LEVELS: ReadonlySet<BuildLogLevel> = new Set(['stdout']);

export function defaultActiveLevels(): Set<BuildLogLevel> {
  return new Set(ALL_LEVELS.filter((l) => !DEFAULT_HIDDEN_LEVELS.has(l)));
}

interface Props {
  active: Set<BuildLogLevel>;
  onToggle(lvl: BuildLogLevel): void;
  // Compact = smaller buttons for inline use under tab strips.
  compact?: boolean;
}

const LEVEL_DOT: Record<BuildLogLevel, string> = {
  system: 'bg-text-muted',
  info: 'bg-sky-400',
  success: 'bg-emerald-400',
  failure: 'bg-rose-400',
  stderr: 'bg-amber-400',
  stdout: 'bg-text-faint',
};

export function LevelToggleBar({ active, onToggle, compact = false }: Props) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1', compact ? 'text-[10px]' : 'text-[11px]')}>
      {ALL_LEVELS.map((lvl) => {
        const on = active.has(lvl);
        return (
          <button
            key={lvl}
            type="button"
            onClick={() => onToggle(lvl)}
            className={cn(
              'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 uppercase tracking-wider transition-colors',
              on
                ? 'border-border-subtle bg-bg-elevated text-text-primary'
                : 'border-border-subtle bg-bg-panel text-text-muted hover:text-text-secondary',
            )}
            title={on ? `Hide ${lvl} entries` : `Show ${lvl} entries`}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', LEVEL_DOT[lvl])} />
            {lvl}
          </button>
        );
      })}
    </div>
  );
}
