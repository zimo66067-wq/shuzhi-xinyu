# 数智心屿（Xīnyǔ）

> **AI 数字人陪伴式社交对话练习工具** — 面向自闭症谱系儿童的语音对话与情绪表达**辅助练习**软件。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Status: alpha](https://img.shields.io/badge/status-alpha-orange)]()
[![React](https://img.shields.io/badge/React-18-61dafb)]()
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue)]()

---

## ⚠️ 重要声明（使用前必读）

本项目**不是医疗器械、诊断工具或治疗方案**。它是一个供研究、教育、家庭辅助使用的对话练习软件。

- 🚫 **不能用于自闭症谱系障碍的诊断或筛查**
- 🚫 **不能替代任何专业心理治疗、行为干预（ABA / RDI 等）或医疗建议**
- 🚫 **评估分数仅用于陪伴者参考，不代表任何临床结论**
- ✅ **儿童使用必须有家长 / 监护人在场**
- ✅ 任何关于孩子发展状况的疑虑，请咨询有资质的儿童精神科医生或发展心理学专业人士

完整声明见 [`LICENSE`](./LICENSE) 末段。

---

## 项目简介

「心屿」是一个 AI 数字人对话伙伴。孩子可以用**语音、文字或表情贴纸**与心屿交流，心屿会以**温和、简短、字面化**的方式回应，过程中：

- 自动按 5 个训练阶段推进对话（欢迎 → 自由对话 → 情绪引导 → 场景测试 → 结束）
- 实时分析语音中的声学特征（音量 / 音高 / 沉默比例），检测情绪困扰信号
- 家长后台生成 5 维度社交能力评分与中文报告

设计严格遵循 **ASD-friendly 原则**：低刺激配色、无弹跳动画、可预测布局、字面化语言、情绪安全升级。

---

## 功能一览

| 模块 | 状态 |
|---|---|
| 3D 数字人渲染（Three.js + drei，ARKit blend shapes） | ✅ |
| 语音输出 TTS（腾讯云 · 智莉音色） | ✅ |
| 语音输入 STT（腾讯云 ASR） | ✅ |
| 实时音量驱动假口型 | ✅ |
| 训练阶段进度条（DeepSeek 返回 stage 标签） | ✅ |
| 多年龄分级（3-5 / 6-9 / 10+ 三档字号 + 表情 + 词汇） | ✅ |
| 情绪安全升级（关键词 + 声学双触发） | ✅ |
| 家长后台（密码门 + 雷达图评分 + 中文报告） | ✅ |
| Web Audio 实时声学特征（RMS / pitch / ZCR / centroid） | ✅ |
| Rhubarb 音素级口型同步 | ⏸ 待 3D 模型升级后启用 |
| 多场景训练（超市购物 / 学校等） | 🛠 规划中 |

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vite + React 18 |
| 3D | Three.js + @react-three/fiber + @react-three/drei |
| 后端 | Python Flask（dotenv） |
| 对话/评分模型 | DeepSeek `deepseek-chat`（V3） |
| 语音合成 / 识别 | 腾讯云 TTS（智莉 101005）+ ASR（16k_zh） |
| 声学分析 | Web Audio API（AnalyserNode + autocorrelation） |
| 评分可视化 | Recharts |
| 状态管理 | React Context + localStorage |

数据流：
```
麦克风 ──► MediaRecorder (webm) ──► /api/stt ──► Tencent ASR
                                                     │
                                                     ▼
                                              转文字
                                                     │
                                                     ▼
[childInfo + messages]──► /api/chat ──► DeepSeek ──► reply + stage
                                                     │
                                                     ▼
                                              /api/tts ──► Tencent TTS ──► MP3
                                                                              │
                                                                              ▼
                                                                AnalyserNode ──► volume ──► 3D mouthOpen
```

---

## 快速开始

### 0. 环境要求

- Node.js **18+**（推荐 20+）
- Python **3.10+**
- FFmpeg（已加入 PATH，后端音频转码需要）
- DeepSeek 账号 + 腾讯云账号

### 1. 克隆 & 配 API key

```bash
git clone https://github.com/zimo66067-wq/shuzhi-xinyu.git
cd shuzhi-xinyu

# 后端 .env
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入 DEEPSEEK_API_KEY、TENCENT_SECRET_ID、TENCENT_SECRET_KEY

# 前端 .env（可选，用于自定义家长密码）
cp frontend/.env.example frontend/.env
```

### 2. 启动后端

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py                      # → http://localhost:5000
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev                        # → http://localhost:5173
```

打开浏览器访问 http://localhost:5173

---

## 隐私与数据

详见 [PRIVACY.md](./PRIVACY.md)。简要说明：

- **本地存储**：孩子姓名 / 年龄 / 对话历史 / 声学摘要保存在浏览器 localStorage（你的设备上），**不上传任何远程服务器**
- **网络请求**：对话文本会发送到你部署的后端 → 转发到 DeepSeek；语音数据发送到后端 → 转发到腾讯云 ASR/TTS
- **不留存音频**：后端不持久化录音文件
- **无埋点 / 无第三方分析 SDK**

---

## 家长密码

家长后台和"今天到这里"退出需要密码。

- **默认**：`1234`（仅供首次试用）
- **修改方法**：在 `frontend/.env` 设置 `VITE_PARENT_PASSWORD=你的新密码`，然后 `npm run build`

> 🔐 部署到生产环境时**务必修改默认密码**。

---

## API 接口

| 路径 | 方法 | 说明 |
|---|---|---|
| `/api/chat` | POST | 对话 `{messages} → {reply, stage, age_band}` |
| `/api/score` | POST | 5 维度评分 |
| `/api/report` | POST | 生成家长报告 |
| `/api/tts` | POST | 文本转语音（返回 MP3） |
| `/api/stt` | POST | 语音转文本（multipart audio） |
| `/api/health` | GET | 健康检查 |

请求示例：

```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"system","content":"这个孩子叫小明，8岁。"},{"role":"user","content":"你好"}]}'
```

---

## 项目结构

```
shuzhi-xinyu/
├── backend/
│   ├── app.py                  # Flask 入口
│   ├── ai_service.py           # 对话/评分/报告 + 阶段提取 + 年龄分档
│   ├── llm_client.py           # DeepSeek 调用封装
│   ├── tts_service.py          # 腾讯云 TTS
│   ├── stt_service.py          # 腾讯云 ASR + ffmpeg 转码
│   ├── prompts/                # System prompts (chat / scoring / report)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # 路由 + 全局 Context
│   │   ├── pages/              # 7 个页面
│   │   ├── components/         # TrainingStepper, PasswordGate, ScoreRadarChart
│   │   ├── hooks/              # usePushToTalk, useAcousticAnalysis, useLipSync
│   │   ├── lib/                # tts, stt, acoustics, speechEnvelope
│   │   ├── three/              # XinyuScene, XinyuModel
│   │   └── index.css
│   ├── public/models/          # .glb 模型（不入仓库）
│   └── .env.example
├── BLENDER_MODEL_SPEC.md       # 3D 模型制作需求
├── PRIVACY.md                  # 数据与隐私说明
├── LICENSE                     # MIT + 医疗用途附加声明
└── README.md
```

---

## 设计原则（ASD 友好）

1. **字面化语言** — 心屿不用比喻 / 反讽 / 双关
2. **静默优先** — 默认低刺激，无功能性动画不添加
3. **可预测布局** — 元素位置固定，按钮不漂移
4. **渐进式刺激** — 从最低刺激起步，按需增加
5. **情绪安全升级** — 关键词触发 + 声学触发 → 自动建议休息区

---

## 致谢

- [DeepSeek](https://deepseek.com) — 对话与评分模型
- [腾讯云语音](https://cloud.tencent.com/product/tts) — TTS / ASR
- [Three.js](https://threejs.org/) / [@react-three/fiber](https://github.com/pmndrs/react-three-fiber)
- [Recharts](https://recharts.org/)

---

## License

[MIT](./LICENSE) — 包含医疗 / 伦理使用附加条款，使用前请阅读完整 LICENSE 文本。

## 贡献

欢迎 Issue 与 PR。涉及自闭症 / 儿童心理表达的内容修改请尤其谨慎，建议在 Issue 中先与维护者讨论。
