import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon-64-v3.png', 'apple-touch-icon-v3.png', 'icon-192-v3.png', 'icon-512-v3.png'],
      manifest: {
        name: 'MdRWer — Markdown Reader and Writer',
        short_name: 'MdRWer',
        description: '読むことを中心にした、オフライン対応Markdownノート',
        theme_color: '#f4f0e7',
        background_color: '#f4f0e7',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        icons: [
          { src: 'icon-192-v3.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512-v3.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true
      }
    })
  ]
})
