import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
  // Always mount under /play/ so dev and prod URL structure match.
  // Direct dev: http://localhost:5174/play/. Through Express proxy:
  // http://localhost:3001/play/.
  base: '/play/',
  // Quiet the "Local/Network" URL banner — players should use the Express
  // proxy on :3001 (printed by the server), not this raw Vite :5174 address.
  // Warnings and errors still show.
  logLevel: 'warn',
  server: {
    host: true,
    port: 5174,
    // The Express dev proxy targets this exact port — fail loudly instead
    // of silently shifting to another port if 5174 is already taken.
    strictPort: true,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
      '/room-code': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/geo-images': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Slike mapa za Osvajanje — bez ovoga direktan :5174 crta praznu mapu.
      '/bitka-files': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
}));
