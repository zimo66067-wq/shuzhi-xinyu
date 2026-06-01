from dotenv import load_dotenv
load_dotenv()
"""
app.py — 数智心屿 AI Demo 的 Flask 入口
提供三个 API 端点：对话 / 评分 / 报告

启动方式：
  python app.py
  （默认监听 http://localhost:5000）

前置条件：
  环境变量 DEEPSEEK_API_KEY（必须）或 GEMINI_API_KEY（备选）
"""

import hashlib
import hmac
import os
import secrets
import time
from io import BytesIO

from flask import Flask, abort, jsonify, request, send_file
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from ai_service import chat, score, report
import tts_service
import stt_service

app = Flask(__name__)

# ── 安全：请求体大小全局上限 1MB；STT 端点单独放宽 ──────────────────────
app.config["MAX_CONTENT_LENGTH"] = 1 * 1024 * 1024  # 1 MB

# ── 安全：CORS Origin 白名单 ───────────────────────────────────────────
# 默认仅允许 localhost dev；生产部署通过 CORS_ORIGINS 环境变量配置
# 格式：CORS_ORIGINS=https://your.domain.com,https://www.your.domain.com
_default_origins = "http://localhost:5173,http://127.0.0.1:5173"
_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", _default_origins).split(",") if o.strip()]
CORS(app, resources={r"/api/*": {"origins": _origins}}, supports_credentials=False)

# ── 安全：速率限制（防止 API 被刷 / DeepSeek 额度被烧） ────────────────
# 单进程内存后端，仅适合 dev / 单实例小流量。多实例部署改 storage_uri=redis://...
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per hour"],
    storage_uri="memory://",
)

# ── 安全：家长鉴权（服务端校验密码 → 短期 HMAC token） ─────────────────
# PARENT_PASSWORD：家长密码明文（仅在服务器 .env，不发给前端）
# PARENT_SECRET：签名 token 用的密钥；未配置时每次重启随机生成（旧 token 失效）
PARENT_PASSWORD = os.environ.get("PARENT_PASSWORD", "1234")
PARENT_SECRET = os.environ.get("PARENT_SECRET", secrets.token_hex(32))
PARENT_TOKEN_TTL = 60 * 60  # 1 小时


def _make_parent_token() -> str:
    """生成 'expires.signature' 格式的 token。"""
    expires = int(time.time()) + PARENT_TOKEN_TTL
    body = str(expires)
    sig = hmac.new(PARENT_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def _verify_parent_token(token: str) -> bool:
    if not token or "." not in token:
        return False
    try:
        body, sig = token.split(".", 1)
        expected = hmac.new(PARENT_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return False
        return int(body) > time.time()
    except (ValueError, TypeError):
        return False


def _require_parent_auth():
    """从 Authorization: Bearer xxx 抽 token 并校验；不通过直接 401。"""
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not _verify_parent_token(token):
        abort(401, description="parent auth required")

# ── 首页 ────────────────────────────────────────────────────────────────────

HOME_HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>数智心屿 AI Demo</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;background:#f0f4f8;min-height:100vh;display:flex;justify-content:center;padding:20px}
.container{max-width:700px;width:100%}
.header{background:linear-gradient(135deg,#4a90d9,#7ec8e3);color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center}
.header h1{font-size:24px;margin-bottom:4px}
.header p{font-size:14px;opacity:.85}
.panel{background:white;padding:20px;border-radius:0 0 12px 12px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.status{display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:13px}
.dot{width:10px;height:10px;border-radius:50%;background:#4caf50;display:inline-block}
.chat-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;height:360px;overflow-y:auto;padding:16px;margin-bottom:12px}
.msg{margin-bottom:12px;max-width:85%}
.msg.user{margin-left:auto;text-align:right}
.msg.user .bubble{background:#4a90d9;color:white;border-radius:12px 12px 4px 12px}
.msg.assistant .bubble{background:#e8f0fe;color:#1a1a2e;border-radius:12px 12px 12px 4px}
.bubble{padding:10px 14px;display:inline-block;font-size:14px;line-height:1.6;word-break:break-word}
.input-row{display:flex;gap:8px}
.input-row input{flex:1;padding:10px 14px;border:1px solid #cbd5e0;border-radius:8px;font-size:14px;outline:none}
.input-row input:focus{border-color:#4a90d9}
.input-row button{padding:10px 20px;background:#4a90d9;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer}
.input-row button:hover{background:#357abd}
.api-section{margin-top:20px}
.api-section h3{font-size:15px;margin-bottom:8px;color:#333}
.api-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.api-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:13px}
.api-card .method{font-weight:bold;color:#4a90d9}
.api-card .path{color:#555;margin-left:6px}
.api-card .desc{color:#888;font-size:12px;margin-top:4px}
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>数智心屿 AI Demo</h1>
<p>ASD 社交对话训练 · AI 伙伴"心屿"</p>
</div>
<div class="panel">
<div class="status"><span class="dot" id="status-dot"></span><span id="status-text">检测中...</span></div>

<div class="chat-box" id="chat-box">
<div class="msg assistant"><span class="bubble">你好，我是心屿。想聊点什么吗？</span></div>
</div>

<div class="input-row">
<input type="text" id="user-input" placeholder="在这里打字..." autofocus>
<button onclick="send()">发送</button>
</div>

<div class="api-section">
<h3>API 端点</h3>
<div class="api-grid">
<div class="api-card"><span class="method">POST</span><span class="path">/api/chat</span><div class="desc">ASD 约束对话</div></div>
<div class="api-card"><span class="method">POST</span><span class="path">/api/score</span><div class="desc">5 维度社交评分</div></div>
<div class="api-card"><span class="method">POST</span><span class="path">/api/report</span><div class="desc">家长反馈报告</div></div>
<div class="api-card"><span class="method">GET</span><span class="path">/api/health</span><div class="desc">健康检查</div></div>
</div>
</div>
</div>
</div>
<script>
let messages = [];
fetch("/api/health").then(r=>r.json()).then(d=>{
document.getElementById("status-dot").style.background="#4caf50";
document.getElementById("status-text").textContent="服务正常 · LLM: "+d.last_llm;
}).catch(()=>{
document.getElementById("status-dot").style.background="#f44336";
document.getElementById("status-text").textContent="服务异常";
});

function addMsg(role,text){
let div=document.createElement("div");
div.className="msg "+role;
div.innerHTML='<span class="bubble">'+text.replace(/</g,"&lt;").replace(/>/g,"&gt;")+'</span>';
let box=document.getElementById("chat-box");
box.appendChild(div);
box.scrollTop=box.scrollHeight;
}

async function send(){
let input=document.getElementById("user-input");
let text=input.value.trim();
if(!text)return;
addMsg("user",text);
messages.push({role:"user",content:text});
input.value="";
try{
let res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages})});
let data=await res.json();
let reply=data.reply||"(无回复)";
addMsg("assistant",reply);
messages.push({role:"assistant",content:reply});
}catch(e){
addMsg("assistant","网络错误，请重试。");
}
}
document.getElementById("user-input").addEventListener("keydown",e=>{if(e.key==="Enter")send();});
</script>
</body>
</html>"""


@app.route("/", methods=["GET"])
def home():
    """Demo 首页：服务状态 + 简易聊天测试界面"""
    return HOME_HTML


# ── POST /api/parent/verify ───────────────────────────────────────────────

@app.route("/api/parent/verify", methods=["POST"])
@limiter.limit("5 per minute")  # 防暴力破解
def api_parent_verify():
    """
    家长密码校验。
    请求：{ "password": "xxxx" }
    成功：{ "token": "xxx.yyy", "expires_in": 3600 }
    失败：401 { "error": "invalid" }
    """
    data = request.get_json(silent=True) or {}
    pwd = (data.get("password") or "").strip()
    # 用 hmac.compare_digest 防时序攻击
    if not pwd or not hmac.compare_digest(pwd, PARENT_PASSWORD):
        return jsonify({"error": "invalid"}), 401
    return jsonify({"token": _make_parent_token(), "expires_in": PARENT_TOKEN_TTL})


# ── POST /api/chat ────────────────────────────────────────────────────────

@app.route("/api/chat", methods=["POST"])
@limiter.limit("60 per minute")
def api_chat():
    """
    对话接口。

    请求 JSON：
      { "messages": [{"role": "user", "content": "你好"}, ...] }

    响应 JSON：
      { "reply": "<心屿的回复>" }

    示例（curl）：
      curl -X POST http://localhost:5000/api/chat ^
        -H "Content-Type: application/json" ^
        -d "{\"messages\":[{\"role\":\"user\",\"content\":\"你好\"}]}"
    """
    data = request.get_json(silent=True) or {}
    messages = data.get("messages", [])
    result = chat(messages)
    return jsonify(result)


# ── POST /api/score ───────────────────────────────────────────────────────

@app.route("/api/score", methods=["POST"])
@limiter.limit("30 per minute")
def api_score():
    _require_parent_auth()  # 评分/报告属于家长后台数据，必须鉴权
    """
    评分接口。

    请求 JSON：
      { "messages": [...], "level": "beginner" }

    level 可选："beginner" / "intermediate" / "advanced"

    响应 JSON（5 维度含参与度）：
      {
        "total_score": 70,
        "dimensions": {
            "主动发起": {"score": 3, "max": 5, "comment": "..."},
            "话题维持": {"score": 4, "max": 5, "comment": "..."},
            "情绪识别": {"score": 3, "max": 5, "comment": "..."},
            "礼貌用语": {"score": 4, "max": 5, "comment": "..."},
            "参与度":   {"score": 3, "max": 5, "comment": "..."}
        },
        "highlights": [...],
        "improvements": [...],
        "next_training": "..."
      }
    """
    data = request.get_json(silent=True) or {}
    messages = data.get("messages", [])
    level = data.get("level")
    result = score(messages, level=level)
    return jsonify(result)


# ── POST /api/report ──────────────────────────────────────────────────────

@app.route("/api/report", methods=["POST"])
@limiter.limit("30 per minute")
def api_report():
    _require_parent_auth()
    """
    报告生成接口。

    请求 JSON：
      {
        "score_data": { <来自 /api/score 的完整返回> },
        "previous_score": { <可选的历次评分，用于进步对比> },
        "level": "beginner"
      }

    响应 JSON：
      { "report_text": "<面向家长的温馨反馈报告>" }
    """
    data = request.get_json(silent=True) or {}
    score_data = data.get("score_data", {})
    previous_score = data.get("previous_score")
    level = data.get("level")
    result = report(score_data, previous_score=previous_score, level=level)
    return jsonify(result)


# ── POST /api/tts ─────────────────────────────────────────────────────────

@app.route("/api/tts", methods=["POST"])
@limiter.limit("60 per minute")
def api_tts():
    """
    Edge-TTS 语音合成接口。

    请求 JSON：
      { "text": "<要朗读的中文文本>",
        "voice": "<可选，zh-CN-XiaoxiaoNeural 等>" }

    响应：
      audio/mpeg 二进制（MP3 流）
      或 { "error": "..." } 4xx/5xx
    """
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    voice = data.get("voice") or tts_service.DEFAULT_VOICE

    if not text:
        return jsonify({"error": "text 为空"}), 400
    # TTS 单次合成文本长度上限（防止滥用烧 quota）
    if len(text) > 500:
        return jsonify({"error": "text too long"}), 413

    try:
        audio_bytes = tts_service.synthesize(text, voice=voice)
        if not audio_bytes:
            return jsonify({"error": "tts empty"}), 500
        return send_file(
            BytesIO(audio_bytes),
            mimetype="audio/mpeg",
            as_attachment=False,
            download_name="xinyu_tts.mp3",
        )
    except Exception as e:
        # 内部记录详细堆栈，但对外不暴露
        import traceback
        traceback.print_exc()
        return jsonify({"error": "tts failed"}), 500


# ── POST /api/stt ─────────────────────────────────────────────────────────

STT_ALLOWED_MIME = {
    "audio/webm", "audio/ogg", "audio/wav", "audio/wave",
    "audio/x-wav", "audio/mpeg", "audio/mp4",
}
# 单次录音上限 8MB（一句话识别 ≤ 60 秒，正常都在 1MB 以内）
STT_MAX_BYTES = 8 * 1024 * 1024


@app.route("/api/stt", methods=["POST"])
@limiter.limit("20 per minute")
def api_stt():
    """
    STT 一句话识别接口。

    请求：multipart/form-data
        - field "audio" = 浏览器录的 webm/opus 二进制
        - 大小上限 8MB，类型必须是音频 MIME
    响应：{ "text": "<识别结果>" } 或 { "error": "..." }
    """
    if "audio" not in request.files:
        return jsonify({"error": "missing audio field"}), 400

    audio_file = request.files["audio"]

    # 防御 1：MIME 类型白名单
    if audio_file.mimetype and audio_file.mimetype not in STT_ALLOWED_MIME:
        return jsonify({"error": "unsupported audio type"}), 415

    # 防御 2：先看 Content-Length（避免读取超大文件）
    # 注意：Flask 已通过 MAX_CONTENT_LENGTH 拦截 1MB 以上整体请求，
    # 但 STT 想放宽到 8MB，所以这里单独再检查。
    audio_bytes = audio_file.read(STT_MAX_BYTES + 1)
    if len(audio_bytes) > STT_MAX_BYTES:
        return jsonify({"error": "audio too large"}), 413
    if not audio_bytes:
        return jsonify({"error": "empty audio"}), 400

    try:
        text = stt_service.recognize(audio_bytes)
        return jsonify({"text": text})
    except Exception:
        import traceback
        traceback.print_exc()
        return jsonify({"error": "stt failed"}), 500


@app.errorhandler(413)
def _too_large(e):
    return jsonify({"error": "request too large"}), 413


@app.errorhandler(401)
def _unauthorized(e):
    return jsonify({"error": "unauthorized"}), 401


@app.errorhandler(429)
def _rate_limited(e):
    return jsonify({"error": "too many requests"}), 429


# ── GET /api/health ───────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
@limiter.exempt
def health():
    """健康检查（公开端点，不暴露内部状态）"""
    return jsonify({"status": "ok"})


# ── 启动 ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    has_key = bool(os.environ.get("DEEPSEEK_API_KEY"))
    if not has_key:
        print("⚠️  未检测到 DEEPSEEK_API_KEY 环境变量。")
        print("   请在 backend/.env 配置后再启动，否则对话 API 将不可用。")
        print()

    # 默认仅本机访问；生产环境用 gunicorn/uwsgi 启动，由 nginx 反代
    # 显式设 FLASK_HOST=0.0.0.0 时才会监听所有网卡（仅供 docker / 局域网调试）
    host = os.environ.get("FLASK_HOST", "127.0.0.1")
    port = int(os.environ.get("FLASK_PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"

    print(f"🚀 数智心屿 AI 后端启动：http://{host}:{port}  (debug={debug})")
    if debug:
        print("⚠️  DEBUG 模式开启，仅限本地开发，绝不可暴露到公网！")
    app.run(host=host, port=port, debug=debug)
