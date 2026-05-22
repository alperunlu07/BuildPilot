import { type CSSProperties, type ReactNode } from 'react';
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
//   - max content:     1500px  centred via mx-auto (override via maxWidth)
//
// Pass `wide` for pages that intentionally stretch to fill (settings,
// pipeline editor, log viewers). Pass `flush` to skip horizontal padding
// entirely (full-bleed canvases). Pass `maxWidth` (e.g. "1400px",
// "1200px", "920px") to cap content at a non-default width without
// fighting the default max-w-[1500px] utility through Tailwind class
// ordering.
export interface PageContainerProps {
  children: ReactNode;
  className?: string;
  wide?: boolean;
  flush?: boolean;
  // Pages that own their own vertical rhythm (e.g. tabs that scroll
  // inside) can opt out of py-* defaults.
  noPadY?: boolean;
  // Override the default 1500px content cap. Pass any CSS length string.
  // Ignored when `wide` is true.
  maxWidth?: string;
}

export function PageContainer({
  children,
  className,
  wide = false,
  flush = false,
  noPadY = false,
  maxWidth,
}: PageContainerProps) {
  // Apply maxWidth as an inline style so it always wins over the default
  // utility class — avoids the Tailwind class-order ambiguity where
  // `className="max-w-[1400px]"` competes with `max-w-[1500px]` and
  // whichever appears later in the generated CSS wins.
  const style: CSSProperties | undefined =
    !wide && maxWidth ? { maxWidth } : undefined;
  return (
    <div
      style={style}
      className={cn(
        !flush && 'px-3 sm:px-4 md:px-6',
        !noPadY && 'py-4 sm:py-5 md:py-6',
        !wide && !maxWidth && 'max-w-[1500px]',
        !wide && 'mx-auto',
        wide && 'w-full',
        className,
      )}
    >
      {children}
    </div>
  );
}
