import { GitBranch } from 'lucide-react';
import { cn } from '../lib/cn';

interface Props {
  value: string;
  onChange(branch: string): void;
  branches: string[];
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  withIcon?: boolean;
}

// Strict combobox for branch fields — no free-text entry. The current value
// is preserved as an option even if the project's branch list doesn't yet
// contain it (e.g. pipelines that watch a not-yet-fetched remote branch).
export function BranchSelect({
  value,
  onChange,
  branches,
  required,
  disabled,
  className,
  placeholder = '(select branch)',
  withIcon,
}: Props) {
  const options = value && !branches.includes(value) ? [value, ...branches] : branches;

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {withIcon && <GitBranch size={12} className="text-text-muted" />}
      <select
        value={value}
        required={required}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border-subtle bg-bg-panel px-2 py-1 font-mono text-xs text-text-primary focus:border-accent focus:outline-none disabled:opacity-50"
      >
        {!value && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
    </span>
  );
}
