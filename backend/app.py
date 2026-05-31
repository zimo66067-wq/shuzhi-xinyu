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

from io import BytesIO

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from ai_service import chat, score, report
import tts_service
import stt_service

app = Flask(__name__)
CORS(app)

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


# ── POST /api/chat ────────────────────────────────────────────────────────

@app.route("/api/chat", methods=["POST"])
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
def api_score():
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
def api_report():
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

    try:
        audio_bytes = tts_service.synthesize(text, voice=voice)
        if not audio_bytes:
            return jsonify({"error": "edge-tts 返回空音频"}), 500
        return send_file(
            BytesIO(audio_bytes),
            mimetype="audio/mpeg",
            as_attachment=False,
            download_name="xinyu_tts.mp3",
        )
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print("[TTS ERROR]", tb, flush=True)
        return jsonify({"error": str(e), "type": type(e).__name__}), 500


# ── POST /api/stt ─────────────────────────────────────────────────────────

@app.route("/api/stt", methods=["POST"])
def api_stt():
    """
    STT 一句话识别接口。

    请求：multipart/form-data，field "audio" = 浏览器录的 webm/opus 二进制
    响应：{ "text": "<识别结果>" } 或 { "error": "..." }
    """
    if "audio" not in request.files:
        return jsonify({"error": "missing audio field"}), 400

    audio_file = request.files["audio"]
    audio_bytes = audio_file.read()
    if not audio_bytes:
        return jsonify({"error": "empty audio"}), 400

    try:
        text = stt_service.recognize(audio_bytes)
        return jsonify({"text": text})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e), "type": type(e).__name__}), 500


# ── GET /api/health ───────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    """健康检查"""
    from llm_client import get_last_source
    return jsonify({"status": "ok", "service": "数智心屿 AI Demo", "last_llm": get_last_source()})


# ── 启动 ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os
    has_key = bool(os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("GEMINI_API_KEY"))
    if not has_key:
        print("⚠️  未检测到 DEEPSEEK_API_KEY 或 GEMINI_API_KEY 环境变量。")
        print("   请先设置环境变量后再启动，否则所有 API 将返回兜底回复。")
        print("   PowerShell: $env:DEEPSEEK_API_KEY=\"sk-xxx\"")
        print("   CMD:        set DEEPSEEK_API_KEY=sk-xxx")
        print()
    print("🚀 数智心屿 AI Demo 启动中...")
    print("   API 地址：http://localhost:5000")
    print("   健康检查：http://localhost:5000/api/health")
    app.run(host="0.0.0.0", port=5000, debug=True)
