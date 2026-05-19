export type ThemeChoice = 'system' | 'dark' | 'light';
export type Density = 'comfortable' | 'compact';

const THEME_KEY = 'buildpilot.theme';
const DENSITY_KEY = 'buildpilot.density';

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
