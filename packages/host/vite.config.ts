import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => ({
  plugins: [react()],
  // Always mount under /host/ so dev and prod URL structure match.
  // Direct dev: http://localhost:5173/host/. Through Express proxy:
  // http://localhost:3001/host/. Without this prefix in dev, asset URLs
  // from index.html would resolve to /main.tsx (no prefix) which the
  // dev proxy can't route back to Vite.
  base: '/host/',
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/geo-images': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
}));
