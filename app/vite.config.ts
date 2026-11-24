import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH postavlja GitHub Actions (npr. /rezije/ za GitHub Pages)
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Režije',
        short_name: 'Režije',
        description: 'Praćenje režija, obroka i kredita',
        lang: 'hr',
        theme_color: '#2a78d6',
        background_color: '#f9f9f7',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png}'], navigateFallbackDenylist: [/^\/api/] },
    }),
  ],
  server: { port: 5180 },
});
