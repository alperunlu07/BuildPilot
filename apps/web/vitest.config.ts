import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest config for the web app — uses jsdom so React Testing Library can
// render components into a virtual DOM, mirroring browser behaviour. The
// setup file installs `@testing-library/jest-dom` matchers and resets DOM
// state between tests.
//
// Note: vitest@2 ships against vite@5 types, but the rest of the web app
// runs on vite@6. The plugin shape is identical at runtime; we widen the
// types here to bridge the two versions.
export default defineConfig({
  plugins: [react() as never],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    // RTL leaks timers in some components (toasts, intersection observers,
    // SSE polling) — fake timers across the board would be too aggressive,
    // so we restore them per-test as needed instead.
    restoreMocks: true,
    clearMocks: true,
  },
});
