# 数智心屿免费云端部署手册

最后更新：2026-07-05

## 0. 结论

本项目采用免费层部署组合：

| 层级 | 平台 | 配置文件 | 产物 |
| --- | --- | --- | --- |
| 前端 React/Vite | Vercel Hobby | `vercel.json` | `https://<vercel-project>.vercel.app` |
| 主后端 Flask API | Render Free Web Service | `render.yaml` | `https://shuzhi-xinyu-api.onrender.com` |
| 访问追踪 FastAPI | Render Free Web Service，独立仓库 `zimo66067-wq/apology` | `apology-backend/render.yaml` 或主仓库 `render.yaml` 中的 `repo` 配置 | `https://shuzhi-xinyu-track.onrender.com` |
| CI 检查 | GitHub Actions Free | `.github/workflows/deployment-checks.yml` | push/PR 自动跑前端构建和后端健康检查 |

免费层能实现公网访问和自动部署，但不等于商业级持续在线。Render Free Web Service 空闲约 15 分钟会休眠，下一次请求会冷启动；本地 SQLite 文件在 Render 免费实例重启、重新部署、休眠后不适合作为长期存储。需要长期保留追踪数据时，把 `DATABASE_URL` 改成 Supabase/Neon 等免费 Postgres 连接串。

## 1. 仓库侧已配置内容

当前仓库已经包含以下部署资产：

```text
项目根目录/
├── vercel.json
├── render.yaml
├── .github/workflows/deployment-checks.yml
├── frontend/
│   ├── package.json
│   ├── package-lock.json
│   └── .env.example
├── backend/
│   ├── app.py
│   ├── wsgi.py
│   ├── requirements.txt
│   ├── runtime.txt
│   └── .env.example
└── apology-backend/
    ├── main.py
    ├── requirements.txt
    ├── runtime.txt
    ├── render.yaml
    └── .env.example
```

重要边界：

- `apology-backend` 是独立 Git 仓库，不是主仓库的普通子目录。
- 主仓库远程：`https://github.com/zimo66067-wq/shuzhi-xinyu.git`
- 追踪服务远程：`https://github.com/zimo66067-wq/apology.git`
- 不要把 `apology-backend/.git` 当成普通文件夹提交进主仓库。

## 2. 前端部署：Vercel

### 2.1 首次导入

1. 登录 Vercel。
2. 选择 `Add New -> Project`。
3. 导入 GitHub 仓库 `zimo66067-wq/shuzhi-xinyu`。
4. Project Root 保持仓库根目录。
5. Vercel 会读取根目录 `vercel.json`。

### 2.2 构建配置

| 配置项 | 值 |
| --- | --- |
| Framework Preset | Vite |
| Install Command | `cd frontend && npm ci` |
| Build Command | `cd frontend && npm run build` |
| Output Directory | `frontend/dist` |
| Node.js | `20.x`，由 `frontend/package.json` 的 `engines` 声明 |

### 2.3 前端环境变量

在 Vercel 项目 `Settings -> Environment Variables` 添加：

| Key | Value |
| --- | --- |
| `VITE_API_BASE` | `https://shuzhi-xinyu-api.onrender.com`，若 Render 生成了不同域名，填实际域名 |

说明：

- `VITE_API_BASE` 会被打包进前端 JS，只能放公开 API 地址，不能放任何密钥。
- 修改 Vercel 环境变量后，必须重新部署一次。

### 2.4 自动发布

Vercel 接入 Git 后：

- push 到 `main` 会触发生产部署。
- PR 或非生产分支会触发预览部署。
- 每次部署的日志在 Vercel `Deployments` 中查看。

## 3. 主后端部署：Render

### 3.1 推荐方式：Blueprint

1. 登录 Render。
2. 选择 `New -> Blueprint`。
3. 连接仓库 `zimo66067-wq/shuzhi-xinyu`。
4. Render 读取根目录 `render.yaml`。
5. 创建 `shuzhi-xinyu-api` 服务。

`render.yaml` 中主 API 的关键配置：

| 配置项 | 值 |
| --- | --- |
| Runtime | Python |
| Region | Singapore |
| Plan | Free |
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn app:app --bind 0.0.0.0:$PORT --worker-class sync --workers 2 --timeout 60 --log-level $GUNICORN_LOG_LEVEL` |
| Health Check Path | `/api/health` |
| Auto Deploy | On commit |
| Python | `python-3.12.8`，由 `backend/runtime.txt` 声明 |

### 3.2 主后端环境变量

在 Render 服务 `shuzhi-xinyu-api -> Environment` 配置：

| Key | 必填 | 示例/说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 是 | `sk-...` |
| `TENCENT_SECRET_ID` | 是 | 腾讯云 CAM SecretId |
| `TENCENT_SECRET_KEY` | 是 | 腾讯云 CAM SecretKey |
| `PARENT_PASSWORD` | 是 | 家长端强密码，不要使用默认值 |
| `PARENT_SECRET` | 是 | Render Blueprint 可自动生成；手动部署时用 `python -c "import secrets; print(secrets.token_hex(32))"` 生成 |
| `CORS_ORIGINS` | 是 | `https://<vercel-project>.vercel.app,http://localhost:5173,http://127.0.0.1:5173` |
| `GUNICORN_LOG_LEVEL` | 否 | `warning` |

Render 会自动提供 `PORT`，不要手动覆盖。

### 3.3 健康检查

部署完成后执行：

```bash
curl https://shuzhi-xinyu-api.onrender.com/api/health
```

期望返回：

```json
{"status":"ok"}
```

如果前端对话失败，按顺序检查：

1. Render 后端日志是否启动成功。
2. `DEEPSEEK_API_KEY`、腾讯云密钥是否存在。
3. `CORS_ORIGINS` 是否包含 Vercel 实际域名。
4. Vercel 的 `VITE_API_BASE` 是否指向 Render 实际域名。

## 4. 追踪服务部署：Render

追踪服务位于独立仓库 `zimo66067-wq/apology`。不要假设它会跟随主仓库自动提交。

### 4.1 部署方式 A：通过主仓库 Blueprint 创建

根目录 `render.yaml` 已把 `shuzhi-xinyu-track` 的 `repo` 指向：

```text
https://github.com/zimo66067-wq/apology.git
```

使用这种方式时，Render 账号必须有权限访问两个仓库。

### 4.2 部署方式 B：单独导入追踪仓库

1. 登录 Render。
2. 选择 `New -> Blueprint` 或 `New -> Web Service`。
3. 连接仓库 `zimo66067-wq/apology`。
4. 如果用 Blueprint，读取 `apology-backend/render.yaml`。
5. 如果手动创建，使用下表：

| 配置项 | 值 |
| --- | --- |
| Runtime | Python |
| Region | Singapore |
| Plan | Free |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/api/health` |
| Python | `python-3.12.8` |

### 4.3 追踪服务环境变量

| Key | 必填 | 示例/说明 |
| --- | --- | --- |
| `ADMIN_KEY` | 是 | 管理后台强密钥 |
| `DATABASE_URL` | 是 | 演示可用 `sqlite:///./visits.db`；长期留存使用免费 Postgres 连接串 |

SQLite 只能用于演示。Render Free Web Service 的本地文件系统是临时的，服务重启、重新部署或休眠后，文件型数据库不应被视为可靠存储。

## 5. 跨域与统一入口

线上访问入口以 Vercel 前端域名为准：

```text
https://<vercel-project>.vercel.app
```

前端通过 `VITE_API_BASE` 请求后端：

```text
https://shuzhi-xinyu-api.onrender.com/api/...
```

后端通过 `CORS_ORIGINS` 放行前端域名。首次部署完成后必须做一次回填：

1. 复制 Vercel 生产域名。
2. 写入 Render `shuzhi-xinyu-api` 的 `CORS_ORIGINS`。
3. 复制 Render API 域名。
4. 写入 Vercel 的 `VITE_API_BASE`。
5. 重新部署 Vercel 前端。

## 6. CI 与自动部署

GitHub Actions 文件：

```text
.github/workflows/deployment-checks.yml
```

触发条件：

- push 到 `main`
- pull request

检查内容：

- `frontend`: `npm ci` + `npm run build`
- `backend`: 安装 Python 依赖，导入 Flask app，调用 `/api/health`

平台自动部署链路：

```text
git push origin main
  -> GitHub Actions 运行部署检查
  -> Vercel 自动构建前端
  -> Render 自动重建主 API
  -> 追踪服务在 apology 仓库 push 后自动重建
```

Render 默认会在连接的分支有新提交时自动部署。Vercel 默认会在生产分支更新后生产部署。

## 7. 本地验证命令

在主项目根目录执行：

```bash
cd frontend
npm ci
npm run build
```

后端 smoke test：

```bash
cd backend
pip install -r requirements.txt
python -c "from app import app; c=app.test_client(); r=c.get('/api/health'); assert r.status_code == 200; print(r.get_json())"
```

追踪服务 smoke test：

```bash
cd apology-backend
pip install -r requirements.txt
python -c "from main import app; print(app.title)"
```

## 8. 发布操作清单

### 主仓库

```bash
git status
git add vercel.json render.yaml DEPLOY.md .github/workflows/deployment-checks.yml frontend/package.json backend/runtime.txt backend/.env.example backend/wsgi.py frontend/.env.example .gitignore
git add -f frontend/public/models/xinyu.vrm
git commit -m "chore: add free cloud deployment config"
git push origin main
```

### 追踪服务仓库

```bash
cd apology-backend
git status
git add .env.example render.yaml runtime.txt
git commit -m "chore: add render deployment config"
git push origin main
```

如果追踪服务不需要上线，可以先不部署 `apology` 仓库，只部署前端和主 Flask API。

## 9. 免费层限制与维护原则

| 风险 | 结论 | 处理方式 |
| --- | --- | --- |
| Render 休眠 | 免费 Web Service 空闲后会休眠 | 展示前先访问 `/api/health` 唤醒；接受 30-60 秒冷启动 |
| Render 免费小时数 | 免费小时数按 workspace 计算，多个服务会共同消耗额度 | 优先保证主 API；追踪服务按需开启 |
| SQLite 持久性 | Render 免费实例本地文件系统不可靠 | 追踪数据长期保存时改用免费 Postgres |
| 密钥泄露 | 前端环境变量公开可见 | 密钥只能放 Render 后端环境变量 |
| 域名变化 | 平台可能生成不同 slug | 以 Dashboard 实际域名为准，回填 CORS 和 `VITE_API_BASE` |

### 9.1 免费 warm-up 策略

如果展示场景要求“打开页面时后端已经醒着”，使用免费监控服务只 ping 主 API：

```text
https://shuzhi-xinyu-api.onrender.com/api/health
```

建议频率：每 10-14 分钟一次。不要同时保活追踪服务，否则两个 Render Free Web Service 会共同消耗免费小时数，更容易提前用完当月额度。

这不是商业级 SLA，只是用免费层降低冷启动概率。正式路演或长期公开运营应升级到付费实例或迁移到有稳定 always-on 免费额度的平台。

## 10. 官方文档

- Render Blueprint YAML: https://render.com/docs/blueprint-spec
- Render Free instances: https://render.com/docs/free
- Render deploy behavior: https://render.com/docs/deploys
- Vercel Project Configuration: https://vercel.com/docs/project-configuration
- Vercel Git deployments: https://vercel.com/docs/git
