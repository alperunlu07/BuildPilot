import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// UI v2 primitive — ports .dot from docs/designs/styles.css. Variant
// follows the build/step status legend used everywhere in the app.
export type StatusDotVariant =
  | 'success'
  | 'failed'
  | 'running'
  | 'pending'
  | 'cancel'
  | 'skipped';

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  variant: StatusDotVariant;
  // Default 7px matches the design's body-row treatment. Headers + larger
  // surfaces opt into a bigger dot via the `size` prop.
  size?: number;
}

const VARIANT_CLASSES: Record<StatusDotVariant, string> = {
  success: 'bg-status-success',
  failed: 'bg-status-failed',
  // Running gets a pulse animation tied to a keyframe in tokens.css; the
  // class hooks into the existing dot-running animation defined by the
  // designs/styles.css source. We replicate the keyframe inline below so
  // primitives ship self-contained.
  running: 'bg-status-running animate-pulse-dot shadow-[0_0_0_0_var(--st-running)]',
  pending: 'bg-status-pending',
  cancel: 'bg-status-cancel',
  skipped: 'bg-status-skipped',
};

export const StatusDot = forwardRef<HTMLSpanElement, StatusDotProps>(
  function StatusDot({ variant, size = 7, className, style, ...rest }, ref) {
    return (
      <span
        ref={ref}
        aria-hidden
        className={cn(
          'inline-block rounded-full shrink-0',
          VARIANT_CLASSES[variant],
          className,
        )}
        style={{ width: size, height: size, ...style }}
        {...rest}
      />
    );
  },
);
