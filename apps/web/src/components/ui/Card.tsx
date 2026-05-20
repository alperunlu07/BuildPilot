import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// UI v2 primitive — ports .card from docs/designs/styles.css. Interactive
// mode adds hover-lift styling for grid tiles + clickable rows. Header /
// footer slots are composition-time, not props, so callers can place
// arbitrary toolbars without an explicit `header?: ReactNode` API surface.
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  // When true, the card paints a hover-emphasis border + bg shift and
  // becomes a button-like interaction target (cursor pointer, focusable).
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive = false, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'bg-bg-panel border border-border-subtle rounded-card',
        interactive &&
          'cursor-pointer transition-[border-color,transform,background] duration-150 hover:border-border-emphasis hover:bg-bg-elevated',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});
