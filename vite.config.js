import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages にデプロイする場合、リポジトリ名に合わせて base を変更してください
// 例: https://<user>.github.io/gacha-tracker/ の場合 base: '/gacha-tracker/'
export default defineConfig({
  base: '/gacha-tracker/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: '召喚録 - 課金管理台帳',
        short_name: '召喚録',
        description: 'スマホゲームの課金・ガチャ結果を管理するアプリ',
        theme_color: '#161B2E',
        background_color: '#161B2E',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
})
