# CLAUDE.md — 项目上下文（给 Claude Code 读的）

> 这个文件是 Claude Code 每次进项目都会自动读的"使用说明书"。
> 内容是给 Claude 看的，目的是让它快速理解项目结构、约束、常用命令，少走弯路。

---

## ⚠️ 0 号铁律：只用简体中文回答（最高优先级，凌驾一切）

**无论任何情况，所有面向用户的输出一律使用简体中文** —— 包括解释、分析、建议、报错说明、代码注释、表格、清单等全部内容。

- ❌ 绝对禁止：日语、韩语，或任何其他非中文语言来回答（曾多次错误漂移，用户明确反感）。
- ✅ 唯一例外：用户本人改用其他语言提问，或明确要求换语言时，才跟随。
- 每次回复前先自检：输出语言是不是简体中文？不是就改过来再发。
- 这条规则对**新开对话和恢复的老对话同样生效**；与本机全局 `~/.claude/CLAUDE.md` 中的同条规则一致。

---

## 项目一句话

「数智心屿」— React + Flask 的 AI 数字人对话训练应用，面向自闭症儿童的辅助社交练习。AI 角色名为「心屿」。

---

## 技术栈速查

| 层 | 用什么 | 端口 |
|---|---|---|
| 前端 | Vite + React 18 + Three.js + drei + Recharts | 5173 |
| 后端 | Flask + python-dotenv | 5000 |
| 对话模型 | DeepSeek `deepseek-chat`（V3）| - |
| 语音合成 | 腾讯云 TTS，默认音色 101005（智莉） | - |
| 语音识别 | 腾讯云 ASR (16k_zh, SentenceRecognition) | - |
| 音频转码 | ffmpeg via pydub + imageio-ffmpeg | - |

---

## 常用命令（按使用频率排）

```bash
# 启动前端（必须在 frontend/ 目录）
cd frontend && npm run dev

# 启动后端（必须在 backend/ 目录，PowerShell 注意 UTF-8）
cd backend
$env:PYTHONIOENCODING="utf-8"
py -X utf8 app.py

# 前端构建
cd frontend && npm run build

# 后端健康检查
curl http://localhost:5000/api/health

# 停掉所有 python 进程（卡住时用）
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force

# 跑后端冒烟测试
cd backend && py -X utf8 test_ai.py
```

> 也可以走 `.claude/commands/` 里的自定义斜杠命令：`/start-dev`、`/build`、`/health`、`/stop-dev`、`/rotate-key`

---

## 项目结构（关键文件定位）

```
shuzhi-xinyu/
├── backend/
│   ├── app.py                  # Flask 入口（路由：/api/chat /score /report /tts /stt /health）
│   ├── ai_service.py           # 业务核心：chat/score/report + 阶段提取 + 年龄分档
│   ├── llm_client.py           # DeepSeek 调用（call_llm）
│   ├── tts_service.py          # 腾讯云 TTS
│   ├── stt_service.py          # 腾讯云 ASR + ffmpeg webm→wav
│   ├── prompts/
│   │   ├── prompt_chat.txt     # 对话系统提示（含 {age_band} 占位符 + [STAGE:xxx] 规则）
│   │   ├── prompt_scoring.txt
│   │   └── prompt_report.txt
│   └── .env                    # ⚠️ 不在 git 里，含 3 个 key
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # 路由（自定义 navigate(page)，非 react-router）+ ChatContext
│   │   ├── pages/
│   │   │   ├── ChatPage.jsx    # 对话页（核心）
│   │   │   ├── StartupPage.jsx # 启动页（名字 + 年龄 + 进入）
│   │   │   ├── ParentPage.jsx  # 家长后台（密码门 + 评分 + 报告）
│   │   │   └── ...（暂停/呼吸/休息/工具盒）
│   │   ├── components/
│   │   │   ├── TrainingStepper.jsx     # 任务 2：5 阶段进度条
│   │   │   ├── ScoreRadarChart.jsx     # 雷达图
│   │   │   └── PasswordGate.jsx
│   │   ├── hooks/
│   │   │   ├── usePushToTalk.js        # 长按录音 + STT + 声学
│   │   │   ├── useAcousticAnalysis.js  # 实时安全信号（cry/silence/agitated）
│   │   │   └── useLipSync.js           # 音量→mouthOpen
│   │   ├── lib/
│   │   │   ├── tts.js / stt.js         # 后端 API 封装
│   │   │   ├── acoustics.js            # AnalyserNode + autocorrelation pitch
│   │   │   └── speechEnvelope.js
│   │   ├── three/
│   │   │   ├── XinyuScene.jsx          # Canvas + 光照 + ErrorBoundary
│   │   │   └── XinyuModel.jsx          # useGLTF + 自适应 fit + 眨眼/浮动
│   │   └── index.css                   # 含 --age-font-scale（任务 3）
│   ├── public/
│   │   ├── models/xinyu.glb            # ⚠️ 不在 git 里（*.glb 被忽略）
│   │   └── basis/                      # KTX2 transcoder（不在 git）
│   └── .env                            # ⚠️ 不在 git，含 VITE_PARENT_PASSWORD
└── docs/ARCHITECTURE.md                # 数据流图
```

---

## 硬性约束（**永远不能违反**）

| # | 约束 | 为什么 |
|---|---|---|
| 1 | **API key 绝对不能出现在前端代码中** | Flask 后端是安全代理 |
| 2 | **AI 角色永远叫「心屿」，不叫"暖暖"或其他** | 旧名是项目早期残留 |
| 3 | **发给后端的格式必须是 `messages: [{role, content}, ...]`** | 绝不能用扁平字符串；后端校验失败会返回兜底 |
| 4 | **儿童安全层不可省略**：关键词过滤 / 情绪预警 / 不诊断 / 不索取家庭信息 | 见 `prompt_chat.txt` 第 35-49 行 |
| 5 | **不删除 `.env.example`**：root `.gitignore` 有 `!backend/.env.example` 例外规则 | 避免新部署者无从下手 |
| 6 | **system message 必须含 `这个孩子叫X，N岁`** | `ai_service.chat()` 从中抽年龄分档（任务 3） |
| 7 | **DeepSeek 回复末尾的 `[STAGE:xxx]` 由 `_extract_stage()` 剥离** | 不剥会显示给孩子，破坏沉浸 |

---

## 项目特有的坑（踩过的）

| 坑 | 解决 |
|---|---|
| Windows 命令行 `python` 是 Microsoft Store stub，退出码 49 | 改用 `py` |
| PowerShell 默认 GBK，emoji print 崩 | `$env:PYTHONIOENCODING="utf-8"; py -X utf8` |
| Python 3.14 没有 stdlib `audioop`，pydub 用不了 | `pip install audioop-lts` |
| Flask debug=True 时改 ai_service.py 不一定热重载 | 直接 `Stop-Process` 后重启 |
| `deepseek-v4-pro` 是 reasoning 模型，token 都被消耗在 reasoning 上，content 空 | 用 `deepseek-chat` |
| edge-tts 在 Flask 中 `NoAudioReceived`（CLI 能跑） | 已弃用，换腾讯云 TTS |
| 浏览器 AGC 会把哭声音量压平，声学检测不灵 | `getUserMedia` 把 `autoGainControl/noiseSuppression/echoCancellation` 全设 `false` |
| 任何含中文文件名的 `Move-Item` 在 PS 5.1 路径要双引号 | 已规避 |
| `*.glb` 在 git 仓库会膨胀 | `.gitignore` 排除，团队走外部分发 |

---

## 当前状态（截至 2025）

### 已完成
- P0：TTS / STT / 3D 数字人
- P1：家长后台 + 实时声学分析 + 持久化
- 任务 2：训练阶段进度条（DeepSeek 返回 `[STAGE:xxx]` → 前端 5 阶段 stepper）
- 任务 3：多年龄分级适配（3-5 / 6-9 / 10+ 三档：字号 × 表情 × prompt 词汇）
- 任务 4：Blender 模型需求文档（`BLENDER_MODEL_SPEC.md`）
- 任务 5：Git/GitHub 初始化（私有库 https://github.com/zimo66067-wq/shuzhi-xinyu）

### 跳过 / 待办
- 任务 1：Rhubarb 口型同步（等 Blender 模型上线后启用）
- 任务 6：阿里云部署（待定，需 HTTPS 才能用麦克风）
- 任务 7：超市购物场景训练

---

## 协作约定（跟 Claude）

- 改前/后端代码前先确认硬性约束 #1-#7
- 改 prompt（`backend/prompts/*.txt`）属于敏感操作，改完要跑 `/health` 和一轮真实对话验证
- 改 ASD-friendly 体验（动画 / 颜色 / 表情）要尤其谨慎，**默认低刺激**
- 默认不修改 `backend/` 下文件，除非用户明确授权
- 一次只做一件事，做完汇报，再继续下一件
- PowerShell 5.1 不支持 `&&`/`||`，要用 `;` + `if ($?)`
- 大改动前先 `git status` 看清楚有没有未提交的脏文件

---

## 待完善事项（完整报告见 docs/competitive-gap-report.md）

> 产品差距审查日期：2026-06-15
> Top 致命问题：1) 监管定位自相矛盾（README 标题"自闭症儿童社交评估系统"+"评估"措辞踩医疗器械/广告红线，又贴"非临床"自我否定）；2) 5 维评分自创、映射不到任何循证量表（ABA/ESDM/PEERS/SRS-2/Vineland/ATEC），无信效度；3) 危机处理是静默降级（检测到哭/激动只弹"去工具盒"，不把真实成人实时拉入）；4) 未成年敏感数据明文落地 + 出境第三方可用于训练，且 app 内无监护人知情同意流程；5) 无纵向追踪、无治疗师 console → 机构不会续费。
> 已据实修正简报两处过时假设：STT 实走腾讯云 ASR（非 Web Speech，大陆可用）；MediaPipe/draco 已本地托管、前端零外网 CDN（Google CDN 封锁风险已规避）。
> 详见 docs/competitive-gap-report.md

---

## 整改进度（详见 docs/remediation-progress.md）

> 整改执行日期：2026-06-15 · 依据 docs/competitive-gap-report.md
> 本轮已实现（前端 P0+P1）：去评估定位 / 知情同意页 / 危机叫真人 / 评分非临床标注 / 纵向趋势 / 感官开关（npm run build 通过）
> 待后端：docs/backend-change-requests.md · 待人工：docs/human-action-items.md · 临床映射占位：docs/scoring-framework-mapping.TEMPLATE.md
> 约束遵守：backend/（含 prompts/）全程只读未改；危机热线为占位、未编造；临床映射仅占位骨架。

## 整改进度（续，详见 docs/remediation-progress.md）
> 第 2 轮（2026-06-15）已实现（前端）：声学措辞中性化 / 面部分析单独提示 / 导出+永久删除 / IEP 目标 / 点按录音 / 家长配置扩展
> 仍阻塞：场景选择UI(待后端多场景)、PECS图卡(待素材+场景)、治疗师console(待单独重构)、本地加密(待密钥方案)
