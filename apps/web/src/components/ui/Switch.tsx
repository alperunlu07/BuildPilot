import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// UI v2 primitive — ports .switch + .switch-thumb. Implemented as a
// button so it picks up keyboard a11y for free (space toggles checked,
// focus-visible ring from the global rule in tokens.css).
export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onCheckedChange?: (next: boolean) => void;
  // Optional label rendered after the track. Most callers compose their
  // own label externally, but the inline form is handy for short toggles.
  label?: string;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, label, className, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'inline-flex items-center gap-2',
        disabled && 'cursor-not-allowed opacity-40',
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          'relative inline-block w-8 h-[18px] rounded-full border transition-colors duration-150',
          checked
            ? 'bg-accent border-accent'
            : 'bg-bg-elevated border-border',
        )}
      >
        <span
          className={cn(
            'absolute top-[1px] left-[1px] w-3.5 h-3.5 rounded-full transition-transform duration-150',
            checked ? 'translate-x-[14px] bg-white' : 'bg-text-secondary',
          )}
        />
      </span>
      {label && <span className="text-[12.5px] text-text-secondary">{label}</span>}
    </button>
  );
});
