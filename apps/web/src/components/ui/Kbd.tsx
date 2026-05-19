import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// UI v2 primitive — used for keyboard-shortcut badges across the UI
// (sidebar "Jump to" ⌘K hint, command palette item shortcuts,
// settings page bind labels). Renders the design's <kbd>-shape glyph
// container with a mono font + subtle bg.
export interface KbdProps extends HTMLAttributes<HTMLElement> {
  // Inline-by-default; some consumers (the help dialog) want block.
  block?: boolean;
}

export const Kbd = forwardRef<HTMLElement, KbdProps>(function Kbd(
  { block = false, className, children, ...rest },
  ref,
) {
  return (
    <kbd
      ref={ref}
      className={cn(
        block ? 'inline-flex' : 'inline-flex',
        'items-center justify-center font-mono text-[10.5px] font-medium',
        'h-[18px] min-w-[18px] px-1 rounded',
        'bg-bg-elevated text-text-secondary border border-border',
        className,
      )}
      {...rest}
    >
      {children}
    </kbd>
  );
});
