import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// UI v2 primitive — ports .field-select. Same paint as Input but with the
// native dropdown's chevron caret. Keeps the same border/focus semantics
// so a form mixing Input + Select rows lines up to the pixel.
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid = false, className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        'w-full h-7 px-2.5 pr-7 rounded-btn bg-bg-elevated border text-text-primary',
        'text-[12.5px] outline-none transition-colors duration-150 cursor-pointer',
        // SVG caret rendered as a background so the native picker still
        // works on every browser — appearance-none disables the platform
        // chevron, then we paint our own with var(--text-muted).
        "appearance-none bg-[length:14px_14px] bg-no-repeat bg-[right_8px_center]",
        'bg-[image:var(--select-chevron)]',
        invalid
          ? 'border-rose-500/60 focus:border-rose-500'
          : 'border-border focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]',
        className,
      )}
      style={{
        // Inline-style the chevron because Tailwind's url() arbitrary value
        // syntax doesn't compose with our token vars cleanly. The fill
        // colour intentionally reads from --text-muted so dark/light flip
        // automatically.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ['--select-chevron' as any]:
          `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14' fill='none' stroke='%238a94a6' stroke-width='1.5'><path d='M3.5 5.5L7 9l3.5-3.5'/></svg>")`,
      }}
      {...rest}
    >
      {children}
    </select>
  );
});
