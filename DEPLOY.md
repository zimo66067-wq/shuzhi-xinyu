# 数智心屿 · 免费云端部署完整手册

> 最后更新：2026-07-05
> 适用版本：v1.0
> 部署方案：Vercel（前端） + Render（后端） + GitHub Actions（CI/CD）

---

## 目录

1. [架构总览](#1-架构总览)
2. [部署架构图](#2-部署架构图)
3. [准备工作](#3-准备工作)
4. [第一步：前端 Vercel 部署](#4-第一步前端-vercel-部署)
5. [第二步：后端 Render 部署](#5-第二步后端-render-部署)
6. [第三步：追踪服务 Render 部署（可选）](#6-第三步追踪服务-render-部署可选)
7. [第四步：跨域配置与域名统一](#7-第四步跨域配置与域名统一)
8. [第五步：CI/CD 持续集成](#8-第五步-cicd-持续集成)
9. [环境变量完整列表](#9-环境变量完整列表)
10. [构建与启动命令参考](#10-构建与启动命令参考)
11. [免费层限制与应对策略](#11-免费层限制与应对策略)
12. [本地验证](#12-本地验证)
13. [常见问题排查](#13-常见问题排查)
14. [发布操作清单](#14-发布操作清单)

---

## 1. 架构总览

数智心屿采用"前端托管 + 后端 API + 可选追踪"三层架构，完全基于免费云服务：

```
┌─────────────────────────────────────────────────────┐
│                    用户浏览器                          │
│              https://xxx.vercel.app                  │
└───────────────┬─────────────────────────────────────┘
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
┌──────────────┐  ┌──────────────────┐
│  Vercel      │  │  Render           │
│  (前端静态)   │─▶│  shuzhi-xinyu-api │
│  React/Vite  │  │  Flask + Gunicorn │
│  PWA 离线    │  │  DeepSeek/TTS/STT │
└──────────────┘  └────────┬─────────┘
                           │ (可选)
                           ▼
                   ┌──────────────────┐
                   │  Render           │
                   │  shuzhi-xinyu-    │
                   │  track            │
                   │  FastAPI + SQLite │
                   └──────────────────┘
```

| 层级 | 平台 | 免费配额 | 配置文件 | 产物域名 |
|------|------|---------|----------|---------|
| 前端 | Vercel Hobby | 100GB 带宽/月 | `vercel.json` | `https://<project>.vercel.app` |
| 主后端 | Render Free | 750h/月，休眠机制 | `render.yaml` | `https://shuzhi-xinyu-api.onrender.com` |
| 追踪服务 | Render Free | 同上（共享额度） | `render.yaml`（repo 字段） | `https://shuzhi-xinyu-track.onrender.com` |
| CI/CD | GitHub Actions | 2000 分钟/月 | `.github/workflows/` | — |

---

## 2. 部署架构图

```
┌────────────────────────────────────────────────────────────┐
│                    GitHub 仓库                              │
│            zimo66067-wq/shuzhi-xinyu                       │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ vercel.json  │  │ render.yaml  │  │ .github/workflows│ │
│  │ (前端部署)    │  │ (后端部署)    │  │ (CI 检查)         │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘ │
└─────────┼─────────────────┼───────────────────┼───────────┘
          │                 │                   │
    git push main          │                   │
          │                 │                   │
          ▼                 ▼                   ▼
   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │ Vercel       │  │ Render       │  │ GitHub       │
   │ Auto Deploy  │  │ Auto Deploy  │  │ Actions      │
   │              │  │              │  │ 构建+测试     │
   │ npm ci       │  │ pip install  │  │              │
   │ npm run build│  │ gunicorn     │  │ ✅/❌        │
   └──────┬───────┘  └──────┬───────┘  └──────────────┘
          │                 │
          ▼                 ▼
   ┌──────────────┐  ┌──────────────┐
   │ 前端在线      │  │ API 在线      │
   │ xxx.vercel   │  │ xxx.onrender │
   │ .app         │  │ .com         │
   └──────────────┘  └──────────────┘
```

---

## 3. 准备工作

### 3.1 账号注册

| 平台 | 注册地址 | 说明 |
|------|---------|------|
| Vercel | https://vercel.com | 用 GitHub 账号登录即可 |
| Render | https://render.com | 用 GitHub 账号登录即可 |
| GitHub | https://github.com | 已有仓库 `zimo66067-wq/shuzhi-xinyu` |

### 3.2 必要信息收集

在开始部署前，确认以下信息已就绪：

- [ ] DeepSeek API Key（从 https://platform.deepseek.com/api_keys 获取）
- [ ] 腾讯云 SecretId + SecretKey（CAM 访问管理 → API 密钥）
- [ ] 家长端强密码（至少 12 位，包含大小写字母+数字+符号）
- [ ] GitHub 仓库地址：`https://github.com/zimo66067-wq/shuzhi-xinyu`

### 3.3 仓库先决条件

确保以下文件已提交到 `main` 分支：

```text
✅ vercel.json          — Vercel 前端部署配置
✅ render.yaml          — Render 后端部署配置
✅ .github/workflows/deployment-checks.yml — CI 检查
✅ frontend/package.json + package-lock.json
✅ backend/requirements.txt + runtime.txt
✅ backend/wsgi.py
✅ backend/.env.example
✅ frontend/.env.example
```

---

## 4. 第一步：前端 Vercel 部署

### 4.1 导入项目

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 **Add New → Project**
3. 授权并选择仓库 `zimo66067-wq/shuzhi-xinyu`
4. Vercel 自动检测到 `vercel.json`，框架识别为 Vite

### 4.2 确认构建配置

| 配置项 | 值 | 来源 |
|--------|-----|------|
| Framework | Vite | `vercel.json` |
| Install Command | `cd frontend && npm ci` | `vercel.json` |
| Build Command | `cd frontend && npm run build` | `vercel.json` |
| Output Directory | `frontend/dist` | `vercel.json` |
| Node.js Version | 20.x | `frontend/package.json` → `engines` |

### 4.3 配置环境变量

在 Vercel 项目 **Settings → Environment Variables** 中添加：

| Key | Value | 说明 |
|-----|-------|------|
| `VITE_API_BASE` | `https://shuzhi-xinyu-api.onrender.com` | 后端 API 地址 |

> ⚠️ `VITE_` 前缀的变量会打包进前端 JS，所有人都能看到。**绝对不能放任何密钥！**

### 4.4 部署

- 点击 **Deploy**，等待 1-2 分钟
- 部署成功后记录域名，例如 `https://shuzhi-xinyu.vercel.app`

### 4.5 验证

```bash
curl -I https://<your-project>.vercel.app
# 应返回 HTTP 200，并包含安全头：
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
```

---

## 5. 第二步：后端 Render 部署

### 5.1 Blueprint 方式（推荐）

1. 登录 [Render Dashboard](https://dashboard.render.com)
2. 点击 **New → Blueprint**
3. 连接仓库 `zimo66067-wq/shuzhi-xinyu`
4. Render 自动读取 `render.yaml` 并创建 `shuzhi-xinyu-api` 服务
5. **不要立刻部署**——先配置环境变量！

### 5.2 配置环境变量

在 Render 服务 **shuzhi-xinyu-api → Environment** 中配置：

#### 必须配置（❗）

| Key | 说明 | 示例 |
|-----|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | `sk-xxxxxxxxxxxxxxxx` |
| `TENCENT_SECRET_ID` | 腾讯云 SecretId | `AKIDxxxxxxxxxxxxxxxx` |
| `TENCENT_SECRET_KEY` | 腾讯云 SecretKey | `xxxxxxxxxxxxxxxx` |
| `PARENT_PASSWORD` | 家长端强密码 | `MyStr0ng!P@ssw0rd` |

#### 自动/推荐配置

| Key | 说明 | 值 |
|-----|------|-----|
| `PARENT_SECRET` | Token 签名密钥 | Blueprint 自动生成 |
| `CORS_ORIGINS` | 允许的前端域名 | `https://<vercel-domain>.vercel.app,http://localhost:5173` |
| `GUNICORN_LOG_LEVEL` | 日志级别 | `warning` |
| `FLASK_MAX_CONTENT_LENGTH` | 请求体上限 | `8388608`（8MB，支持 STT 音频） |

> ⚠️ **重要**：部署完成后，必须将 `CORS_ORIGINS` 中的 `<vercel-domain>` 替换为 Vercel 实际域名！

### 5.3 部署

- 配置完环境变量后，点击 **Create Web Service**
- 等待 2-3 分钟构建完成
- 检查日志确认 `gunicorn` 启动成功

### 5.4 验证

```bash
# 健康检查
curl https://shuzhi-xinyu-api.onrender.com/api/health
# 期望返回：{"status":"ok"}

# 对话接口测试
curl -X POST https://shuzhi-xinyu-api.onrender.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好"}]}'
# 期望返回：{"reply":"..."}
```

---

## 6. 第三步：追踪服务 Render 部署（可选）

追踪服务位于独立仓库 `zimo66067-wq/apology`。如果暂时不需要访问统计，可以跳过此步骤。

### 6.1 部署方式

**方式 A**（通过主仓库 Blueprint）：
- 主仓库的 `render.yaml` 已配置 `shuzhi-xinyu-track` 指向 `zimo66067-wq/apology`
- 确保 Render 账号有权限访问两个仓库

**方式 B**（单独导入）：
1. Render → New → Web Service
2. 连接仓库 `zimo66067-wq/apology`
3. 使用下表配置：

| 配置项 | 值 |
|--------|-----|
| Runtime | Python |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Health Check | `/api/health` |

### 6.2 环境变量

| Key | 必填 | 说明 |
|-----|------|------|
| `ADMIN_KEY` | 是 | 管理后台密钥 |
| `DATABASE_URL` | 是 | `sqlite:///./visits.db`（演示）或 Postgres 连接串 |

> ⚠️ SQLite 在 Render 免费实例上不可靠。重启/休眠/重新部署后数据丢失。需长期保留时改用免费 Postgres（如 Supabase、Neon.tech）。

---

## 7. 第四步：跨域配置与域名统一

### 7.1 回填域名（首次部署必须）

部署完成后，前后端的实际域名需要互相配置：

```
① Vercel 前端域名

② Render API 域名
   ↓
   步骤 1：复制 Vercel 生产的域名
   步骤 2：到 Render shuzhi-xinyu-api → Environment → 修改 CORS_ORIGINS
   步骤 3：复制 Render API 域名
   步骤 4：到 Vercel → Settings → Environment Variables → 修改 VITE_API_BASE
   步骤 5：Vercel 重新部署（修改环境变量后自动触发）
```

### 7.2 CORS 工作原理

```
浏览器请求链：
  https://xxx.vercel.app
    → fetch('https://shuzhi-xinyu-api.onrender.com/api/chat')
      → 浏览器先发 OPTIONS 预检请求
        → 后端检查 Origin 头是否在 CORS_ORIGINS 白名单
          → 是 → 返回 CORS 响应头，允许实际请求
          → 否 → 返回 403，浏览器阻止请求
```

### 7.3 统一访问入口

用户最终访问入口：**Vercel 前端域名**

```
https://shuzhi-xinyu.vercel.app
```

前端 JS 自动将 API 请求发往后端 Render 域名，用户无感知。

---

## 8. 第五步：CI/CD 持续集成

### 8.1 自动部署链路

```
git push origin main
  │
  ├─▶ GitHub Actions
  │     ├─ frontend-build: npm ci + npm run build
  │     ├─ backend-smoke: pip install + health check
  │     └─ frontend-lint: 代码结构验证
  │
  ├─▶ Vercel (auto-deploy)
  │     └─ 生产环境自动构建发布
  │
  └─▶ Render (auto-deploy)
        └─ 主 API 自动重建
```

### 8.2 触发条件

| 事件 | Vercel | Render | GitHub Actions |
|------|--------|--------|----------------|
| push 到 main | ✅ 生产部署 | ✅ 自动部署 | ✅ 运行检查 |
| Pull Request | ✅ 预览部署 | ❌ | ✅ 运行检查 |
| 手动触发 | ✅ Dashboard | ✅ Manual Deploy | ✅ workflow_dispatch |

### 8.3 查看部署状态

- **GitHub Actions**：仓库 → Actions 标签页
- **Vercel**：Dashboard → Deployments
- **Render**：Dashboard → shuzhi-xinyu-api → Events

---

## 9. 环境变量完整列表

### 前端（Vercel）

| Key | 必填 | 说明 | 示例 |
|-----|------|------|------|
| `VITE_API_BASE` | 是 | 后端 API 地址 | `https://shuzhi-xinyu-api.onrender.com` |

### 主后端（Render — shuzhi-xinyu-api）

| Key | 必填 | 默认值 | 说明 |
|-----|------|--------|------|
| `DEEPSEEK_API_KEY` | **是** | — | DeepSeek API Key |
| `TENCENT_SECRET_ID` | **是** | — | 腾讯云 SecretId |
| `TENCENT_SECRET_KEY` | **是** | — | 腾讯云 SecretKey |
| `PARENT_PASSWORD` | **是** | — | 家长端密码 |
| `PARENT_SECRET` | 推荐 | 自动生成 | Token 签名密钥（32 字节 hex） |
| `CORS_ORIGINS` | **是** | `localhost` | 允许的前端域名（逗号分隔） |
| `FLASK_MAX_CONTENT_LENGTH` | 否 | `1048576` | 请求体上限（字节），建议 8388608 |
| `GUNICORN_LOG_LEVEL` | 否 | `info` | 日志级别：debug/info/warning/error |
| `PORT` | — | Render 注入 | 监听端口，**不要手动设置** |

### 追踪服务（Render — shuzhi-xinyu-track）

| Key | 必填 | 默认值 | 说明 |
|-----|------|--------|------|
| `ADMIN_KEY` | **是** | — | 管理后台密钥 |
| `DATABASE_URL` | 是 | `sqlite:///./visits.db` | 数据库连接串 |
| `PORT` | — | Render 注入 | **不要手动设置** |

---

## 10. 构建与启动命令参考

### Vercel（前端）

```bash
# 安装依赖
cd frontend && npm ci

# 构建
cd frontend && npm run build

# 产物目录
frontend/dist/
```

### Render（主后端）

```bash
# 安装依赖
cd backend && pip install -r requirements.txt

# 启动（Gunicorn）
gunicorn app:app \
  --bind 0.0.0.0:$PORT \
  --worker-class sync \
  --workers 2 \
  --timeout 60 \
  --log-level $GUNICORN_LOG_LEVEL
```

### Render（追踪服务）

```bash
# 安装依赖
pip install -r requirements.txt

# 启动（Uvicorn）
uvicorn main:app --host 0.0.0.0 --port $PORT
```

### 本地开发

```bash
# 前端
cd frontend && npm run dev
# → http://localhost:5173（Vite dev server，自动代理 /api → localhost:5000）

# 后端
cd backend && python app.py
# → http://localhost:5000

# 追踪服务
cd apology-backend && uvicorn main:app --reload
# → http://localhost:8000
```

---

## 11. 免费层限制与应对策略

### 11.1 Render 免费层关键限制

| 限制项 | 说明 | 影响 |
|--------|------|------|
| **休眠机制** | 空闲 15 分钟后休眠 | 下次请求需要 30-60 秒冷启动 |
| **免费小时数** | 750 小时/月（约 31 天） | 一个服务刚好覆盖整月 |
| **多个服务** | 共享 750 小时 | 两个服务会提前耗尽 |
| **本地文件系统** | 临时存储，重启清空 | SQLite 数据不可靠 |

### 11.2 应对策略

**冷启动问题**：
```bash
# 方法 1：展示前手动唤醒
curl https://shuzhi-xinyu-api.onrender.com/api/health

# 方法 2：使用免费监控服务定期 ping（推荐 Kaffeine 或 cron-job.org）
# 频率：每 10-14 分钟一次，只 ping /api/health
# ⚠️ 不要同时保活追踪服务，否则两个服务消耗双倍免费小时数
```

**数据库持久化**：
```text
生产环境推荐使用免费 Postgres：
  - Supabase (https://supabase.com)：500MB 免费
  - Neon.tech (https://neon.tech)：0.5GB 免费
  - 将 DATABASE_URL 改为 Postgres 连接串
```

**突发流量**：
```text
- Vercel 100GB/月带宽，正常使用完全够用
- Render 速率限制配合 Flask-Limiter，防止 API 被刷
- DeepSeek API 注意余额充足
```

---

## 12. 本地验证

提交前先在本地验证所有配置正确：

### 12.1 前端构建验证

```bash
cd frontend
npm ci
npm run build

# 检查产物
ls -la dist/
# 应有：index.html, assets/, pwa-*.png, favicon.svg 等
```

### 12.2 后端冒烟测试

```bash
cd backend
pip install -r requirements.txt

# 导入测试
python -c "
from app import app
client = app.test_client()

# 健康检查
r = client.get('/api/health')
assert r.status_code == 200
assert r.get_json() == {'status': 'ok'}
print('✅ Health check passed')

# 家长鉴权
r = client.post('/api/parent/verify', json={'password': '1234'})
assert r.status_code == 200
assert 'token' in r.get_json()
print('✅ Parent auth passed')
"
```

### 12.3 配置文件验证

```bash
# 验证 YAML 语法
python -c "import yaml; yaml.safe_load(open('render.yaml')); print('✅ render.yaml valid')"

# 验证 JSON 语法
python -c "import json; json.load(open('vercel.json')); print('✅ vercel.json valid')"
```

---

## 13. 常见问题排查

### 13.1 前端页面空白

| 检查项 | 操作 |
|--------|------|
| Vercel 构建日志 | Dashboard → Deployments → 查看构建输出 |
| dist/index.html 存在 | 构建产物是否正确生成 |
| SPA 路由重写 | `vercel.json` 的 `rewrites` 配置是否生效 |
| 浏览器控制台 | 检查 JS 错误和网络请求 |

### 13.2 API 请求失败（CORS 错误）

```
错误信息：Access to fetch at '...' from origin '...' has been blocked by CORS
```

排查步骤：
1. 确认 Render 的 `CORS_ORIGINS` 包含完整的 Vercel 域名（含 `https://`）
2. 确认 Vercel 的 `VITE_API_BASE` 指向正确的 Render 域名
3. 确认 Vercel 修改环境变量后已**重新部署**

### 13.3 API 返回 500

```bash
# 检查 Render 日志
# Dashboard → shuzhi-xinyu-api → Logs

# 常见原因：
# 1. DEEPSEEK_API_KEY 为空或无效
# 2. 腾讯云密钥过期
# 3. 某个依赖安装失败
```

### 13.4 Render 首次请求很慢

- 正常现象：Free Web Service 休眠后的**冷启动**
- 等待 30-60 秒即可
- 后续请求恢复正常速度

### 13.5 GitHub Actions 构建失败

- 检查 Node.js 版本是否为 20.x
- 检查 `package-lock.json` 是否存在
- 检查 Python 版本是否为 3.12

---

## 14. 发布操作清单

### 首次部署

```bash
# 1. 确认所有配置文件已提交
git status

# 2. 提交部署配置
git add vercel.json render.yaml .github/workflows/deployment-checks.yml
git add backend/.env.example backend/runtime.txt backend/wsgi.py
git add frontend/.env.example
git commit -m "chore: production deployment configuration"

# 3. 推送到 main 分支
git push origin main

# 4. 等待 GitHub Actions 通过（约 2 分钟）

# 5. 按照第 4 节配置 Vercel
# 6. 按照第 5 节配置 Render
# 7. 按照第 7 节完成跨域回填
```

### 日常更新

```bash
# 修改代码后，直接 push 即可
git add .
git commit -m "feat: your change description"
git push origin main

# 自动触发：
# ✅ GitHub Actions 检查
# ✅ Vercel 前端自动构建发布
# ✅ Render 后端自动重建
```

### 回滚

```bash
# Vercel：Dashboard → Deployments → 选择上一个成功版本 → Promote to Production
# Render：Dashboard → Manual Deploy → Deploy a specific commit
```

---

## 附录 A：关键文件路径速查

```
项目根目录/
├── vercel.json                        ← Vercel 前端部署
├── render.yaml                        ← Render 后端部署
├── .github/workflows/
│   └── deployment-checks.yml          ← CI/CD 检查
├── DEPLOY.md                          ← 本文档
├── frontend/
│   ├── .env.example                   ← 前端环境变量模板
│   ├── vite.config.js                 ← Vite 构建配置
│   └── src/lib/api.js                 ← API 地址统一入口
├── backend/
│   ├── .env.example                   ← 后端环境变量模板
│   ├── app.py                         ← Flask 主入口
│   ├── wsgi.py                        ← Gunicorn WSGI 入口
│   ├── requirements.txt               ← Python 依赖
│   └── runtime.txt                    ← Python 版本声明
└── apology-backend/
    ├── .env.example                   ← 追踪服务环境变量
    └── railway.json                   ← Railway 备选方案
```

## 附录 B：平台官方文档链接

- Vercel 项目配置：https://vercel.com/docs/project-configuration
- Vercel Git 部署：https://vercel.com/docs/git
- Render Blueprint 规范：https://render.com/docs/blueprint-spec
- Render 免费实例：https://render.com/docs/free
- Render 部署行为：https://render.com/docs/deploys
- GitHub Actions 文档：https://docs.github.com/actions
