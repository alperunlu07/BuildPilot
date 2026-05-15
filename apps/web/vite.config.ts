import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
    open: true,
    proxy: {
      '/api': 'http://127.0.0.1:51731',
      '/events': {
        target: 'http://127.0.0.1:51731',
        changeOrigin: true,
      },
    },
  },
});
