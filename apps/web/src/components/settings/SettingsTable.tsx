import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

// Ports docs/designs/extras.css `.settings-table`. A compact list view
// used by Security (encrypted fields list) and Lanes (lane / cap /
// active-now triplets). Each column has a `width` that maps to the
// per-cell flex basis so a header + rows line up without measuring.

export type SettingsTableColumn = {
  id: string;
  label: ReactNode;
  // CSS width (e.g. "200px") or "flex" for the stretchy column. The
  // last "flex" column always picks up remaining space.
  width?: string;
  // align: text-align on header AND cells.
  align?: 'left' | 'right' | 'center';
};

export interface SettingsTableProps {
  columns: SettingsTableColumn[];
  children: ReactNode;
}

export function SettingsTable({ columns, children }: SettingsTableProps) {
  return (
    <div className="flex flex-col">
      <div
        className={cn(
          'flex items-center gap-3 border-b border-border-subtle bg-bg-elevated px-3.5 py-2',
          'text-[10.5px] font-medium uppercase tracking-wider text-text-muted',
        )}
      >
        {columns.map((col) => (
          <div
            key={col.id}
            style={col.width ? { width: col.width, flexShrink: 0 } : { flex: 1, minWidth: 0 }}
            className={cn(
              col.align === 'right' && 'text-right',
              col.align === 'center' && 'text-center',
            )}
          >
            {col.label}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

export interface SettingsTableRowProps {
  // Cells must match the column order. Use `null` to leave a cell
  // blank without breaking column alignment.
  cells: ReactNode[];
  columns: SettingsTableColumn[];
  // Optional row click → useful for "row is a link" patterns.
  onClick?: () => void;
}

export function SettingsTableRow({ cells, columns, onClick }: SettingsTableRowProps) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 border-b border-border-subtle px-3.5 py-2.5 last:border-b-0',
        'text-[12px] text-text-primary',
        interactive && 'cursor-pointer hover:bg-bg-hover',
      )}
    >
      {cells.map((cell, i) => {
        const col = columns[i];
        return (
          <div
            key={col?.id ?? i}
            style={col?.width ? { width: col.width, flexShrink: 0 } : { flex: 1, minWidth: 0 }}
            className={cn(
              col?.align === 'right' && 'text-right',
              col?.align === 'center' && 'text-center',
              'truncate',
            )}
          >
            {cell}
          </div>
        );
      })}
    </div>
  );
}
