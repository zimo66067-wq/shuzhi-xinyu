# 数智心屿 · AI 数字人社交练习陪伴工具

> 团队：数智心屿 | 版本：v0.9（alpha） | 更新：2026 年 6 月

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Status: alpha](https://img.shields.io/badge/status-alpha-orange)]()
[![React](https://img.shields.io/badge/React-18-61dafb)]()
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue)]()

---

## ⚠️ 重要声明（使用前必读）

本项目**不是医疗器械、诊断工具或治疗方案**，是供研究、教育、家庭辅助使用的对话练习软件。

- 🚫 不能用于自闭症谱系障碍的诊断或筛查
- 🚫 不能替代任何专业心理治疗、行为干预（ABA / RDI 等）或医疗建议
- 🚫 练习回顾仅供陪伴者参考，为参考性启发式、非标准化量表，不代表任何临床结论
- 🚫 **本产品不是危机干预工具，紧急情况请联系专业机构或当地求助热线**
- ✅ 儿童使用必须有家长 / 监护人在场

完整声明见 [`LICENSE`](./LICENSE) 末段，数据与隐私见 [`PRIVACY.md`](./PRIVACY.md)。

---

## 项目简介

「心屿」是一个 AI 数字人对话伙伴。孩子可以用**语音、文字或表情贴纸**与心屿交流，心屿以**温和、简短、字面化**的方式回应。系统按训练阶段推进对话、实时分析语音情绪信号，并在家长后台生成「本次练习回顾」与中文反馈（参考性启发式，非诊断、非分级）。AI 角色名固定为「心屿」。

设计遵循 **ASD-friendly 原则**：低刺激配色、无弹跳动画、可预测布局、字面化语言、情绪安全升级。

---

## 核心功能

| 功能 | 状态 | 说明 |
|------|------|------|
| AI 对话（DeepSeek `deepseek-chat`） | ✅ 已实现 | 单一模型，无第三方降级；后端 `llm_client.py` 失败时返回温和兜底字符串 |
| TTS 语音输出（腾讯云） | ✅ 已实现 | 腾讯云 TTS（智莉音色 101005）；心屿回复后自动播放；Web Speech 仅作离线兜底 |
| STT 语音输入（腾讯云 ASR） | ✅ 已实现 | 长按麦克风录音（`usePushToTalk`）→ webm → 后端 ffmpeg 转码 → 腾讯云一句话识别 |
| 3D 数字人 心屿（VRM 1.0） | ✅ 已实现 | `@pixiv/three-vrm` 加载 `/models/xinyu.vrm`；自动眨眼、浮动、双臂自然站姿 |
| 口型同步 | ✅ 已实现 | TTS 音频经 AnalyserNode 拆 3 频段 → 映射 VRM 5 个 viseme（aa/ih/ou/ee/oh），平滑过渡 |
| 5 维度社交评分 | ✅ 已实现 | 主动发起 / 话题维持 / 情绪识别 / 礼貌用语 / 参与度，后端自动校验补全 |
| 家长报告生成 | ✅ 已实现 | 基于评分生成中文反馈报告，含进步对比，过滤医学污名化词汇 |
| 家长后台页面 | ✅ 已实现 | `ParentPage`，后端密码鉴权（`/api/parent/verify` + HMAC token），Recharts 雷达图 |
| 训练阶段进度条 | ✅ 已实现 | 后端返回 `[STAGE:xxx]` → 前端 5 阶段 stepper（欢迎→自由对话→情绪引导→场景测试→结束） |
| 多年龄分级适配 | ✅ 已实现 | 3-5 / 6-9 / 10+ 三档：字号缩放 + 表情复杂度 + 后端 prompt 词汇难度 |
| 超市场景训练 | ✅ 已实现 | 5 子场景（打招呼→找面包→问价→付款→道别），后端 `SCENARIO_PROMPTS` 字典 + 独立 prompt |
| 情绪安全升级机制 | ✅ 已实现 | 关键词过滤 + Web Audio 声学信号（哭声/沉默/激动）双触发，自动建议休息 |
| Web Audio 声学特征提取 | ✅ 已实现 | `acoustics.js`：RMS / pitch（自相关）/ ZCR / 频谱质心 |
| 实时安全 prompt 注入防御 | ✅ 已实现 | `/api/chat` 检测 8 类注入模式 + 用户输入长度截断 |

---

## 技术栈

| 层 | 技术 | 端口 |
|---|---|---|
| 前端 | Vite + React 18 | 5173 |
| 3D | Three.js + @react-three/fiber + @react-three/drei + @pixiv/three-vrm | - |
| 后端 | Python Flask + flask-cors + flask-limiter | 5000 |
| 对话/评分模型 | DeepSeek `deepseek-chat`（V3） | - |
| 语音合成 / 识别 | 腾讯云 TTS（智莉 101005）+ ASR（16k_zh 一句话识别） | - |
| 音频转码 | ffmpeg（pydub + imageio-ffmpeg） | - |
| 声学分析 | Web Audio API（AnalyserNode + 自相关基频） | - |
| 评分可视化 | Recharts | - |
| 状态管理 | React Context + localStorage | - |

> 注：早期曾用 Gemini 作降级、edge-tts/Web Speech 作 TTS、emoji/glb 作 3D，均已分别被 DeepSeek 单模型、腾讯云、VRM 取代。

数据流：
```
麦克风 ─► MediaRecorder(webm) ─► /api/stt ─► ffmpeg ─► 腾讯云 ASR ─► 文字
                                                                       │
[childInfo + messages] ─► /api/chat ─► DeepSeek ─► reply + stage/scene │
                                                          │
                              /api/tts ─► 腾讯云 TTS ─► MP3 ─► AnalyserNode
                                                                       │
                                            频段拆分 ─► VRM viseme（口型同步）
```

---

## API 契约

### POST /api/chat
请求体：
```json
{ "messages": [{ "role": "system|user|assistant", "content": "..." }, ...],
  "scenario": "supermarket"  // 可选，进入场景训练模式 }
```
响应体（任务 2/3/7 已扩展，不再是单一 reply）：
```json
{
  "reply": "心屿的回复（已剥离 [STAGE]/[SCENE] 标签）",
  "stage": "welcome | free_chat | emotion_guide | scenario_test | ending | null",
  "scene": "enter | find | ask_price | pay | leave | end | null",
  "age_band": "low | mid | high"
}
```
- `stage`：自由聊天模式下的训练阶段（场景模式为 null）
- `scene`：场景模式下的子场景（自由聊天为 null）
- `age_band`：从 system message 的「X 岁」抽取的年龄档

### POST /api/parent/verify
家长密码校验（限流 5 次/分钟）。请求 `{ "password": "..." }`，成功返回 `{ "token": "...", "expires_in": 3600 }`。

### POST /api/score
5 维度社交评分（需家长 token）。请求 `{ "messages": [...], "level": "beginner" }`，返回 total_score + dimensions + highlights + improvements + next_training。

### POST /api/report
家长报告生成（需家长 token）。请求 `{ "score_data": {...}, "previous_score": {...}, "level": "..." }`，返回 `{ "report_text": "..." }`。

### POST /api/tts
文本转语音。请求 `{ "text": "...", "voice": 101005 }`，返回 MP3 二进制。

### POST /api/stt
语音转文本。multipart/form-data，字段 `audio`（webm/opus），返回 `{ "text": "..." }`。

### GET /api/health
健康检查，返回 `{ "status": "ok" }`。

---

## 快速启动（本地开发）

### 环境要求
- Node.js 18+（推荐 20+）
- Python 3.10+
- FFmpeg（后端音频转码）
- DeepSeek 账号 + 腾讯云账号

### 1. 克隆 & 配 API key
```bash
git clone https://github.com/zimo66067-wq/shuzhi-xinyu.git
cd shuzhi-xinyu

cp backend/.env.example backend/.env
# 编辑 backend/.env，填入 DEEPSEEK_API_KEY、TENCENT_SECRET_ID、TENCENT_SECRET_KEY、PARENT_PASSWORD
```

### 2. 启动后端（端口 5000）
```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

### 3. 启动前端（端口 5173）
```bash
cd frontend
npm install
npm run dev
```

打开浏览器访问 http://localhost:5173

> ⚠️ 3D 模型文件 `frontend/public/models/xinyu.vrm` 因体积较大（约 18MB）不入仓库，需单独分发后放入该路径。

---

## 部署

`deploy/` 目录已提供生产部署所需脚本（**脚本就绪，尚未真实上线**）：

| 文件 | 用途 |
|---|---|
| `deploy/gunicorn.conf.py` | Gunicorn WSGI 配置 |
| `deploy/nginx.conf` | Nginx 反向代理（前端静态 + /api 转发） |
| `deploy/xinyu-backend.service` | systemd 服务（开机自启 + 崩溃重启） |
| `deploy/setup.sh` | 一键安装环境脚本 |

完整部署手册见 [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)（阿里云 Ubuntu 22.04，含 HTTPS 配置）。架构图见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

---

## 项目结构

```
shuzhi-xinyu/
├── backend/
│   ├── app.py                  # Flask 入口（chat/score/report/tts/stt/parent/health）
│   ├── ai_service.py           # 对话/评分/报告 + 阶段&场景提取 + 年龄分档 + 注入防御
│   ├── llm_client.py           # DeepSeek 调用封装（含兜底）
│   ├── tts_service.py          # 腾讯云 TTS
│   ├── stt_service.py          # 腾讯云 ASR + ffmpeg 转码
│   ├── prompts/                # prompt_chat / scoring / report / scenario_supermarket
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # 自定义路由 + 全局 Context（含 scenario/scene 态）
│   │   ├── pages/              # Startup/Chat/Toolbox/Pause/Breathe/Outside/Rest/Parent
│   │   ├── components/         # TrainingStepper / ScenarioBanner / PasswordGate / ScoreRadarChart
│   │   ├── hooks/              # usePushToTalk / useAcousticAnalysis / useLipSync
│   │   ├── lib/                # tts / stt / acoustics / speechEnvelope / parentAuth
│   │   ├── three/              # XinyuScene / XinyuModel（VRM 加载 + 口型 + 表情）
│   │   └── index.css
│   ├── public/models/          # xinyu.vrm（不入仓库）
│   └── .env.example
├── deploy/                     # 生产部署脚本
├── docs/                       # ARCHITECTURE.md / DEPLOYMENT.md
├── BLENDER_MODEL_SPEC.md       # 3D 模型制作需求
├── PRIVACY.md  SECURITY.md  LICENSE
└── README.md
```

---

## 安全说明

- **API Key 绝不出现在前端**：Flask 后端作为安全代理，前端零密钥（已 grep 验证）
- **`.env` 被 `.gitignore` 排除**：`backend/.env` / `frontend/.env` 均不入库，仅保留 `.env.example`
- **`node_modules` / `dist` / `*.vrm` / `*.glb` 排除**：避免仓库膨胀
- **儿童安全层**：关键词过滤、情绪预警升级、不诊断、不索取家庭信息（见 `prompt_chat.txt`）
- **家长鉴权**：密码服务端校验 + HMAC 短期 token，前端不持有明文密码
- **API 防护**：CORS 白名单、CSRF Origin 校验、请求体大小限制、各端点限流、prompt 注入检测
- **安全头**：后端为所有响应注入 CSP / X-Frame-Options / X-Content-Type-Options 等

> 🔐 部署到生产环境前**务必修改默认家长密码**（后端启动会检测并警告默认值 `1234`）。

---

## 设计原则（ASD 友好）

1. **字面化语言** — 心屿不用比喻 / 反讽 / 双关
2. **静默优先** — 默认低刺激，无功能性动画不添加
3. **可预测布局** — 元素位置固定，按钮不漂移
4. **渐进式刺激** — 从最低刺激起步，按需增加
5. **情绪安全升级** — 关键词 + 声学双触发 → 自动建议休息区

---

## License

[MIT](./LICENSE) — 含医疗 / 伦理使用附加条款，使用前请阅读完整文本。

## 贡献

欢迎 Issue 与 PR。涉及自闭症 / 儿童心理表达的内容修改请尤其谨慎，建议先在 Issue 中与维护者讨论。
