import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

// Ports docs/designs/extras.css `.settings-row` — a label/hint column on
// the left, a control slot on the right. Rows live inside a
// SettingsGroup body so the borders compose into a list.
export interface SettingsRowProps {
  label: ReactNode;
  hint?: ReactNode;
  // The interactive control (input, switch, button row, etc.). Receives
  // shrink-0 + a max width via parent flex so long labels truncate
  // before the control gets squeezed.
  control: ReactNode;
  // `danger` shifts the row background to a faint rose tint — used for
  // destructive actions like "Rotate master key".
  danger?: boolean;
}

export function SettingsRow({ label, hint, control, danger = false }: SettingsRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-4 py-3',
        'border-b border-border-subtle last:border-b-0',
        danger && 'bg-rose-500/[0.04]',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[12.5px] font-medium text-text-primary">{label}</span>
        {hint && (
          <span className="text-[11.5px] leading-snug text-text-muted">{hint}</span>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
