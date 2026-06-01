# 数智心屿 — 架构总览

> 给项目维护者和 Claude Code 看的内部架构文档。
> 看完这篇你应该能回答："数据从哪里来、流过哪些模块、终点在哪里。"

---

## 1. 顶层数据流

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          浏览器 (前端)                                  │
│                                                                         │
│  StartupPage  ──→  ChatContext  ──→  ChatPage  ──→  ParentPage        │
│       │                │                  │              │              │
│       │           localStorage            │              │              │
│       │       (childInfo / messages /     │              │              │
│       │        acousticHistory)           │              │              │
│       │                                   │              │              │
│       │                                   │              │              │
│       ▼                                   │              │              │
│  XinyuScene (Three.js)                    │              │              │
│       ↑                                   │              │              │
│       │ mouthOpen morph                   │              │              │
│       │                                   │              │              │
│  useLipSync ◄────  volume  ◄─── lib/tts.js (AnalyserNode)              │
│                                           │              │              │
│  usePushToTalk                            │              │              │
│       │                                   │              │              │
│       ├─→ MediaRecorder (webm)            │              │              │
│       │                                   │              │              │
│       └─→ useAcousticAnalysis             │              │              │
│              │                            │              │              │
│              └─→ safetySignal             │              │              │
│                   (cry/silence/agitated)  │              │              │
│                                           │              │              │
└───────────────────────────────────────────┼──────────────┼──────────────┘
                                            │              │
                          fetch('/api/...') │              │
                                            ▼              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Flask 后端 (port 5000)                            │
│                                                                         │
│   /api/chat   ───► ai_service.chat()    ──► llm_client.call_llm()       │
│                       ├─ _extract_age_band()                            │
│                       ├─ _truncate_history(20 轮)                       │
│                       └─ _extract_stage([STAGE:xxx])                    │
│                                                                         │
│   /api/score  ───► ai_service.score()   ──► llm_client.call_llm()       │
│                       └─ _validate_and_repair_score()                   │
│                                                                         │
│   /api/report ───► ai_service.report()  ──► llm_client.call_llm()       │
│                       └─ _filter_report_text() (BLOCKED_WORDS)          │
│                                                                         │
│   /api/tts    ───► tts_service.synthesize()                             │
│                                                                         │
│   /api/stt    ───► _webm_to_wav (ffmpeg)  ──► stt_service.recognize()   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                            │              │
                                            ▼              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         外部服务（不留存数据）                          │
│                                                                         │
│   DeepSeek API           腾讯云 TTS          腾讯云 ASR                 │
│   (deepseek-chat)         (voice 101005)     (16k_zh)                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 关键模块边界

### 2.1 前端
| 模块 | 职责 | 不该做 |
|---|---|---|
| `App.jsx` | 路由（自定义 navigate）+ 全局 Context + localStorage 持久化 | 不做业务逻辑 |
| `pages/*` | 单页面业务流 | 不直接调 Three.js |
| `components/*` | 可复用 UI | 不持有页面级状态 |
| `hooks/*` | 浏览器 API 封装（音频/录音） | 不直接调后端（除 STT） |
| `lib/*` | 后端 API 客户端 + 算法（声学分析） | 不持有 React 状态 |
| `three/*` | 3D 渲染 | 不触碰业务逻辑 |

### 2.2 后端
| 模块 | 职责 | 不该做 |
|---|---|---|
| `app.py` | Flask 路由 + CORS + 参数解包 | 不写业务逻辑 |
| `ai_service.py` | 业务逻辑（chat/score/report） + prompt 注入 + 输出清洗 | 不直接 HTTP |
| `llm_client.py` | DeepSeek HTTP 调用 + 错误兜底 | 不知道 prompt 内容 |
| `tts_service.py` | 腾讯云 TTS 调用 + 返回 MP3 字节 | 不缓存 |
| `stt_service.py` | webm→wav 转码 + 腾讯云 ASR 调用 | 不持久化音频 |
| `prompts/*.txt` | 模型行为定义 | 不动态生成（注入用占位符） |

---

## 3. 状态管理

### 3.1 前端（持久化）
| 键 | 类型 | 来源 | 消费者 |
|---|---|---|---|
| `xinyu_currentPage` | string | App.jsx | navigate() |
| `xinyu_childInfo` | `{name, age}` | StartupPage | ChatPage, ParentPage, ai_service age_band |
| `xinyu_messages` | `[{role, content}]` | ChatPage | ChatPage drawer, ParentPage 评分 |
| `xinyu_acousticHistory` | `[features]`（最近 50） | usePushToTalk → pushAcousticFeatures | ParentPage 声学概览 |

### 3.2 前端（仅会话）
| 状态 | 位于 | 何时清 |
|---|---|---|
| `currentStage` | ChatContext | 页面刷新 / clearHistory |
| `xinyuState` | ChatPage（idle/thinking/listening/speaking） | 每次对话循环 |
| `volume` | ChatPage（驱动 3D 口型） | 每次 TTS 结束 |

### 3.3 后端（无状态 + 单缓存）
- 主要请求**无状态**
- 一个进程内缓存：`_last_score_cache` / `_prev_score_cache`（供 report() 自动对比进步）

---

## 4. 训练阶段状态机

```
welcome ──→ free_chat ──→ emotion_guide ──→ scenario_test ──→ ending
                                                                  ↑
                                              （或对话超 14 轮自动收尾）
```

| 阶段 | 触发条件（DeepSeek 决定，前端兜底） |
|---|---|
| welcome | 初次打招呼 1-2 轮 |
| free_chat | 已有回应，聊日常 |
| emotion_guide | 引导识别/描述情绪 |
| scenario_test | 给具体社交情景练习 |
| ending | 孩子想结束 / 累 / 超 14 轮 |

- **后端**：DeepSeek 在 reply 末尾输出 `[STAGE:xxx]`，`_extract_stage()` 剥离
- **前端**：拿到 `stage` 字段直接用；如果后端没给，按 `stageFromRoundCount()` 兜底

---

## 5. 年龄分档（任务 3）

```
3-5 岁 (low)  ──→ band='low'  ──→ 字号 ×1.12, 表情 3 个, prompt "≤6 字句"
6-9 岁 (mid)  ──→ band='mid'  ──→ 字号 ×1.0,  表情 5 个, prompt "8-10 字句"
10+ 岁 (high) ──→ band='high' ──→ 字号 ×0.94, 表情 5+5个, prompt "10-14 字句"
```

- **前端**：`ChatPage.getAgeBand(childInfo.age)` → 写 `--age-font-scale` → emoji 数组分支
- **后端**：`ai_service._extract_age_band(messages)` 从 system message 抠 "X岁" → 注入 `AGE_BAND_PROMPTS[band]` 到 `{age_band}` 占位符

---

## 6. 儿童安全升级（双轨）

```
轨道 A（文字）：
  心屿 reply 含 COMFORT_KEYWORDS（'没关系''慢慢来'...）
       └── 连续命中 ≥ 2 次 ──→ showComfort = true ──→ 弹安抚条建议去工具盒

轨道 B（声学）：
  useAcousticAnalysis 实时计算
       ├── RMS > 0.25  ──→ 'cry' ──→ 立即弹安抚条
       ├── pitch_std > 50 + valid_ratio < 0.15 ──→ 'agitated' ──→ 立即弹
       └── silence_ratio > 0.6 ──→ 'silence' ──→ 字幕区"心屿在这里"

  ⚠️ getUserMedia 必须关闭 AGC/NS/EC，否则哭声音量被压平
```

---

## 7. 风险与权衡（设计决策记录）

| 决策 | 取舍 |
|---|---|
| 用 DeepSeek 不用 Gemini | DeepSeek 中文表达更稳，Gemini fallback 不必要 |
| 用腾讯云 TTS 不用 edge-tts | edge-tts 在 Flask 中 NoAudioReceived 无法解决 |
| 自定义 navigate 不用 react-router | 项目小，状态全在 App，省一层依赖 |
| 用 morph target 不用骨骼动画 | ARKit blend shapes 跨模型最通用 |
| 自相关基频不用 FFT | 实时性 + 移动端性能 |
| webm 录音不用 wav | 浏览器原生支持 webm/opus，体积小 5 倍 |
| 评分先 DeepSeek 后修复，不严校 | DeepSeek JSON 输出不稳，宁可补不可拒 |
| 家长密码后端校验（最新） | 客户端比对不安全（之前是 `import.meta.env.VITE_PARENT_PASSWORD`） |

---

## 8. 未来扩展点

| 想加什么 | 改哪里 |
|---|---|
| 多场景（超市/学校） | `prompts/` 加 `prompt_scene_*.txt`，前端加场景选择 UI |
| 多语言 | `index.css` 抽 i18n key + `prompts/` 准备多语种 |
| 历史对话曲线 | 后端加 SQLite 持久化评分（注意：违反"无状态"承诺，要更新 PRIVACY.md） |
| 真实口型同步 | 后端集成 Rhubarb → 输出音素时间轴 → 前端按时间轴切换 viseme morph |
| HTTPS 部署 | 加 nginx 反代 + Let's Encrypt + 修改 frontend `.env` 的 `VITE_API_BASE` |
