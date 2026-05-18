import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { statusLabel } from '../lib/statusIcon';

// 30-cell coloured strip rendering the most recent builds for a project.
// Newest-on-the-right; missing slots from the left are rendered as empty
// chips so the strip width stays stable across projects.

type Cell = {
  id: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
};

interface Props {
  projectId: string;
  cells?: number;
}

const STATUS_COLOUR: Record<Cell['status'], string> = {
  pending: 'bg-slate-700',
  running: 'bg-sky-500/80',
  success: 'bg-emerald-500/80',
  failed: 'bg-rose-500/80',
  cancelled: 'bg-amber-500/60',
};

export function BuildSparkline({ projectId, cells = 30 }: Props) {
  const [items, setItems] = useState<Cell[] | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .projectSparkline(projectId, cells)
      .then((r) => {
        if (alive) setItems(r);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, [projectId, cells]);

  if (items === null) return null;
  // Pad with empty slots on the left so the rightmost cell is always "newest".
  const padded: (Cell | null)[] = [
    ...Array.from({ length: Math.max(0, cells - items.length) }, () => null),
    ...items,
  ];
  return (
    <div
      className="flex items-end gap-[2px]"
      title={`${items.length} of last ${cells} builds`}
      role="img"
      aria-label={`Sparkline of last ${items.length} builds`}
    >
      {padded.map((cell, i) => (
        <span
          key={cell?.id ?? `empty-${i}`}
          className={
            cell
              ? `h-3 w-1 rounded-sm ${STATUS_COLOUR[cell.status]}`
              : 'h-3 w-1 rounded-sm bg-slate-800/60'
          }
          // No icon — too small to render — but `title` + `aria-label`
          // surface the status so screen readers and color-blind users still
          // get the signal.
          title={cell ? statusLabel(cell.status) : 'no build'}
          aria-label={cell ? statusLabel(cell.status) : 'no build'}
        />
      ))}
    </div>
  );
}
