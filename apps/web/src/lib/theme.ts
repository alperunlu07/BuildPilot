export type ThemeChoice = 'system' | 'dark' | 'light';
export type Density = 'comfortable' | 'compact';

const THEME_KEY = 'buildpilot.theme';
const DENSITY_KEY = 'buildpilot.density';
const ACCENT_KEY = 'buildpilot.accent';

// Brand accent picker default. Sourced from tokens.css :root --accent so
// the JS-side fallback can't drift away from the CSS-side fallback.
export const DEFAULT_ACCENT = '#0ea5e9';

export function readStoredTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'dark' || raw === 'light' || raw === 'system') return raw;
  } catch {
    // ignore
  }
  return 'dark';
}

export function writeStoredTheme(theme: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}

export function readStoredDensity(): Density {
  try {
    const raw = localStorage.getItem(DENSITY_KEY);
    if (raw === 'compact' || raw === 'comfortable') return raw;
  } catch {
    // ignore
  }
  return 'comfortable';
}

export function writeStoredDensity(d: Density): void {
  try {
    localStorage.setItem(DENSITY_KEY, d);
  } catch {
    // ignore
  }
}

export function resolveTheme(choice: ThemeChoice): 'dark' | 'light' {
  if (choice === 'system') {
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }
  return choice;
}

export function applyTheme(choice: ThemeChoice): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(choice);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('light', resolved === 'light');
  root.setAttribute('data-theme', resolved);
}

export function applyDensity(d: Density): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-density', d);
}

export function subscribeSystemTheme(cb: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => cb();
  mq.addEventListener?.('change', handler);
  return () => mq.removeEventListener?.('change', handler);
}

// ── Accent override (UI v2 Faz 1) ──────────────────────────────────────────
// Painting the runtime accent variants into the root inline style lets us
// repaint every component that reads var(--accent*) — buttons, focus rings,
// dot halos, pipeline-edge highlights — from a single Settings picker
// without rebuilding Tailwind.
//
// Ported from docs/designs/app.jsx:22-42, with a stricter hex validator so
// a malformed localStorage value can't poison the root <style>.
const HEX_RE = /^#([0-9a-fA-F]{6})$/;

export function readStoredAccent(): string {
  try {
    const raw = localStorage.getItem(ACCENT_KEY);
    if (raw && HEX_RE.test(raw)) return raw;
  } catch {
    // ignore
  }
  return DEFAULT_ACCENT;
}

export function writeStoredAccent(hex: string): void {
  if (!HEX_RE.test(hex)) return;
  try {
    localStorage.setItem(ACCENT_KEY, hex);
  } catch {
    // ignore
  }
}

export function applyAccent(hex: string): void {
  if (typeof document === 'undefined') return;
  if (!HEX_RE.test(hex)) return;
  const m = hex.slice(1);
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  // Mirror the four runtime variants every accent-consuming token uses.
  // Hover is a flat 12% darken — enough contrast against the base for a
  // hover state without sliding into a different hue.
  const darken = (v: number) => Math.max(0, Math.round(v * 0.88));
  const root = document.documentElement.style;
  root.setProperty('--accent', hex);
  root.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, 0.12)`);
  root.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.22)`);
  root.setProperty('--accent-hover', `rgb(${darken(r)}, ${darken(g)}, ${darken(b)})`);
}
