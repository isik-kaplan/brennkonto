import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Update the cached app shell in the background and pick it up on next load, rather than
      // asking every user to confirm a "new version available" prompt - the app has no offline
      // data to protect from a version skew, so silent-update is the low-friction choice.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'brennkonto',
        short_name: 'brennkonto',
        description: 'A calorie and macro tracker.',
        // Matches index.html's <meta name="theme-color"> and the light-mode --color-paper/--color-bg
        // tokens - the manifest can't reference CSS custom properties, so this is a plain hex copy.
        theme_color: '#f7f0e4',
        background_color: '#f7f0e4',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precaches the built JS/CSS/HTML app shell automatically. The two Google-Fonts-style CDN
        // hosts loaded from index.html aren't part of the build output, so they need their own
        // runtime-caching rules to still be available offline after the first successful load.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(fonts\.googleapis\.com|api\.fontshare\.com)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-files',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  // `vite preview` (serving the production build locally, the only mode that actually registers
  // the service worker - see registerType above) doesn't inherit server.proxy, so it needs its
  // own copy or every /api call 404s against the static file server instead of reaching the
  // backend. Production itself needs neither: the Dockerfile serves the built SPA and the API
  // from one process.
  preview: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  build: {
    outDir: 'dist',
  },
})
