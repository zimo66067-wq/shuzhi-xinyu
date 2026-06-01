---
description: 前端构建，确认改动不破坏编译
---

跑 `npm run build` 验证前端代码能编译。

## 步骤

```powershell
cd frontend
npm run build 2>&1 | Select-Object -Last 15
```

**关注**：
- `✓ N modules transformed` — 必须有
- `built in X.XXs` — 构建成功
- 如果有 ERROR 行，把错误前后 5 行返回给用户
- 不要担心 `PowerShell NativeCommandError` 警告（误报）
- 警告 `(!) Some chunks are larger than 500 kB` 可以忽略（Three.js 体积大是必然的）

构建产物在 `frontend/dist/`，已在 `.gitignore` 中。
