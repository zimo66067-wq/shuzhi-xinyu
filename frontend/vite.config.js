import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 数智心屿 · Vite 构建配置
//
// 1. dev server proxy：开发期 fetch('/api/...') → http://localhost:5000
//    （前端代码全部用相对路径；部署时 nginx 反代承担同样工作）
// 2. esbuild drop：构建期移除所有 console.* / debugger，避免线上泄漏调试信息（低危 #16 + #19）
// 3. dev server 仅本机访问；想局域网调试请用 npm run dev -- --host

export default defineConfig({
  plugins: [react()],
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
    // 生产构建剥离 console.log/debug/info/warn 与 debugger 语句
    drop: ['console', 'debugger'],
  },
  build: {
    // 控制 chunk 警告阈值（项目体积较大但目前不影响交付）
    chunkSizeWarningLimit: 1600,
  },
})
