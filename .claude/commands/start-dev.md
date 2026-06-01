---
description: 同时启动前端 (Vite 5173) 和后端 (Flask 5000) 开发服务器
---

启动数智心屿的开发环境。两个服务必须同时跑。

## 步骤

1. 先停掉可能残留的旧后端进程：
   ```powershell
   Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force
   ```

2. 在后台启动后端（带 UTF-8 环境变量，否则中文 print 会崩）：
   ```powershell
   cd backend
   $env:PYTHONIOENCODING="utf-8"
   py -X utf8 app.py
   ```
   **必须在后台运行**（`run_in_background: true`），不阻塞下一步。

3. 等 3 秒让 Flask 起来，然后 curl 健康检查：
   ```powershell
   Start-Sleep -Seconds 3
   try { (Invoke-WebRequest -Uri "http://localhost:5000/api/health" -UseBasicParsing -TimeoutSec 3).Content } catch { "health 失败" }
   ```

4. 健康检查 OK 后，启动前端（也在后台）：
   ```powershell
   cd frontend
   npm run dev
   ```

5. 告诉用户：
   - 前端 URL：http://localhost:5173
   - 后端 URL：http://localhost:5000
   - 两个进程都在后台跑，结束开发时执行 `/stop-dev`
