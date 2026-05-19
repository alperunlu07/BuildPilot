import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

// UI v2 primitive — ports .pill from docs/designs/styles.css. The variant
// drives both the colour wash AND the text colour; we keep the variant
// names aligned with the status enum (success/failed/running/pending) plus
// two non-status accents (accent/warn/neutral) used in lists + headers.
export type BadgeVariant =
  | 'success'
  | 'failed'
  | 'running'
  | 'pending'
  | 'accent'
  | 'warn'
  | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  // Optional 12px icon glyph rendered before the text. Sized inline via the
  // gap-1 wrapper so callers don't need to pre-size their SVGs.
  icon?: ReactNode;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success:
    'bg-emerald-400/10 text-emerald-300 border-emerald-400/25',
  failed:
    'bg-rose-400/10 text-rose-300 border-rose-400/25',
  running:
    'bg-amber-400/10 text-amber-300 border-amber-400/30',
  pending:
    'bg-bg-elevated text-text-muted border-border',
  accent:
    'bg-accent-soft text-accent border-accent-soft',
  warn:
    'bg-amber-400/10 text-amber-300 border-amber-400/25',
  neutral:
    'bg-bg-elevated text-text-secondary border-border',
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = 'neutral', icon, className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 rounded px-[7px] h-[19px]',
        'text-[10.5px] font-medium tracking-tight border',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
});
