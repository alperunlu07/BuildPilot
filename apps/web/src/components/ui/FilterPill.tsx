import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

// UI v2 primitive — used by the Builds list filter row. Renders the
// pill-shaped attached-dropdown style ("Status: Running ▾") used in the
// design's screens.css.
//
// Active = at least one value is selected; renders with the accent text
// + border + soft background so the user sees instantly what's filtered.
// `value` shadows the native button attribute (which is string | number |
// readonly string[]) so we omit it first, then redeclare with ReactNode.
export interface FilterPillProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  // Static prefix label ("Status:" / "Branch:" / "Lane:"). Always rendered.
  label: string;
  // Selected value summary ("Running", "2 selected", "main", ...). When
  // undefined the pill shows just the label (still clickable).
  value?: ReactNode;
  active?: boolean;
}

export const FilterPill = forwardRef<HTMLButtonElement, FilterPillProps>(
  function FilterPill({ label, value, active = false, className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-pill text-[11.5px] font-medium',
          'border transition-colors duration-150',
          active
            ? 'bg-accent-soft text-accent border-accent'
            : 'bg-bg-elevated text-text-secondary border-border hover:border-border-emphasis hover:text-text-primary',
          className,
        )}
        {...rest}
      >
        <span className={cn('text-text-muted', active && 'text-accent/80')}>
          {label}
        </span>
        {value && <span>{value}</span>}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M2.5 4l2.5 2.5L7.5 4" />
        </svg>
      </button>
    );
  },
);
