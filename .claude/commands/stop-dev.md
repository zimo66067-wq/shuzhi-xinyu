---
description: 停掉所有 python / node 开发服务进程
---

清理开发环境，停掉前后端所有进程。

## 步骤

```powershell
# 杀 Flask 后端
Get-Process python, py -ErrorAction SilentlyContinue | Stop-Process -Force

# 杀 Vite 前端（node.exe）
# 注意：如果用户还有别的 node 应用在跑，要更精确——只杀监听 5173 的
$proc = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($proc) { Stop-Process -Id $proc -Force }

"前后端进程已停止"
```

如果用户机器上还有其他 Python / node 项目同时在跑，**只杀 5173 的 node**，不要盲杀所有 node.exe。Python 进程通常项目唯一，可以全杀。
