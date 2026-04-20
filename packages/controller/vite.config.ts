import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command }) => ({
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
  // Production build is served by the server under /play/; dev stays at root.
  base: command === 'build' ? '/play/' : '/',
  server: {
    host: true,
    port: 5174,
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
    },
  },
}));
