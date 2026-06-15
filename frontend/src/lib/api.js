// 全前端唯一的后端地址来源（收敛散落的 base URL）
//
// - 开发：留空 → fetch('/api/...') 走 vite proxy → http://127.0.0.1:5000
// - 生产同源（nginx 反代）：留空即可
// - 前后端不同源：在 frontend/.env 配 VITE_API_BASE=https://api.your.domain
//
// 所有调后端的代码都从这里取 API_BASE，拼成 `${API_BASE}/api/xxx`，
// 这样切换部署环境只改一个地方。注意：这里只放地址，绝不放任何密钥。
export const API_BASE = import.meta.env.VITE_API_BASE || ''
