# CLAUDE.md — 数智心屿项目上下文

## 项目简介

AI 数字人自闭症儿童社交评估训练系统。AI 角色名叫 **心屿**（代码/UI/Prompt 中统一使用此名，禁止使用旧名"暖暖"）。团队名：数智心屿。当前 demo 范围：情绪识别对话训练。

## 硬规则（绝对不可违反）

1. AI 角色永远叫 **心屿**，不叫暖暖
2. API key 绝对不能出现在前端代码中，Flask 后端是安全代理
3. 儿童安全层不可省略：关键词过滤、会话日志、情绪预警升级
4. 发给后端的消息格式必须是 `messages: [{role, content}, ...]`，绝不能用扁平字符串
5. **不要改动 backend/ 目录下的任何文件**，后端由队友完成且质量合格
6. 所有 UI 文案、代码注释中提到 AI 角色时用 **心屿**

## 技术栈

- **前端**：Vite + React 18（dev port 5173）
- **3D 渲染**：Three.js + @react-three/fiber + @react-three/drei
- **3D 模型**：Blender .glb（角色：心屿）
- **语音输入 STT**：Web Speech API — SpeechRecognition
- **语音输出 TTS**：Web Speech API — speechSynthesis
- **声学分析**：Web Audio API — AudioContext + AnalyserNode
- **后端**：Python Flask（port 5000）
- **AI 模型**：DeepSeek API（主），Gemini API（备用自动切换）
- **部署**：阿里云轻量应用服务器（国内）

## 项目结构

```
D:\autism-trainer\
├── frontend/
│   ├── src/
│   │   ├── index.css           # 全局样式（米黄柔粉 ASD 友好色板）
│   │   ├── main.jsx            # 入口
│   │   ├── App.jsx             # 路由
│   │   ├── tts.js              # TTS 语音输出模块（待创建）
│   │   └── pages/
│   │       ├── StartupPage.jsx # 启动页：输入姓名+年龄
│   │       ├── ChatPage.jsx    # 核心：3D 心屿(上) + 对话区(下)
│   │       ├── ToolboxPage.jsx # 自我调节工具箱
│   │       ├── PausePage.jsx   # 家长密码暂停/退出
│   │       ├── BreathePage.jsx # 呼吸引导动画
│   │       ├── OutsidePage.jsx # 自然场景视觉放松
│   │       └── RestPage.jsx    # 休息等待页
│   ├── public/models/          # .glb 模型文件
│   ├── package.json
│   └── vite.config.js
├── backend/                    # ⚠️ 不要修改此目录
│   ├── app.py
│   ├── ai_service.py
│   ├── llm_client.py
│   ├── prompts/
│   ├── .env                    # API keys — 不要读取或修改
│   └── .gitignore
└── CLAUDE.md                   # 本文件
```

## API 接口约定

### POST /api/chat
```json
// Request
{ "messages": [{ "role": "user", "content": "你好" }, { "role": "assistant", "content": "你好呀！" }] }
// Response
{ "reply": "心屿听到了，能告诉我发生了什么吗？" }
```

### POST /api/score
同上格式，返回 5 维度社交评分对象。

### POST /api/report
同上格式，返回家长可读的中文训练报告。

### GET /api/health
无请求体，返回后端状态。

## 前端设计规则（ASD 友好）

### 色板
- 背景：#FFF5E6（暖米黄）
- 强调/按钮：#FFD4D4（柔粉）
- 心屿对话气泡：#A8D8B9（柔绿）
- 正文：#7B6D5C（暖棕）
- 卡片背景：#F7FAFC（浅灰）

### 设计原则
1. **字面化**：所有元素含义即所见，无隐喻/歧义图标
2. **静默优先**：默认低刺激，无功能性动画不添加
3. **可预测**：同一元素始终在同一位置，心屿位置和按钮不漂移
4. **渐进式**：从最低刺激起步，逐步增加
5. **安全升级**：检测到情绪困扰 → 放慢节奏 → 建议换话题 → 进入安抚区

### ChatPage 布局（移动优先竖向分割）
- 顶部 10%：导航栏（返回 / 心屿标签 / 暂停）
- 中间 45%：Three.js 画布渲染心屿
- 下方 35%：对话历史/字幕浮动区
- 底部 10%：输入栏（语音按钮 + 文字输入 + 发送）

### 正面反馈样式
- 静态星星/徽章淡入（无弹跳闪烁动画）
- 背景色随训练进度缓慢变暖（隐性进度）
- 孩子永远看不到数字分数——分数仅给家长

## 心屿对话规则（已在 prompt_chat.txt 中）

- 每句不超过 10 个字
- 只用具象词汇，不用抽象隐喻（不说"心里很暖"）
- 明确情绪确认，不用"嗯""可能"等模糊词
- 每轮只问一个问题，不复合提问
- 始终肯定、鼓励
- 不用反讽/双关/笑话
- 不催促孩子回答
- 不暴露底层模型身份——心屿就是心屿

## 当前开发状态

### 已完成 ✅
- 后端 3 个 API 端点完整实现
- 后端双 API 降级 + Prompt 注入防护 + JSON 修复
- Vite + React 项目脚手架 + 7 个页面组件
- 前后端联调跑通（localhost）
- handleSend 已改为 async fetch 真实调后端

### 待做（按优先级）
- **P0**: TTS 语音输出 ← 当前任务
- **P0**: STT 语音输入
- **P0**: 3D 数字人加载（替换 emoji 占位）
- **P1**: 口型同步、家长后台页面、声学特征提取
- **P2**: Blender 模型完善、多年龄适配、对话持久化
- **P3**: 阿里云部署、Git 初始化、多场景扩展

## 环境信息
- Windows，VS Code，PowerShell
- Node.js v24.15.0
- npm registry: https://registry.npmmirror.com
- Python 3.8+
- 前端路径: D:\autism-trainer\frontend
- 后端路径: D:\autism-trainer\backend

---

# P0 三项功能实现方案

## 背景

当前 demo 是带占位的对话线框：ChatPage.jsx 已通过 `fetch` 联通后端 `/api/chat`，但三项核心体验缺失——
- 心屿不会"说"（无 TTS，回复只显示字幕）
- 用户不能"说"（"长按说话"按钮发的是写死的 `"你好"`）
- 心屿不"出现"（中间区域是 `🤖` emoji，three / fiber / drei 已装但零引用）

目标：让心屿在 ChatPage 上"看得见、听得见、说得出"，且架构为 P1 口型同步/家长后台预留好接口。

## 技术选型

| 模块 | 选型 | 关键决策 |
|---|---|---|
| **TTS** | Web Speech API · `speechSynthesis` | 零成本、浏览器原生；speechSynthesis 不暴露音频流，用 `onboundary` + 时间插值生成伪音量包络驱动假口型 |
| **STT** | 前端 `MediaRecorder` 录 webm/opus → 后端新增 `/api/stt` → 阿里云/讯飞短语音识别 | Web Speech API SpeechRecognition 国内不可用；与硬规则"不改 backend"有冲突，列为**协调项**由后端队友新增端点 |
| **3D** | React Three Fiber + `@react-three/drei` `useGLTF` + Ready Player Me 公开 .glb 模型 | 三个包已在 package.json 装好；Ready Player Me 自带 ARKit blend shapes（`mouthOpen`/`eyeBlink` 等 morph targets），P1 口型同步零改动接入 |
| **假口型** | `onboundary` 事件 → 伪音量包络 → `mouthOpen` morph target | speechSynthesis 不暴露音频流，无法直接接 AnalyserNode；用字符位置/时长插值生成 0-1 包络 |

## 文件结构（新建部分）

```
frontend/
├── public/
│   └── models/
│       └── xinyu.glb                 # Ready Player Me 导出的心屿模型（待下载）
└── src/
    ├── lib/
    │   ├── tts.js                    # TTS 封装：speak/cancel/getVoices + 中文女声选择
    │   ├── stt.js                    # MediaRecorder 录音 + 上传后端 /api/stt
    │   └── speechEnvelope.js         # 伪音量包络生成器（驱动假口型）
    ├── hooks/
    │   ├── usePushToTalk.js          # 长按说话 React Hook
    │   └── useLipSync.js             # volume 0-1 → 模型 morph target
    ├── three/
    │   ├── XinyuScene.jsx            # Canvas + 灯光 + Suspense 容器
    │   └── XinyuModel.jsx            # useGLTF 加载 + state 驱动动画
    └── pages/
        └── ChatPage.jsx              # ★ 改造：替换 emoji 占位 + 接入 TTS/STT
```

## 模块间接口定义

### `lib/tts.js`

```
speak(text: string, options?: {
  rate?: number,         // 默认 0.85（慢一点，ASD 友好）
  pitch?: number,        // 默认 1.1（女声偏高）
  volume?: number,       // 默认 1.0
  onVolume?: (level: 0-1) => void,   // 伪音量回调，驱动嘴部
  onEnd?: () => void
}) → Promise<void>

cancel() → void
isSpeaking() → boolean
getPreferredVoice() → SpeechSynthesisVoice | null   // 启动时缓存中文女声
```

`onboundary` 触发时记录当前字位置 + 时长，启动 `requestAnimationFrame` 循环，按字符位置/总时长插值出 0-1 音量包络，通过 `onVolume` 分发。

### `lib/stt.js`

```
createRecorder() → {
  start() → Promise<void>,
  stop() → Promise<Blob>,      // webm/opus blob
  isRecording: boolean
}

transcribe(blob: Blob) → Promise<{ text: string }>
  // POST /api/stt, multipart/form-data, field name: "audio"
```

### `hooks/usePushToTalk.js`

```
const {
  isRecording, isTranscribing, error,
  startRecording, stopRecording
} = usePushToTalk({
  onTranscript: (text: string) => void
})
// 绑定到按钮的 onPointerDown / onPointerUp / onPointerLeave
```

### `three/XinyuScene.jsx`

```
<XinyuScene state={state} volume={volume} />

state: 'idle' | 'listening' | 'thinking' | 'speaking'
volume: number  // 0-1，仅在 speaking 时有效

行为约定：
  idle      → 微浮动 + 周期眨眼
  listening → 微笑 + 眼睛聚焦（无身体动作）
  thinking  → 头微侧（无嘴动）
  speaking  → mouthOpen morph = volume * 0.6
```

模型不可旋转、相机固定（ASD 友好：可预测）。

### `hooks/useLipSync.js`

```
const lipSyncRef = useLipSync(volume)
// ref 传给 XinyuModel，内部在 useFrame 中插值更新 morph target
```

### 后端协调接口（由队友新增，不由前端改 backend/）

```
POST /api/stt
Content-Type: multipart/form-data
Body: audio file (field: "audio", webm/opus)
Response: { "text": "<识别结果>" } | { "error": "..." }
```

## ChatPage.jsx 改造点

| 位置 | 现状 | 改造后 |
|---|---|---|
| ChatPage.jsx:97 `<div className="avatar-halo">🤖</div>` | emoji 占位 | `<XinyuScene state={state} volume={volume} />` |
| ChatPage.jsx:126 "长按说话" `onClick={() => sendMessage('你好')}` | 写死占位 | `usePushToTalk({ onTranscript: sendMessage })` 接管 |
| `sendMessage` 收到 reply 后 | 仅 `setSubtitle(reply)` | 同时调 `tts.speak(reply, { onVolume: setVolume })`，state 流转 thinking → speaking → idle |

**状态机**：

```
[空闲]   state='idle'
  ↓ 用户按住"长按说话"
[录音中] state='listening'  ← stt 录音
  ↓ 松开
[识别中] state='thinking'   ← stt 上传 + 后端转写
  ↓ 拿到 text
[请求中] state='thinking'   ← /api/chat
  ↓ 拿到 reply
[朗读中] state='speaking'   ← tts.speak，volume 0-1 实时驱动嘴
  ↓ onEnd
[空闲]   state='idle'
```

## 实现顺序

### 阶段 1：3D 数字人骨架
1. 下载 Ready Player Me 模型 → `public/models/xinyu.glb`
2. 写 `three/XinyuModel.jsx`（`useGLTF`、眨眼定时器、idle 微浮动）
3. 写 `three/XinyuScene.jsx`（Canvas + 灯光 + Suspense fallback）
4. ChatPage 嵌入，先静止无交互
- **验收**：ChatPage 中间区域显示心屿 3D 模型，自动眨眼 + 微浮动

### 阶段 2：TTS + 假口型
5. 写 `lib/tts.js`（封装 + 中文女声选择）
6. 写 `lib/speechEnvelope.js`（onboundary → volume 包络）
7. 写 `hooks/useLipSync.js`（volume → morph target）
8. ChatPage 集成：收到 reply 后调 `tts.speak`，volume 传给 `<XinyuScene />`
- **验收**：点表情按钮发"我很开心"，心屿用中文女声朗读，嘴巴跟着动

### 阶段 3：STT（依赖后端协调）
9. 把 `/api/stt` 接口约定交给后端队友，等其上线
10. 同时写 `lib/stt.js` + `hooks/usePushToTalk.js`（可先 mock 后端接口）
11. ChatPage 替换"长按说话"占位
- **验收**：按住说"你好心屿"→ 松开 → 识别文字 → sendMessage → 心屿语音回复 + 嘴动

### 阶段 4：降级兜底
12. 麦克风权限被拒：友好提示，禁用语音按钮但保留打字输入
13. TTS 不可用（无中文语音引擎）：降级为静默 + 纯字幕
14. 模型加载失败：Suspense fallback 显示原有 `.avatar-halo` 柔色光晕
15. STT 识别失败：提示"心屿没听清"，不中断对话

## 风险说明

- **后端 `/api/stt` 未上线前 STT 完全不能工作**，已将 STT 放到最后阶段，前两阶段不阻塞
- **Ready Player Me 模型版权**：免费个人使用，demo 可用，量产前替换为自制 Blender 模型
- **口型同步（P1）接口已预留**：`XinyuScene` 的 `state` + `volume` 双入参，P1 直接把 volume 换成音素概率即可，无需重构

---

# P1 三项功能实现方案

## 背景

P0 阶段（含偏差修复）全部完成：3D 数字人 / TTS / STT / 安抚提示 / 启动页姓名年龄输入全跑通。本方案承接 P0 现有接口，实现 P1 三项 enhancement：

1. **口型同步**：将"音量驱动单 morph"升级为"音素级多 viseme 同步"，让心屿说话时口型自然
2. **家长后台**：把后端早已就绪但前端未调用的 `/api/score` + `/api/report` 接进 ParentPage 真实页面，加雷达图 + 报告 + 对话记录
3. **声学分析**：在用户说话时实时提取语音特征，双重用途——录音结束输送给 /api/score 让评分更准；实时检测异常（哭/喊/沉默）触发安全升级

**用户决策已对齐**：
- 口型同步走 **Rhubarb Lip Sync**（后端预处理音素时间轴）
- 家长后台**复用 PausePage 的 1234 密码**机制
- 家长后台**四项数据全要**：对话记录 / 雷达图 / 中文报告 / 声学结果
- 声学分析**两个用途都做**：服务评分 + 实时安全

## 技术选型

| 模块 | 选型 | 关键决策与理由 |
|---|---|---|
| **口型同步** | Rhubarb Lip Sync v1.13（开源 CLI 工具）+ 后端预处理 | 后端 ffmpeg 已就位；Rhubarb 输出 9 个标准 viseme（A-X）时间轴；**当前模型 `viseme_PP/AA/O/U/...` morph 命名与 Rhubarb 输出可一对一映射**；为 wass08 模型量身打造的方案 |
| **家长后台 UI** | Recharts + 现有 React Context | Recharts 体积小、API 简单，`<RadarChart>` 三行写完 5 维图；数据流复用阶段二建好的 ChatContext |
| **声学分析** | Web Audio AudioWorklet + AnalyserNode | 浏览器原生 0 依赖；AudioWorklet 跑在独立线程，不阻塞 UI；同一份 MediaStream **录音 STT 和声学分析并行**（不重复采集） |
| **密码门** | 复用 PausePage `PARENT_PASSWORD = '1234'` 常量 | 已有机制，避免散落 |

**为什么 Rhubarb 而不是 Web Audio FFT 实时分析**：
- FFT 实时分析要在 audio worklet 内做共振峰识别，DSP 算法复杂、效果不稳
- Rhubarb 用专门的 phoneme recognizer，精度工业级
- 后端预处理只增加一次 100-300ms 延迟，反正用户也在等 LLM 回复
- 一旦做完，效果跟商用产品差距很小

**为什么 Web Audio 而不是后端 librosa 做声学分析**：
- 实时安全信号必须前端（不可能传所有音频到后端做实时分析）
- 浏览器 Web Audio 已经能算 RMS/zero-crossing/spectral centroid/简易 pitch
- 后端补充收益不大，先做前端版

## 文件结构（新增/修改）

```
backend/
├── lipsync_service.py            # 新建：Rhubarb 子进程封装
├── bin/
│   └── rhubarb.exe               # 新增：Windows 二进制（用户下载，约 8MB）
└── app.py                        # 修改：/api/tts 返回 JSON { audio_b64, lipsync }

frontend/
├── src/
│   ├── lib/
│   │   ├── tts.js                # 修改：fetch /api/tts 改解 JSON；audio.currentTime 驱动 viseme
│   │   └── acoustics.js          # 新建：Web Audio 特征提取核心
│   ├── hooks/
│   │   ├── useLipSync.js         # 修改：从 (volume) 改为 (currentViseme, weight)
│   │   ├── useAcousticAnalysis.js # 新建：实时声学 Hook，订阅 stream
│   │   └── usePushToTalk.js      # 修改：录音时挂上 acoustic 分析；返回 features summary
│   ├── components/
│   │   ├── ScoreRadarChart.jsx   # 新建：Recharts 5 维雷达图
│   │   └── PasswordGate.jsx      # 新建：4 位密码输入组件（复用 PausePage 风格）
│   ├── pages/
│   │   ├── ParentPage.jsx        # 重写：从占位变完整后台
│   │   └── ChatPage.jsx          # 修改：接收 acoustic safety 信号触发 comfort banner
│   ├── three/
│   │   └── XinyuModel.jsx        # 修改：根据 viseme 名查找模型对应 morph
│   └── App.jsx                   # 修改：ChatContext 增加 acousticHistory 数组
└── package.json                  # 新增依赖：recharts
```

## 与 P0 现有接口的对接方式

### 口型同步 × P0 TTS 路径

**P0 现状**（不破坏）：
- `lib/tts.js` 的 `speak(text, { onVolume, onEnd })` 签名
- `hooks/useLipSync.js` 接收 `volume: number`
- `ChatPage.jsx` `setVolume(0..1)` → `<XinyuScene volume={volume} />`

**P1 改动方式**：
- `speak()` **签名保留**，内部实现升级
- 新增可选回调 `onViseme(name, weight)` 提供更精细数据
- `volume` 通道**保留**作为 fallback（当 lipsync 数据缺失时用音量兜底）
- ChatPage 改为同时传 `viseme` 给 XinyuScene
- 旧的"音量包络" speechEnvelope.js 留作 Web Speech API 降级路径不动

### 家长后台 × P0 后端 API

**P0 现状**：
- 后端 `/api/score` 和 `/api/report` 已就绪（队友质量合格，文档说不动）
- `ChatContext.messages` 阶段二已建好（含完整对话历史）

**P1 改动方式**：
- ParentPage **只调用现有 API**，不要求后端改动
- 请求体格式严格按文档：`POST /api/score body: { messages }`，`POST /api/report body: { messages, score }`
- 不动后端 `ai_service.py` 任何逻辑

### 声学分析 × P0 STT 路径

**P0 现状**：
- `lib/stt.js` `createRecorder()` 内部已 `getUserMedia({ audio: true })` 拿到 MediaStream
- `hooks/usePushToTalk.js` 控制录音生命周期

**P1 改动方式**：
- `createRecorder` 在 `start()` 时**把 stream 暴露出来**（新增 getter）
- `useAcousticAnalysis(stream)` 挂载 AnalyserNode + AudioWorklet，**与 MediaRecorder 并行**消费同一份音频
- 录音停止时返回 features summary
- 实时安全信号通过回调 `onSafetySignal(level)` 上传到 ChatPage
- ChatPage 已有 comfort banner 机制（阶段二批次 4），复用其显示通路

## 模块间接口定义

### 后端 `lipsync_service.py`

```
analyze(audio_bytes: bytes) -> list[dict]
  # 输入：MP3/WAV 二进制
  # 输出：[{ "start": float, "end": float, "viseme": str }]
  # viseme 取值：A B C D E F G H X（Rhubarb 标准 9 viseme）
  # 内部：subprocess.run(["bin/rhubarb.exe", ...]) 解析 JSON 输出
```

### 后端 `/api/tts` 改造

```
POST /api/tts
  Request : { "text": "...", "voice": "..." }
  Response (旧): MP3 binary
  Response (新): {
    "audio_b64": "<base64 MP3>",
    "lipsync": [{start, end, viseme}, ...]
  }
```

### 前端 `lib/tts.js`（签名兼容扩展）

```
speak(text: string, options?: {
  rate?, pitch?, volume?,
  onVolume?: (level: 0-1) => void,           // 保留，fallback 用
  onViseme?: (name: string, weight: number) => void,  // 新增
  onEnd?: () => void,
}) → Promise<void>

cancel() → void
isSpeaking() → boolean
```

### 前端 `lib/acoustics.js`

```
createAnalyzer(stream: MediaStream) → {
  start() → void,
  stop() → AcousticFeatures,
  onFrame(callback: (frame: { rms, zcr, pitch, centroid }) => void) → void,
}

类型 AcousticFeatures = {
  duration: number,
  rms: { mean, std, min, max },
  pitch: { mean, std, range },     // 语调单调性指标
  zcr: { mean, std },              // 语速代理
  silence_ratio: number,           // 沉默占比
  energy_variance: number,         // 情绪激动指标
}
```

### 前端 `hooks/useAcousticAnalysis.js`

```
useAcousticAnalysis({
  stream: MediaStream | null,
  onSafetySignal: (level: 'normal' | 'cry' | 'silence' | 'agitated') => void,
}) → {
  features: AcousticFeatures | null,    // 录音结束后填充
  isAnalyzing: boolean,
}
```

### 前端 `hooks/useLipSync.js` 改造

```
useLipSync({ viseme: string | null, weight: number, fallbackVolume: number }) → setMeshRef
// 内部 viseme name → model morph target 映射表
// 平滑插值（避免硬切，~80ms 过渡）
```

### 前端组件

```
<ScoreRadarChart score={{
  '主动发起': number,
  '话题维持': number,
  '情绪识别': number,
  '礼貌用语': number,
  '参与度':   number,
}} />

<PasswordGate
  expectedPassword="1234"
  onSuccess={() => void}
  onCancel={() => void}
/>
```

## 实现顺序

按"依赖少 → 依赖多" + "风险低 → 风险高"排：

### 阶段 P1-A：家长后台（约 60 分钟）
**为什么先做**：完全前端工作，不动后端，依赖最少；用户立刻能看到家长视角的完整闭环

1. `npm install recharts`
2. 写 `components/ScoreRadarChart.jsx`（约 30 行 Recharts 模板）
3. 写 `components/PasswordGate.jsx`（复用 PausePage 视觉风格）
4. 重写 `pages/ParentPage.jsx`：密码门 → 对话记录滚动 → 「生成评估报告」按钮 → loading → 调 /api/score → 渲染雷达图 → 调 /api/report → 渲染报告文本
- **验收**：长按启动页设置 3 秒 → 输入 1234 → 看到对话记录 + 评分按钮 → 点击后出现雷达图 + 中文报告

### 阶段 P1-B：声学分析（约 90 分钟）
**为什么次之**：前端独立，可单独测试；产出的 features 给 P1-A 的后台增加展示项

5. 写 `lib/acoustics.js`：AudioContext + AnalyserNode + ScriptProcessor 提取 RMS/pitch/zcr，输出 frame 流（pitch 用 autocorrelation，简易实现即可）
6. 写 `hooks/useAcousticAnalysis.js`：管理生命周期 + 安全阈值判定（RMS > 0.6 → cry，RMS < 0.05 持续 3s → silence，pitch_std > 80Hz → agitated）
7. 修改 `lib/stt.js`：`createRecorder()` 新增 `getStream()` 暴露 MediaStream
8. 修改 `hooks/usePushToTalk.js`：内部 `useAcousticAnalysis`，传 stream + onSafetySignal；录音结束返回 features
9. 修改 `ChatPage.jsx`：监听安全信号触发 comfort banner（与阶段二关键词检测并行，任一触发都生效）
10. 修改 `App.jsx`：ChatContext 加 `acousticHistory: AcousticFeatures[]`，每次录音结束 push 一条
11. 修改 `pages/ParentPage.jsx`：增加"声学概览"段落，列出 acousticHistory 的均值
- **验收**：录一句正常话 → ParentPage 看到 features；故意大喊一声 → 前端立刻弹出 comfort banner

### 阶段 P1-C：口型同步（约 120 分钟）
**为什么最后**：风险最高（涉及后端二进制依赖 + TTS 接口变更）；前两阶段已经能演示

12. 用户下载 Rhubarb release，放到 `backend/bin/rhubarb.exe`（**用户操作**）
13. 写 `backend/lipsync_service.py`：subprocess 调 rhubarb，解析输出 JSON
14. 修改 `backend/app.py` `/api/tts`：响应改为 `{ audio_b64, lipsync }`
15. 修改 `frontend/src/lib/tts.js`：fetch 解 JSON → base64 解码 audio → audio.currentTime 驱动 viseme 查找 → 通过 `onViseme` 回调
16. 改写 `frontend/src/hooks/useLipSync.js`：接收 viseme 名字 → 查映射表 → 平滑插值更新 morph
17. 修改 `frontend/src/three/XinyuModel.jsx`：mouthOpen → viseme map 集成
18. 修改 `frontend/src/pages/ChatPage.jsx`：传 `viseme` prop 给 XinyuScene
- **验收**：心屿说话时口型自然张合（不再是机械"mouthOpen 跟音量"），尤其在「啊/哦/呜」这种元音上有明显形变差异

### 阶段 P1-D：联调收尾（约 30 分钟）
19. ParentPage 集成声学分析展示（连通 P1-B 数据）
20. comfort banner 触发源标识：区分"关键词触发"和"声学触发"（仅日志，UI 不变）
21. console.log 清理为 console.debug

## 验证方式

**端到端 golden path**：
1. 启动后端 + 前端
2. 启动页输入"小明" + 6 岁 → 进入对话
3. 长按说话："我今天去了公园" → 松开
4. 心屿语音回复 + **嘴型自然张合**（口型同步生效，比之前"嘴一直开关"自然得多）
5. 故意大喊"啊！" → 实时弹出 comfort banner（声学触发）
6. 聊 5-6 轮后，回到启动页，长按设置 3 秒 → 输入 1234 → 进入家长后台
7. 看到完整对话记录 → 点「生成评估报告」→ 看到雷达图 + 中文报告 + 声学概览

**关键检查点**：
- P1-A 完成：`/api/score` 和 `/api/report` 在 Network 面板返回 200，雷达图 5 个维度都有数值
- P1-B 完成：发声时浏览器 Console 看到 acoustic frame 数据（debug 日志）
- P1-C 完成：朗读"啊哦呜"三个字时，模型的 mouthOpen / viseme_AA / viseme_O / viseme_U 三个 morph 在 React DevTools 里数值变化明显不同

## 风险与已知约束

- **Rhubarb 处理时间**：每秒音频约 30-100ms 处理，10 秒回复约延迟 0.3-1s。已通过"TTS + Rhubarb 并行 await"减轻，但用户感知是聊天回复延迟略增。如不可接受可退化为"先返回 MP3 立刻播放，lipsync 异步到达后补充"。
- **Web Audio AudioWorklet 兼容性**：Chrome 完全支持；Safari 14+ 也支持。不支持 IE，不影响 demo。
- **声学安全阈值**：RMS/pitch_std 的阈值需要真实儿童语音样本调整。初版给经验值，部署前要采样调参。
- **Rhubarb 二进制依赖**：需要在每台部署机器上放 rhubarb 可执行文件。Windows 直接用 release.exe；Linux/Mac 部署时要换对应二进制。
- **Recharts 体积**：约 100KB gzipped。Three.js 已经超 500KB，再加 100KB 不显著恶化。
- **不破坏的 P0 接口清单**：
  - `lib/tts.js` 的 `speak()` 签名（`onVolume` 保留兼容）
  - `lib/stt.js` 的 `createRecorder()` 返回值结构（只新增 getStream 不删字段）
  - 后端 `/api/chat`、`/api/score`、`/api/report`、`/api/health`、`/api/stt` 完全不动
  - `App.jsx` ChatContext 结构只增加字段不改既有
- **不在 P1 范围**：
  - 多日对话历史持久化（P2）
  - 自制 Blender 模型替换公开模型（P2）
  - 多儿童多账号（P3）
  - 阿里云部署（P3）

## 需要用户在执行前完成的协调项

| 项 | 谁来做 | 说明 |
|---|---|---|
| 下载 Rhubarb v1.13 Windows release | **用户** | https://github.com/DanielSWolf/rhubarb-lip-sync/releases 下载 `Rhubarb-Lip-Sync-1.13.0-Windows.zip`，解压后把 `rhubarb.exe` 放到 `backend/bin/`（约 8 MB） |
| 团队成员替换心屿模型 | **用户的队员** | 按之前已生成的"3D 数字人升级需求文档"做，做完直接覆盖 `frontend/public/models/xinyu.glb` |
| 实名认证完成（如未做） | **用户** | 腾讯云 TTS/ASR 已能调用说明已经做了，无需再做 |

---

# P2 / P3 实施方案

## 背景

P0 + P1（含家长后台、声学分析）全部完成且经多次偏差修复后达到 alpha 演示水准。本方案覆盖《数智心屿待完成任务报告 v1.0》中剩余 7 项任务：4 项 P2（口型同步、训练阶段进度条、多年龄分级、自制模型）+ 3 项 P3（Git、部署、多场景）。

每项任务包含：**主方案 / 备用方案 / 文件改动 / 人工前置 / Token 等级**。

Token 等级：低 = 几十次工具调用；中 = 一两百次；高 = 多轮调试可能上千次。

**用户决策已对齐**：
- 训练阶段进度条走 C 方案（后端返回阶段标签，最复杂但最精准）
- 多年龄维度：字号 + 表情复杂度 + 后端 prompt 词汇（不调动画速度）
- 阿里云部署走 A 方案（IP 访问，最快）
- 多场景先做超市购物

---

## 任务 1 · 口型同步（viseme 级 · Rhubarb）

| 项 | 内容 |
|---|---|
| **主方案** | ①后端 `lipsync_service.py` 用 subprocess 调 Rhubarb CLI 分析 MP3 → 输出 9 个 viseme（A-X）时间轴；②`/api/tts` 响应改为 JSON `{audio_b64, lipsync}`；③前端 `tts.js` 解 JSON → base64 解码 audio → `audio.currentTime` 查找当前 viseme → 新增 `onViseme(name, weight)` 回调；④`useLipSync.js` 改为接收 viseme 名，查映射表（A→viseme_PP / C→viseme_AA 等），80ms 平滑插值 |
| **备用方案** | Rhubarb 二进制装不上 / Windows 杀毒拦截 → **完全保留当前"音量驱动 mouthOpen"逻辑**（已工作），不动 tts.js 和 useLipSync.js 接口 |
| **文件改动** | 新增：`backend/lipsync_service.py`、`backend/bin/rhubarb.exe`<br>修改：`backend/app.py`（仅 /api/tts）、`frontend/src/lib/tts.js`、`frontend/src/hooks/useLipSync.js`、`frontend/src/three/XinyuModel.jsx` |
| **人工前置** | 用户下载 `Rhubarb-Lip-Sync-1.13.0-Windows.zip`（https://github.com/DanielSWolf/rhubarb-lip-sync/releases），解压把 `rhubarb.exe` 放到 `backend/bin/`（约 8MB） |
| **Token 等级** | **中**（接口改动确定，前后端协调可能需要 2-3 轮调试） |

---

## 任务 2 · 训练阶段进度条（C 方案 · 后端返回阶段标签）

| 项 | 内容 |
|---|---|
| **主方案** | ①修改 `prompt_chat.txt`，加指令"每次回复末尾必须输出 `[STAGE:xxx]`，xxx∈{welcome, free_chat, emotion_guide, scenario_test, ending}"；②`ai_service.py chat()` 用正则提取 STAGE 标签 → 从 reply 删除 → 返回 `{reply, stage}`；③前端 `App.jsx` Context 加 `currentStage` 状态；④`ChatPage.jsx` 收到 stage 后更新 Context；⑤新建 `components/TrainingStepper.jsx` 5 步横向条，当前阶段用 `--accent` 高亮，已过阶段用 `--soft-feedback`；⑥`ChatPage` 顶栏下方挂上 Stepper（静态显示，不动画推进） |
| **备用方案** | 后端 prompt 改了不稳定（DeepSeek 不按格式输出 STAGE） → **退化到 A 方案**：纯前端按对话轮数推进（0-2 welcome / 3-5 free / 6-9 emotion / 10-13 scenario / 14+ end），不依赖后端 |
| **文件改动** | 新增：`frontend/src/components/TrainingStepper.jsx`<br>修改：`backend/prompts/prompt_chat.txt`、`backend/ai_service.py`、`frontend/src/pages/ChatPage.jsx`、`frontend/src/App.jsx` |
| **人工前置** | 无 |
| **Token 等级** | **中-高**（涉及 prompt 调试 + 前后端协调，主方案可能需 fallback 切换） |

---

## 任务 3 · 多年龄分级适配（字号 + 表情复杂度 + 后端词汇）

| 项 | 内容 |
|---|---|
| **主方案** | ①`index.css` 加 `--age-font-scale` 变量；②`ChatPage.jsx` 根据 `childInfo.age` 设置 root font-size：3-5 岁 +2px，6-9 岁默认，10+ 岁 -1px；③`EMOJIS` 数组按年龄分档：3-5 岁仅 3 个最基础（开心/难过/累），6-9 岁 5 个（当前），10+ 岁加 emoji picker 入口（点 ＋ 弹更多）；④后端 `prompt_chat.txt` 加 `{age_band}` 占位符 + 各档说明（低龄用极简词汇、高龄可用稍复杂表达）；⑤`ai_service.py chat()` 从 messages 的 system 消息抽取年龄注入到 prompt |
| **备用方案** | 后端 prompt 改了影响对话质量 → **关闭后端维度**，只保留前端字号 + 表情复杂度（纯 CSS 不会出错） |
| **文件改动** | 修改：`frontend/src/index.css`、`frontend/src/pages/ChatPage.jsx`、`backend/prompts/prompt_chat.txt`、`backend/ai_service.py` |
| **人工前置** | 无 |
| **Token 等级** | **中**（前端维度低风险，后端维度需测试） |

---

## 任务 4 · Blender 心屿自制模型（非代码任务）

| 项 | 内容 |
|---|---|
| **主方案** | 给 Blender 负责人的需求文档（关键 7 条）：①风格：柔卡通女童，避免写实皮肤；②半身或全身均可（前端有 `THREE.Box3` 自适应 fit）；③**必须含 ARKit 标准 blend shapes**：`eyeBlinkLeft / eyeBlinkRight / mouthOpen / mouthSmile`（这 4 个不能少）；④**口型同步必须的 viseme**（任务 1 联动）：`viseme_PP / viseme_FF / viseme_TH / viseme_DD / viseme_kk / viseme_CH / viseme_SS / viseme_nn / viseme_RR / viseme_aa / viseme_E / viseme_I / viseme_O / viseme_U`；⑤导出：File → Export → glTF 2.0 (.glb)，勾选 Shape Keys + Skinning；⑥文件 < 10MB；⑦交付前用 https://gltf.report 在线验证 morph targets 列表齐全 |
| **备用方案** | 队员做不出 / 做出来缺 morph targets → 继续用当前 wass08 模型，比赛阶段不强求替换 |
| **文件改动** | 替换：`frontend/public/models/xinyu.glb`（一行代码不用改） |
| **人工前置** | 全部由 Blender 负责人完成；用户需决定：**风格参考图**（提供 1-3 张图给他参考） |
| **Token 等级** | **极低**（只生成一份发给队员的需求 .md，不涉及代码） |

---

## 任务 5 · Git / GitHub 仓库初始化

| 项 | 内容 |
|---|---|
| **主方案** | ①轮换所有 API key：腾讯云控制台作废当前 SecretId 重新生成、DeepSeek 平台同理 → 更新 `backend/.env`；②`git init` 在项目根目录；③确认 `.gitignore` 排除：`.env`、`node_modules`、`__pycache__`、`*.glb`（避免大文件，让队员从其他渠道下）、`public/basis/`、`*.mp3`；④`git add . && git commit -m "Initial commit"`；⑤GitHub 建 **私有仓库**；⑥git remote add origin + push |
| **备用方案** | GitHub 国内不稳 → 用 Gitee；不想用云端 → 仅本地 git init 也可 |
| **文件改动** | 仅 git 配置，不改源码（可能微调 `.gitignore`） |
| **人工前置** | ①GitHub 账号注册；②API key 轮换（用户操作腾讯云/DeepSeek 控制台）；③Git 客户端已装（VSCode 自带） |
| **Token 等级** | **低**（流程清晰，按步执行） |

---

## 任务 6 · 阿里云部署（A 方案 · IP 访问）

| 项 | 内容 |
|---|---|
| **主方案** | ①阿里云轻量应用服务器 Ubuntu 22.04（学生代金券约 ¥10/月）；②SSH 连上服务器；③装环境：`apt install nginx python3.10 nodejs npm ffmpeg`；④`git clone` 项目（依赖任务 5）；⑤后端：`pip install -r requirements.txt` + 装 audioop-lts；写 systemd service 用 gunicorn 跑 Flask（避免开发服务器）；⑥前端：`npm install && npm run build` 输出到 `dist/`；⑦写 nginx 配置：80 端口反代 / 到 dist/、/api/* 转 127.0.0.1:5000；⑧Rhubarb 二进制换 Linux 版（重新下载）；⑨开 80 端口防火墙；⑩浏览器访问 `http://服务器IP` |
| **备用方案** | apt 装环境失败 → 用 Docker（生成 `Dockerfile` + `docker-compose.yml`）；服务器买不到 → 用 ngrok 把本地端口暴露到公网（仅 demo 现场） |
| **文件改动** | 新增：`deploy/nginx.conf`、`deploy/xinyu-backend.service`、可选 `Dockerfile`、`docker-compose.yml`<br>修改：`frontend/src/lib/*.js` 中 `http://localhost:5000` 改为相对路径或环境变量 |
| **人工前置** | ①购买阿里云轻量服务器；②实名认证；③SSH key 配置；④Rhubarb Linux 版二进制重新下载 |
| **Token 等级** | **高**（部署遇坑率高，可能需多轮调试 nginx 配置、systemd 服务、跨域、ffmpeg 路径等） |

---

## 任务 7 · 多场景社交训练扩展（超市购物）

| 项 | 内容 |
|---|---|
| **主方案** | ①**写超市场景剧本**（建议用户或心理学专业同学审核）：开场（进店打招呼）→ 找物品（练礼貌求助）→ 询价（练数字表达）→ 结账（练谢谢/找零理解）→ 离店（练再见）；②后端新建 `backend/prompts/prompt_chat_supermarket.txt`；③`ai_service.py chat()` 接受 optional `scene` 参数，scene='supermarket' 时加载新 prompt；④`app.py /api/chat` 透传 scene 字段；⑤前端 `StartupPage` 加场景选择按钮（默认"自由对话"，可选"超市购物"）；⑥`App.jsx` Context 加 `currentScene`；⑦前端 sendMessage 把 scene 加入 fetch body；⑧`ChatPage` 顶栏标题旁加场景标识 `心屿 · 🛒 超市` |
| **备用方案** | 后端不接 scene 参数 → 前端在 messages 数组首条 system 消息里直接注入场景说明（"现在是超市购物场景：..."），效果略差但功能等价 |
| **文件改动** | 新增：`backend/prompts/prompt_chat_supermarket.txt`<br>修改：`backend/ai_service.py`、`backend/app.py`、`frontend/src/pages/StartupPage.jsx`、`frontend/src/App.jsx`、`frontend/src/pages/ChatPage.jsx` |
| **人工前置** | 用户提供超市场景剧本初稿（或由 Claude 起草让用户审） |
| **Token 等级** | **中**（场景剧本占大头，代码改动不复杂） |

---

## 建议执行顺序（按性价比排序，不按任务编号）

| 顺序 | 任务 | 工作量 | 风险 | 阻塞下游 |
|---|---|---|---|---|
| 1 | **训练阶段进度条**（任务 2） | 半天 | 低 | 否 |
| 2 | **口型同步**（任务 1） | 2 小时（前提：Rhubarb 已下载） | 低 | 否 |
| 3 | **多年龄适配**（任务 3） | 1 天 | 低 | 否 |
| 4 | **超市场景**（任务 7） | 1-2 天 | 中（剧本质量取决于用户） | 否 |
| 5 | **Blender 模型**（任务 4） | 并行进行，不阻塞 | 高 | 否（替换即生效） |
| 6 | **Git 初始化**（任务 5） | 1 小时 | 极低 | 阻塞任务 6 |
| 7 | **阿里云部署**（任务 6） | 1-2 天 | 高 | 终点 |

---

## 需要用户在执行前完成的协调项

| 项 | 谁来做 | 说明 |
|---|---|---|
| 下载 Rhubarb v1.13 Windows release | **用户** | 任务 1 前置；https://github.com/DanielSWolf/rhubarb-lip-sync/releases |
| 提供 3D 模型风格参考图 | **用户** | 任务 4 前置；给 Blender 负责人 1-3 张柔卡通风格参考 |
| 轮换所有 API key | **用户** | 任务 5 前置；腾讯云 + DeepSeek 控制台操作 |
| 购买阿里云轻量服务器 | **用户** | 任务 6 前置；学生代金券即可 |
| 超市场景剧本审核 | **用户 / 心理学专业同学** | 任务 7 前置；可由 Claude 起草后人工审 |
