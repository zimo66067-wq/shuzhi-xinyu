# 数智心屿 — AI 数字人自闭症儿童社交评估系统

## 项目简介

基于 AI 数字人的自闭症儿童社交评估系统。数字人「心屿」主动与孩子对话，通过分析对话内容和语气，评估孩子的情绪状态和自闭症倾向。

## 技术栈

| 层 | 技术 |
|---|---|
| **前端** | Vite + React 18 |
| **3D 渲染**（预留） | Three.js + @react-three/fiber |
| **后端** | Python Flask |
| **AI 模型** | DeepSeek（主）+ Gemini（备用降级） |
| **语音**（预留） | Web Speech API（STT/TTS） |

## 项目结构

```
autism-trainer/
├── frontend/                    # 前端（Vite + React）
│   ├── src/
│   │   ├── index.css            # 全局样式（米黄柔粉 ASD 友好色板）
│   │   ├── main.jsx             # 入口
│   │   ├── App.jsx              # 路由
│   │   └── pages/
│   │       ├── StartupPage.jsx  # 启动页
│   │       ├── ChatPage.jsx     # 对话训练页（核心）
│   │       ├── ToolboxPage.jsx  # 工具盒（自我调节）
│   │       ├── PausePage.jsx    # 暂停确认页（家长密码）
│   │       ├── BreathePage.jsx  # 深呼吸引导
│   │       ├── OutsidePage.jsx  # 看窗外（放松）
│   │       └── RestPage.jsx     # 休息等待页
│   ├── public/
│   │   └── models/              # 3D 模型存放处（预留）
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── backend/                     # 后端（Flask + DeepSeek）
│   ├── app.py                   # Flask 入口（含 dotenv 自动加载）
│   ├── ai_service.py            # AI 服务（对话/评分/报告）
│   ├── llm_client.py            # LLM 调用封装（双 API 降级）
│   ├── prompts/
│   │   ├── prompt_chat.txt      # 对话 System Prompt
│   │   ├── prompt_scoring.txt   # 评分 System Prompt
│   │   └── prompt_report.txt    # 报告 System Prompt
│   ├── test_ai.py               # 冒烟测试
│   ├── stress_test.py           # 压力测试
│   ├── requirements.txt         # Python 依赖
│   ├── .env.example             # 环境变量示例（⚠️ 复制为 .env 并填 key）
│   └── .gitignore
│
└── .gitignore                   # 根目录 gitignore
```

## 快速启动

### 环境要求

- Node.js 18+
- Python 3.8+
- DeepSeek API Key（[申请地址](https://platform.deepseek.com)）

### 第 1 步：配置后端

```bash
cd backend

# 安装依赖
pip install -r requirements.txt

# 配置 API Key（⚠️ 必须做）
cp .env.example .env
# 编辑 .env，把 DEEPSEEK_API_KEY 改成你的真实 key

# 冒烟测试
python test_ai.py

# 启动后端（端口 5000）
python app.py
```

### 第 2 步：配置前端

```bash
cd frontend

# 安装依赖
npm install

# 启动前端（端口 5173）
npm run dev
```

### 第 3 步：打开浏览器

访问 http://localhost:5173/

⚠️ **前端和后端必须同时运行**（两个终端窗口各跑一个）

## API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/chat` | POST | 对话（核心） |
| `/api/score` | POST | 5 维度社交能力评分 |
| `/api/report` | POST | 生成家长训练报告 |
| `/api/health` | GET | 健康检查 |

### 对话接口示例

```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "你好"}]}'
```

返回：
```json
{"reply": "你好呀，很高兴和你聊天。今天你过得怎么样？"}
```

## 前端页面说明

| 页面 | 功能 |
|------|------|
| **启动页** | 宁静风格欢迎页，"开始"按钮进入训练 |
| **对话训练页** | 核心页面：心屿字幕浮现 + 表情贴纸/语音/文字三种输入 |
| **工具盒** | 自我调节工具：深呼吸/看窗外/休息（ASD 友好设计） |
| **暂停页** | 退出需家长密码（默认 `1234`，在 PausePage.jsx 修改） |
| **深呼吸/看窗外/休息** | 三个调节子页面 |

## ASD 友好设计要点

- 米黄柔粉低刺激色板
- 无弹跳/震动/飞入等动画（仅淡入淡出）
- 心屿回复用大字幕浮现（不用聊天气泡滚动）
- 表情贴纸支持非言语表达
- 背景色超慢渐变体现训练进度（隐性，不给孩子压力）
- 暂停/休息随时可触发

## 已知问题

- `/api/score` 评分接口偶尔 JSON 解析失败（DeepSeek 返回格式不稳定）
- 🎤 长按说话目前是占位实现（发送固定文字"你好"），待接入 Web Speech API
- 3D 数字人区域目前是 emoji 占位，待接入 Blender .glb 模型

## 团队

**数智心屿** · 创业项目团队
