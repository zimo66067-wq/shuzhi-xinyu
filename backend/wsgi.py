# -*- coding: utf-8 -*-
"""
wsgi.py — 数智心屿 后端 Gunicorn WSGI 入口

部署方式：
    gunicorn -c deploy/gunicorn.conf.py wsgi:app

直接调试：
    python -c "from wsgi import app; app.run()"
"""

from dotenv import load_dotenv
load_dotenv()  # 加载 backend/.env 中的环境变量（必须在 import app 前）

from app import app  # noqa: E402  Flask 实例

if __name__ == "__main__":
    # 仅供本地调试，不推荐
    app.run(host="127.0.0.1", port=5000)
