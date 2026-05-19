import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

// UI v2 primitive — ports docs/designs/styles.css .btn family. Variant +
// size + icon slots cover everything the design system reaches for:
// primary CTA, secondary action, ghost (toolbar / inline), danger, plus
// an icon-only mode for square toolbar buttons.
//
// We render Tailwind utilities backed by the v2 token namespace (var(--*))
// rather than the legacy .btn raw CSS classes. Same final paint, but the
// classes stay reusable and dark/light theme switches without a class swap.
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  // Optional leading / trailing visuals. Constrained to ReactNode so callers
  // can pass either a lucide icon component or a custom SVG glyph.
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  // When true, swap the children with a spinner glyph and disable the
  // button. We deliberately do NOT mutate the width — the caller is
  // responsible for sizing if a layout-stable variant is needed.
  loading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white border-transparent hover:bg-accent-hover',
  secondary:
    'bg-bg-elevated text-text-primary border-border hover:bg-bg-hover hover:border-border-emphasis',
  ghost:
    'text-text-secondary border-transparent hover:bg-bg-hover hover:text-text-primary',
  danger:
    // Danger has its own colour stack (rose) rather than chaining var(--*)
    // because the rose hues don't show up in the theme palette as tokens.
    'bg-rose-500/10 text-rose-300 border-rose-500/25 hover:bg-rose-500/[0.18]',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-6 px-2 text-[11.5px]',
  md: 'h-7 px-3 text-[12.5px]',
  lg: 'h-8 px-3.5 text-[13px]',
  icon: 'h-7 w-7 p-0 justify-center',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    leftIcon,
    rightIcon,
    loading = false,
    disabled,
    className,
    children,
    type,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-btn font-medium border whitespace-nowrap',
        'transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-40',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      ) : (
        leftIcon
      )}
      {size !== 'icon' && children}
      {!loading && rightIcon}
    </button>
  );
});
