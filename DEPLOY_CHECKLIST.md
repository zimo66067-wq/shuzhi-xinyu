# 数智心屿 · 部署检查清单 (Quick Reference)

## 准备阶段
- [ ] 已注册 Vercel 账号（用 GitHub 登录）
- [ ] 已注册 Render 账号（用 GitHub 登录）
- [ ] 准备好 DeepSeek API Key
- [ ] 准备好腾讯云 SecretId + SecretKey
- [ ] 设定家长端强密码（≥12 位，大小写+数字+符号）

## 部署步骤

### 1. 推送配置到 GitHub
```bash
git add vercel.json render.yaml .github/workflows/ .gitignore
git add backend/.env.example backend/runtime.txt backend/wsgi.py
git add frontend/.env.example
git commit -m "chore: cloud deployment setup"
git push origin main
```

### 2. Vercel 前端部署
- [ ] Vercel Dashboard → New Project → 导入 `zimo66067-wq/shuzhi-xinyu`
- [ ] 确认框架自动识别为 Vite
- [ ] 添加环境变量：`VITE_API_BASE` = `https://shuzhi-xinyu-api.onrender.com`
- [ ] 点击 Deploy，等待完成
- [ ] 记录域名：`https://__________.vercel.app`

### 3. Render 后端部署
- [ ] Render Dashboard → New → Blueprint
- [ ] 连接仓库 `zimo66067-wq/shuzhi-xinyu`
- [ ] 配置环境变量（5 个必须项）：
  - [ ] `DEEPSEEK_API_KEY`
  - [ ] `TENCENT_SECRET_ID`
  - [ ] `TENCENT_SECRET_KEY`
  - [ ] `PARENT_PASSWORD`
  - [ ] `CORS_ORIGINS` = `https://<vercel域名>.vercel.app,http://localhost:5173,http://127.0.0.1:5173`
- [ ] 点击 Create Web Service
- [ ] 验证：`curl https://shuzhi-xinyu-api.onrender.com/api/health`

### 4. 跨域回填
- [ ] 将 Vercel 域名填入 Render `CORS_ORIGINS`
- [ ] 将 Render API 域名填入 Vercel `VITE_API_BASE`
- [ ] Vercel 重新部署（修改环境变量自动触发）

### 5. 验证上线
- [ ] 浏览器访问 Vercel 域名，首页正常加载
- [ ] 对话功能正常（/api/chat）
- [ ] TTS/STT 正常（需麦克风权限）
- [ ] 家长后台登录正常

## 环境变量速查

| 平台 | Key | 值 |
|------|-----|-----|
| Vercel | `VITE_API_BASE` | `https://shuzhi-xinyu-api.onrender.com` |
| Render | `DEEPSEEK_API_KEY` | `sk-...` |
| Render | `TENCENT_SECRET_ID` | `AKID...` |
| Render | `TENCENT_SECRET_KEY` | `...` |
| Render | `PARENT_PASSWORD` | 强密码 |
| Render | `CORS_ORIGINS` | Vercel 域名 + localhost |
| Render | `FLASK_MAX_CONTENT_LENGTH` | `8388608` |

## 日常维护

```bash
# 更新代码
git add . && git commit -m "..." && git push origin main
# → 自动触发 Vercel + Render 部署

# 检查状态
curl https://shuzhi-xinyu-api.onrender.com/api/health
```

## 故障速查

| 现象 | 检查 |
|------|------|
| 页面空白 | Vercel 构建日志、dist/index.html |
| CORS 错误 | Render CORS_ORIGINS 是否包含 Vercel 域名 |
| API 500 | Render 日志、API Key 是否有效 |
| 首次很慢 | 正常冷启动，等 30-60 秒 |
