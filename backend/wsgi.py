# -*- coding: utf-8 -*-
"""
wsgi.py — 数智心屿 后端 Gunicorn WSGI 入口

部署方式（本地 / VPS）：
    gunicorn -c deploy/gunicorn.conf.py wsgi:app

部署方式（Render / Railway 等云平台）：
    # 云平台自动设置 $PORT 环境变量
    gunicorn app:app --bind 0.0.0.0:$PORT --workers 3 --timeout 45

直接调试：
    python -c "from wsgi import app; app.run()"
"""

from dotenv import load_dotenv

# 尝试加载 .env（本地开发用）。
# 云平台直接注入环境变量，没有 .env 文件也不报错。
load_dotenv(override=False)

from app import app  # noqa: E402  Flask 实例

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)
