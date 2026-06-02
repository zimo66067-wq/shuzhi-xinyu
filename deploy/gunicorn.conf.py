# -*- coding: utf-8 -*-
"""
Gunicorn 生产配置 — 数智心屿后端

启动方式：
    cd /opt/shuzhi-xinyu/backend
    /opt/shuzhi-xinyu/backend/venv/bin/gunicorn -c /opt/shuzhi-xinyu/deploy/gunicorn.conf.py wsgi:app
"""

import multiprocessing
import os

# ── 监听 ─────────────────────────────────────────
# 仅绑 127.0.0.1，由 nginx 反代到公网
bind = "127.0.0.1:5000"

# ── Worker ────────────────────────────────────────
# 经验公式：CPU 核数 × 2 + 1。轻量服务器 1 核 → 3 worker 即可。
# 但 STT 用 ffmpeg 转码会阻塞，加点裕量：min(核×2+1, 5)
workers = min(multiprocessing.cpu_count() * 2 + 1, 5)

# 用同步 worker（默认 sync）就够；如果未来要长连接 / SSE 再切 gevent
worker_class = "sync"

# 单个 worker 在被回收前能处理的请求数（防内存泄漏）
max_requests = 1000
max_requests_jitter = 50

# 请求超时（秒）。DeepSeek 调用最长 25s，加点裕量
timeout = 45
graceful_timeout = 30

# ── 日志 ─────────────────────────────────────────
# 输出到 stdout/stderr，让 systemd journal 接管
accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("GUNICORN_LOG_LEVEL", "info")

# 简化访问日志（去掉 referer / user-agent，更易读）
access_log_format = '%(h)s "%(r)s" %(s)s %(b)s %(L)ss'

# ── 进程标识 ──────────────────────────────────────
proc_name = "xinyu-backend"

# ── 工作目录 ──────────────────────────────────────
# 由 systemd Unit 的 WorkingDirectory 控制；此处不强制
# chdir = "/opt/shuzhi-xinyu/backend"

# ── 重载（仅供 staging 调试，生产不要开） ─────────────
reload = False
