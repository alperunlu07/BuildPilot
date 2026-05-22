import { useEffect, useState } from 'react';

// Tailwind breakpoints — kept in sync with the default theme. Full set is
// listed so JS-driven layout decisions can branch on the same widths the
// utility classes do (responsive overhaul, Faz 0).
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

// Subscribe to a `(min-width: …px)` media query and return whether it matches.
// Used by responsive components that need to make layout decisions in JS
// (e.g. the sidebar swapping between "drawer" and "fixed pane" mode below
// `md`). On the server / initial render we default to `true` to keep
// desktop-first layouts; the first effect tick corrects the value.
export function useMinWidth(bp: Breakpoint): boolean {
  const query = `(min-width: ${BREAKPOINTS[bp]}px)`;
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const handler = (ev: MediaQueryListEvent) => setMatches(ev.matches);
    // Sync once in case the query changed between render + effect.
    setMatches(mql.matches);
    // Safari < 14 only supports addListener / removeListener.
    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, [query]);
  return matches;
}

// Convenience inverse — true on small screens (below md by default). Sidebar
// drawer mode + mobile log layouts use this.
export function useBelow(bp: Breakpoint = 'md'): boolean {
  return !useMinWidth(bp);
}
