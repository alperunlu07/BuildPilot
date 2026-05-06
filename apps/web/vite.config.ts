import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 49832,
    strictPort: true,
    open: true,
    proxy: {
      '/api': 'http://127.0.0.1:49831',
      '/events': {
        target: 'http://127.0.0.1:49831',
        changeOrigin: true,
      },
    },
  },
});
