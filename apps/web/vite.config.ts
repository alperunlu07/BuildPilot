import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies /api + /events to the BuildPilot server. The port
// defaults to 51731 (matching server config) but can be overridden via the
// BUILDPILOT_API_PORT env var so the E2E fixture can spin up a server on a
// dedicated port without colliding with a local dev instance.
const apiPort = process.env.BUILDPILOT_API_PORT
  ? Number(process.env.BUILDPILOT_API_PORT)
  : 51731;
const apiTarget = `http://127.0.0.1:${apiPort}`;
// When E2E is driving the dev server we don't want Vite to pop a browser
// window or fail on a busy port (the fixture picks the port deliberately).
const isE2E = process.env.BUILDPILOT_API_PORT !== undefined;

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          xyflow: ['@xyflow/react'],
          icons: ['lucide-react'],
          dates: ['date-fns'],
        },
      },
    },
  },
  server: {
    // Bind to IPv4 explicitly — Vite 6 sometimes binds to ::1 only, but
    // Windows resolves `localhost` to 127.0.0.1, which then fails to
    // connect. Pinning to 127.0.0.1 avoids the IPv4/IPv6 mismatch.
    host: '127.0.0.1',
    port: 51732,
    strictPort: true,
    open: !isE2E,
    proxy: {
      // Match `/api/...` strictly so SPA routes that happen to start
      // with `/api` (e.g. `/api-tokens`) keep going to the dev server
      // and not the backend. Vite's string proxy is a *prefix* match,
      // so plain `'/api'` would also forward `/api-tokens`.
      '^/api(/|$)': {
        target: apiTarget,
        changeOrigin: false,
      },
      '/events': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
