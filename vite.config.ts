import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const basePath = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa.svg'],
      manifest: {
        name: 'PileCue',
        short_name: 'PileCue',
        description: 'Photo-first item sorting for cleanup jobs.',
        theme_color: '#f5f7f2',
        background_color: '#f5f7f2',
        display: 'standalone',
        orientation: 'portrait',
        start_url: basePath,
        scope: basePath,
        icons: [
          {
            src: `${basePath}pwa.svg`,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: `${basePath}index.html`
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  test: {
    environment: 'jsdom'
  },
  build: {
    chunkSizeWarningLimit: 1200
  }
})
