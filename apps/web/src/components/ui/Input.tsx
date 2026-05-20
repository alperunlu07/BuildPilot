import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// UI v2 primitive — ports .input from docs/designs/styles.css. Plain
// wrapper around <input> with the design's 28px height, 6px radius,
// accent focus ring. Used by every form across the app.
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className, type, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type ?? 'text'}
      className={cn(
        'w-full h-7 px-2.5 rounded-btn bg-bg-elevated border text-text-primary',
        'text-[12.5px] outline-none transition-colors duration-150',
        'placeholder:text-text-faint',
        invalid
          ? 'border-rose-500/60 focus:border-rose-500 focus:shadow-[0_0_0_3px_rgba(244,63,94,0.12)]'
          : 'border-border focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]',
        className,
      )}
      {...rest}
    />
  );
});
