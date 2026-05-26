import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Production build is served by the server under /host/ so the public
  // root `/` can redirect players straight to /play without ever loading
  // the host bundle. Dev stays at `/` (vite dev server, port 5173).
  base: command === 'build' ? '/host/' : '/',
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
