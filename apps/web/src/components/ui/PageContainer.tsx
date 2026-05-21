import { type ReactNode } from 'react';
import { cn } from '../../lib/cn';

// Responsive overhaul Faz 0 — standard page shell.
//
// Pages currently apply their own `px-6 py-6 max-w-[1500px] mx-auto`
// (BuildsPage) or skip padding entirely (PipelinePage). The mix means
// small screens see either fixed 24px gutters (~7% of a 320px viewport)
// or no padding at all. This wrapper standardises the gutter scale and
// the max-width cap.
//
//   - phone (<640px):  px-3   12px gutter  (308px content on 320px)
//   - tablet (sm):     px-4   16px gutter
//   - desktop (md+):   px-6   24px gutter
//   - max content:     1500px  centred via mx-auto
//
// Pass `wide` for pages that intentionally stretch to fill (settings,
// pipeline editor, log viewers). Pass `flush` to skip horizontal padding
// entirely (full-bleed canvases).
export interface PageContainerProps {
  children: ReactNode;
  className?: string;
  wide?: boolean;
  flush?: boolean;
  // Pages that own their own vertical rhythm (e.g. tabs that scroll
  // inside) can opt out of py-* defaults.
  noPadY?: boolean;
}

export function PageContainer({
  children,
  className,
  wide = false,
  flush = false,
  noPadY = false,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        !flush && 'px-3 sm:px-4 md:px-6',
        !noPadY && 'py-4 sm:py-5 md:py-6',
        !wide && 'max-w-[1500px] mx-auto',
        wide && 'w-full',
        className,
      )}
    >
      {children}
    </div>
  );
}
