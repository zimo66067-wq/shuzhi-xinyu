import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// 数智心屿 · Vite 构建配置
//
// 1. dev server proxy：开发期 fetch('/api/...') → http://localhost:5000
//    （前端代码全部用相对路径；部署时 nginx 反代承担同样工作）
// 2. esbuild drop：构建期移除所有 console.* / debugger
// 3. PWA：可"添加到主屏幕"，离线缓存 app shell（不缓存大模型/wasm，按需下载）

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',          // SW 自动更新，用户无感
      injectRegister: 'auto',              // 自动注入 SW 注册代码到 index.html
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '数智心屿',
        short_name: '心屿',
        description: 'AI 数字人陪伴式社交对话练习 · 面向自闭症谱系儿童的辅助练习',
        lang: 'zh-CN',
        theme_color: '#FFD4D4',
        background_color: '#FFF5E6',
        display: 'standalone',             // 全屏，无浏览器地址栏
        orientation: 'portrait',           // 竖屏（移动端设计）
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 只预缓存 app shell（小文件）；大模型/wasm/basis 不预缓存，首次访问按需下载
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}', 'pwa-*.png', 'apple-touch-icon.png'],
        globIgnores: ['**/models/**', '**/mediapipe/**', '**/basis/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // /api 请求绝不走 SPA 离线 fallback（必须打到真实后端）
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,                    // 开发模式不启用 PWA（避免缓存干扰热更新）
      },
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: false,
      },
    },
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
})
