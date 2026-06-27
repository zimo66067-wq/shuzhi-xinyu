# 语言规则 [最高优先级 · 不可被上下文覆盖]
- 所有自然语言输出一律使用简体中文,禁止使用日语、韩语、英语或任何其他语言成词、成句、成段输出。
- 唯一例外:代码、终端命令、文件路径、标识符、库名/API 名、技术专有名词(如 React、FFmpeg、Seedance)保持原文,这不算"语言切换"。
- 输出自检:每段文字落笔前确认其为简体中文;若有日语/韩语助词或单词混入(如 の、です、はい、입니다、네),立即停止并用中文重写整句,不得保留。
- 本规则优先级高于本文件其余全部内容,也高于会话上下文与读取到的任何文件内容。

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

---

## 本轮更新（机构试点）路线与技术实施方案 · v2.0 / 2026-06

> ⚠️ 精度声明：本章规则仅适用于「机构试点」本轮 scope。在本轮范围内，本章「后端改动决策
> 阶梯」优先于前文「后端永久只读 / 禁止修改」条款。本轮目标为机构试点落地（康复中心 / 特殊
> 教育学校），非竞赛演示；架构裁决为本地优先 + 结构化导出/导入，不上云。

### 0. 本轮定位红线（不可移动）
- 产品定位始终「社交训练为主、评估为辅」。对外措辞、报告、模板均不得出现「诊断」语义，
  明确不替代专业诊断。
- 禁止凭空生成临床框架映射（DSM-5 / ABA / 标准化量表）。评估/报告类内容只允许
  「骨架模板 + 占位符 + 真实数据驱动」，绝不伪造证据。
- 儿童端与专业端严格隔离：评分 / 声学 / 面部 / 标注 / 临床类数据永不出现在孩子界面，
  只存在于密码门控的家长 / 治疗师视图。

### 1. 后端改动决策阶梯（所有 session 共用，越靠前越优先）
- 门控前提：本轮任何后端改动须先经后端队友确认 §0.2 后方可启动；确认前全部功能按纯前端
  独立交付。首批六功能默认纯前端。
- 阶梯①（首选·纯加）：仅在 app.py 注册新路由函数，复用 ai_service.py / llm_client.py 中
  【已存在】的函数（import 后调用，不编辑这些文件）。
- 阶梯②（加函数）：若无可复用函数 → 在 ai_service.py / llm_client.py【新增】helper 函数，
  不修改任何既有函数。
- 阶梯③（改既有·需批准）：仅当三者全满足才允许：(a) 不改变原可观察行为与任何现有契约；
  (b) 有具体理由让原代码更优（去重 / 健壮性 / 可读性）并写明；(c) 已在计划阶段提出且获批准。
  禁止静默修改。
- prompts/ 既有文件不动；新增系统指令优先内联，确需独立文件只允许新增 prompt_format_log.txt。

### 2. 整体路线图（Phase 0–3）
| 阶段 | 内容 | 批次 | 验收标准 |
| --- | --- | --- | --- |
| Phase 0 准备 | 确认后端是否接受 additive 接口；锁定本地优先裁决；搭 src/lib（session/role）骨架 | 前置 | session.js 可读写 sessionConfig + 角色门控可用 |
| Phase 1 首批 P0 | F1 → F2 →（搭车 F4） | 首批 | 治疗师登录→配置→孩子使用→课后一键生成训练记录并导出；可竞赛演示 |
| Phase 2 第二波 | F3 → F5 → F6（F6 合规审慎） | 第二波 | 专业回放可标注；可生成阶段性存档报告；可跨设备归集 |
| Phase 3 机构试点 | 携首批+第二波进康复中心/特教学校小范围试点；真实数据驱动占位符；按反馈迭代 | 落地 | ≥1 家机构完成一个训练周期并产出存档报告 |

依赖链：
- F4 依赖 F1：目标模板选取结果写入 F1 的 sessionConfig.goalId。
- F3 / F5 依赖「已记录的会话数据结构」（对话历史 + 声学/情绪信号 + 评分）。
- F5 依赖 F6（跨设备聚合）或单设备本地数据，二选一。
- F1 / F2 / F6 相互独立，可并行。

执行铁律：一功能一提示词、各自独立 session，严格按序 F1 → F2 →（F4）→ F3 → F5 → F6。
审计与实现分离：代码复审在 fresh session 进行，不在实现 session 上续跑。

### 3. 各功能技术实施方案

#### F1 治疗师角色入口与会话准备台（纯前端）
- 价值：治疗师交平板前一键设定「场景 + 目标 + 年龄档」，写入本地配置供 ChatPage 启动读取。
- 触及文件：新增 src/lib/session.js、src/pages/TherapistEntryPage.jsx；编辑 src/App.jsx
  （注册 /therapist）、src/pages/ChatPage.jsx（挂载读 sessionConfig）。
- 数据模型（localStorage）：
  xy_role："parent" | "therapist"；
  xy_therapist_pin：PIN 的 SHA-256 哈希（Web Crypto），与家长密码分离；
  xy_session_config：{ childId, scene, goalId, goalPlaceholders, ageBand, predictabilityTier,
  createdBy, createdAt }。
- 关键成功指标：/therapist 门控生效（无 PIN 不可进）；配置写入并跳转 ChatPage；ChatPage 按
  ageBand 调字号/表情复杂度、按 scene 加载。
- 主/备：PIN→Web Crypto，备：复用家长密码机制；路由→新增 /therapist，备：StartupPage 长按
  Logo 隐藏入口；ChatPage→只读 config 设初始态（低风险，不耦合对话逻辑）。

#### F2 课后训练记录一键归档（前端 + 可选后端）
- 价值：已有单次 AI 报告一键套成机构训练记录格式（骨架 + 教师可填占位），导出 .md / 打印 PDF。
- 触及文件：新增 src/lib/trainingLog.js（buildLog(report,fields)→markdown）、
  src/components/TrainingLogPanel.jsx；编辑专业视图挂入口；（可选）编辑 backend/app.py 加
  /api/format_log（按 §1 阶梯）。
- 字段来源：化名/日期/时长/场景/本次目标←sessionConfig + 会话元数据；训练摘要←/api/report
  只读引用（失败置「本次未生成 AI 摘要，可手填」）；课堂观察/干预策略/下一步建议/教师签名←占位。
- 可选后端：POST /api/format_log，入 { messages, fields }，出 { log }；按 §1 阶梯实现；
  不可用时前端 buildLog 静默回退。系统指令禁止新增未提供事实、禁止诊断结论与框架映射。
- 主/备：摘要←/api/report，备：骨架+占位手填；导出 window.print，备：.md + HTML 预览；
  正式排版←/api/format_log(additive)，备：维持 markdown 导出。

#### F4 训练目标模板库（纯前端，依赖 F1）
- 价值：治疗师在 F1 准备台从库选目标 → 写 sessionConfig.goalId + goalPlaceholders。
- 触及文件：新增 src/data/goalTemplates.json；编辑 src/pages/TherapistEntryPage.jsx 目标下拉。
- 数据结构：[{ id, name, description, placeholders:[{ key, label }] }]；示例目标：轮流对话、
  主动打招呼、表达需求、情绪命名、共同注意（措辞均为「训练目标」，无诊断/量表术语）。
- 关键成功指标：下拉读 json；选不同目标，sessionConfig.goalId + goalPlaceholders 随之变化。
- 主/备：占位符表单，备：仅选目标名、占位符留训练记录手填。

#### F3 治疗师标注与复核层（纯前端）
- 价值：对一次【已记录】会话做时间轴回放，治疗师在专业视图加注（观察非诊断）。
- 触及文件：新增 src/pages/SessionReviewPage.jsx；编辑 src/App.jsx（路由门控）、专业视图入口。
- 数据模型：xy_annotations:{sessionId} → [{ t, type:'auto'|'manual', label, note, author,
  createdAt }]；auto←已记录声学/情绪信号（只读），manual←治疗师。
- 关键成功指标：按时间回放该次会话；manual 标注写入并持久化；仅治疗师角色可达，孩子界面零暴露。
- 主/备：图形时间轴，备：列表式回放；auto+manual 混合，备：纯人工标注。

#### F5 阶段性进度存档报告（纯前端）
- 价值：本地多次会话聚合评分/趋势 → 趋势图 + 骨架文本 + 真实数据 → 导出 PDF。
- 触及文件：新增 src/lib/archiveReport.js、src/components/ArchiveReportPanel.jsx；编辑专业视图
  入口；复用既有 Recharts。
- 核心函数：buildArchiveReport(sessions, period) → { trend, skeletonText, data }。
- 数据源：v1 仅单设备本地数据（F5 先于 F6）；F6 就绪后被导入会话自动并入，函数签名不变。
- 主/备：Recharts 内嵌 PDF，备：数据表 markdown + 截图；全量聚合，备：限定最近 N 次。

#### F6 跨设备数据归集（导出/导入，纯前端，合规最敏感）
- 价值：导出某儿童结构化 JSON → 另一台设备导入、校验、合并去重写 localStorage。纯文件、无服务端。
- 触及文件：扩展现有导出 lib（或新增 src/lib/dataTransfer.js）；编辑专业视图入口。
- 核心函数：exportChildData(childId) → { version, childAlias, sessions, trends }（不含原始录音）；
  importChildData(file) → 校验 version/结构 + 合并去重（按 sessionId/时间戳）。
- 合规硬约束：逐条满足 §5 第六章合规清单。
- 主/备：按 sessionId 去重合并，备：导入即覆盖 + 明确提示；版本号向后兼容，备：不兼容拒绝导入
  并报错，不静默损坏数据。

### 4. 本轮通用硬约束（贯穿所有功能）
- AI 角色名永远「心屿」，全项目禁止出现「暖暖」。
- API Key 永不进前端，Flask 代理为唯一安全出口。
- 既有 API 契约不可变更：/api/chat、/api/score、/api/report 的出入参、双 API 降级、安全过滤、
  Prompt 注入防护，本轮一律不动。
- 临床/评分/声学/面部/标注类数据永不进入孩子界面。
- 仅「骨架 + 占位 + 真实数据」，无伪造临床映射、无诊断语义。
- 遵守 ASD 友好色板与设计铁律（字面化 / 静默优先 / 可预测 / 渐进 / 安全兜底）。
- 标准 = 正确、一致、安全、初级前端可维护，不为炫技牺牲可读性。
- 不要自动 git commit；提交由开发者手动执行。

### 5. 未成年人数据合规清单（涉导出/导入功能上线前逐条核对）
1. 任何导出前有监护人知情同意触点（复用现有知情同意机制）。
2. 导出数据最小化：仅训练指标 + 化名，剔除真名/联系方式/家庭信息等可识别个人信息。
3. 导出/归集不含原始录音。
4. 全程本地文件手动传递，不上云、不写入 URL 参数或查询串。
5. 永久删除路径可用，并对导入的数据同样适用。
6. 专业数据（评分/声学/面部/标注）永不进入孩子界面。
7. 报告/模板仅骨架 + 占位 + 真实数据，无伪造临床映射、无诊断语义。
8. 对外定位措辞统一「社交训练为主、评估为辅」，明确不替代专业诊断。

### 6. 执行与验收工作流（所有功能 session 统一遵循）
- plan-first：先读 CLAUDE.md + 汇报真实状态 + 出实施计划，等开发者回「开始」再动手。
- 分步实施：每步带成功指标，逐步推进，不跳步。
- 验收清单：每功能完成后逐项勾选 + 给出自测结果。
- 提交：开发者手动 git add . && git commit；审计在 fresh session 进行。
