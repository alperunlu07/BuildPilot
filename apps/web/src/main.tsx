import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PrimitivesPage } from './pages/__primitives';
import './index.css';
import './lib/i18n';
import {
  applyAccent,
  applyDensity,
  applyTheme,
  readStoredAccent,
  readStoredDensity,
  readStoredTheme,
} from './lib/theme';

applyTheme(readStoredTheme());
applyDensity(readStoredDensity());
applyAccent(readStoredAccent());

// Dev-only primitive catalog (Faz 2). Mounted at /__primitives — bypasses
// the App router entirely so the page can be inspected without store
// boot or auth. Vite tree-shakes import.meta.env.DEV so prod builds
// drop the PrimitivesPage import.
const showPrimitives =
  import.meta.env.DEV && window.location.pathname === '/__primitives';

// PWA service worker (Cluster 10.G). Register after the first paint so the
// SW registration never competes with React hydration for main-thread time.
// We skip registration in dev because Vite serves modules off /@vite — a
// service worker would aggressively cache stale module URLs and break HMR.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // Non-fatal: the app works without the SW; we just lose offline-shell
      // + install prompt eligibility. Surface to console so we notice in dev.
      console.warn('[buildpilot] service worker registration failed:', err);
    });
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('#root not found in index.html');

createRoot(root).render(
  <StrictMode>
    {showPrimitives ? (
      <div className="h-full overflow-y-auto bg-bg-base text-text-primary">
        <PrimitivesPage />
      </div>
    ) : (
      <App />
    )}
  </StrictMode>,
);
