import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'JA11 Studio — Live PEQ & DAC Controller',
        short_name: 'JA11 Studio',
        description: 'Offline/Online Real-time PEQ, FiiO XML Vault & Hardware Volume Controller for FiiO/JadeAudio JA11',
        theme_color: '#090d16',
        background_color: '#090d16',
        display: 'standalone',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5178,
    proxy: {
      '/api/fiio': {
        target: 'https://fiiocontrol.fiio.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fiio/, ''),
        headers: {
          Origin: 'https://fiiocontrol.fiio.com',
          Referer: 'https://fiiocontrol.fiio.com/equalizer/hand-picked',
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
