import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': path.resolve(import.meta.dirname, '../shared') },
  },
  server: {
    host: true,
    port: 5173,
    // Chuyển tiếp tới Worker chạy bằng 'wrangler dev'
    proxy: {
      '/ws': { target: 'http://localhost:8787', ws: true },
      '/api': 'http://localhost:8787',
    },
  },
});
