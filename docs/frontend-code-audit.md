# 前端代码严谨性审查报告

> 审查对象：`frontend/`（React + Vite + Three.js）
> 审查方式：只读全量扫描 `frontend/src/` + 只读核对 `backend/` API 契约 → 批量修复 → 构建自检
> 后端只读，本次对 `backend/` 零写操作。

---

## 审查信息

| 项 | 值 |
|---|---|
| 审查日期 | 2026-06-15 |
| 实际审查路径 | `C:\Users\Administrator\Desktop\数智心屿_完整项目 (1)\frontend\`（任务书写的 `D:\autism-trainer\` 在本机不存在，按当前工作区的「数智心屿」项目执行，二者为同一类项目） |
| 构建结果 | ✅ `npm run build` 通过（1281 模块，8.19s，无语法/导入错误） |
| 是否提交 git | ❌ 未提交（按要求，改完停手等你 review） |

---

## 总览

| 铁律维度 | 结论 |
|---|---|
| A 命名一致性 | ✅ 全代码/文案/注释只有「心屿」，无「暖暖 / Nuannuan」残留 |
| 密钥零容忍 | ✅ 前端任何文件无 `sk-` / DeepSeek / 腾讯云 key |
| B API 契约 | ✅ 全部 `{messages:[{role,content},...]}`，无扁平 `message` 字符串；响应字段 `reply/stage/scene` 与后端一致。⚠️ base URL 散落已收敛（见已修复 #1） |
| C 儿童安全边界 | ⚠️ 1 处违反已修复（面部指标开关无门控，见已修复 #3） |
| D 错误处理 | ✅ 每个 fetch 都有 try/catch + 温和兜底；3D 失败降级到球体几何（非 emoji） |
| E 状态与卫生 | ⚠️ 1 处未用导入已修复（见已修复 #2）；console.* 由构建剥离，非缺陷 |
| F ASD 设计落地 | ✅ 布局/位置稳定；动画克制。有 2 处「与文档描述的偏差」仅记录，未改 |

**发现总数：已修复 3 · 路线图/未启用项（跳过）若干 · 后端问题（仅记录）1 · 其他观察（未改）5**

---

## 一、[已修复]（3 项，全部在 `frontend/` 内）

### #1　后端 base URL 散落且不一致 —— 收敛到单一常量
- **文件**：新增 `frontend/src/lib/api.js`；改动 `lib/tts.js`、`lib/stt.js`、`lib/parentAuth.js`、`pages/ParentPage.jsx`、`pages/ChatPage.jsx`
- **问题**：同一个「后端地址」有 4 种写法 —— `tts.js`/`stt.js` 用 `import.meta.env.VITE_API_BASE`、`ParentPage` 自己写 `const API_BASE = ''`、`ChatPage` 直接硬编码 `/api/chat`、`parentAuth` 直接硬编码 `/api/parent/verify`。后果不只是风格不齐：`/api/chat` 和 `/api/parent/verify` **忽略了 `VITE_API_BASE`**，一旦前后端跨源部署，聊天和家长验证会断，而 TTS/STT 却正常 —— 这是个潜在的部署期 bug。
- **改法**：新建 `lib/api.js` 导出唯一常量 `export const API_BASE = import.meta.env.VITE_API_BASE || ''`，5 处调用统一改成 `` `${API_BASE}/api/xxx` ``。开发期留空走 vite proxy，部署只改一个地方。未引入任何环境管理库。

### #2　ChatPage 引入了未使用的 `TrainingStepper` 默认导出（死代码）
- **文件**：`frontend/src/pages/ChatPage.jsx`
- **问题**：`import TrainingStepper, { stageFromRoundCount } from '../components/TrainingStepper'`，但因 Q3 决策「自由聊天模式隐藏阶段进度条」，组件 `TrainingStepper` 实际从未渲染，只用到具名导出 `stageFromRoundCount`。默认导入成了未使用变量。
- **改法**：改为 `import { stageFromRoundCount } from '../components/TrainingStepper'`。`TrainingStepper.jsx` 文件保留（是 Q3 刻意隐藏、将来可能恢复的组件，未删）。

### #3　儿童安全边界：面部指标（MediaPipe 输出）开关无密码门控（铁律 C）
- **文件**：`frontend/src/pages/ChatPage.jsx`
- **问题**：ChatPage 顶栏的「家长视图」开关（👨‍👩‍👧）孩子一点就能开启 `FaceMetrics` 浮窗，实时显示微笑度/皱眉度/张嘴度/正脸朝向（MediaPipe 分析数据）。铁律 C 明确「MediaPipe 输出绝不出现在儿童可见组件」，且要求「分析类数据只能在家长视图且受密码门控」——而该开关此前没有任何门控。
- **改法**（按你的选择「加密码门控」）：复用现有 `PasswordGate` 组件，与家长后台评分用同一把锁。
  - 新增状态 `showParentGate`；
  - 新增 `toggleParentView()`：**关闭随时可**，**开启**则先查 `getToken()`，无有效家长 token 就弹 `PasswordGate`，输对密码（后端 `/api/parent/verify` 校验）后才真正开启；
  - 未授权的孩子点开关 → 只会看到密码框 → 取消即返回，**绝不暴露任何面部指标**。

---

## 二、[路线图 / 未启用项 —— 跳过，未当 bug 处理]

按约束 #6「未开工/未启用的功能不是缺陷」，以下仅记录状态，未改动、未实现：

- **任务 1 口型同步精修（Rhubarb）**：`useLipSync.js` 已用「音量+频段启发式」实现基础口型；文档所述 Rhubarb 级精修依赖 Blender 模型上线，属未启用，跳过。
- **VRM 模型文件**：`XinyuModel.jsx` 加载 `/models/xinyu.vrm`，该文件按约定不入 git（外部分发）。加载失败时 `XinyuScene` 已有 `ErrorBoundary + Suspense` 降级到球体几何（非 emoji），降级路径正确。
- **`TrainingStepper` 组件**：Q3 决策下当前不渲染（自由聊天不展示「训练/阶段」字样），组件保留备用。未删、未强行恢复。

> 说明：CLAUDE.md 标注的多数 P0–P2 功能（TTS/STT/3D/家长后台/声学分析/场景训练）在本前端**已实现并接线**，故按「已实现代码」标准审查，未列入跳过项。

---

## 三、[后端问题 —— 仅记录，未动手]

### B-1　后端 Demo 首页健康检查字段与 `/api/health` 响应不符
- **位置**：`backend/app.py` 第 222 行（`HOME_HTML` 内嵌脚本）
- **问题**：首页脚本读取 `d.last_llm` 拼接「服务正常 · LLM: …」，但 `/api/health`（同文件第 490-494 行）只返回 `{"status":"ok"}`，并无 `last_llm` 字段 → 首页会显示「服务正常 · LLM: undefined」。
- **为何没动**：属于后端文件，本次绝对约束「backend/ 只读」。且仅影响后端自带的调试首页，不影响 React 前端（前端不调该首页、也不依赖 `last_llm`）。建议后端自行决定是补字段还是改文案。

> 其余后端契约（`/api/chat` 的 `scenario` 可选入参、响应含 `stage/scene/age_band`；`/api/score`、`/api/report` 需 `Authorization: Bearer` 家长 token）与前端调用**完全吻合**，无错配。

---

## 四、其他观察（评估后**未改动**，附理由）

这些不构成正确性/安全/契约缺陷，且修改会触及「最小侵入 / 不过度重构 / 谨慎对待 ASD 体验」的约束，故仅记录、不强改：

1. **散落的硬编码十六进制色值**：色板主色已在 `index.css :root` 用 CSS 变量集中定义并广泛引用；但部分 inline 样式与 `index.css` 局部仍有字面 hex（如 `#7B4A4A` 按钮文字、`scenario-banner` 里重复了 `--text-main`/`--text-sub` 的值，`FaceMetrics`/`ScoreRadarChart`/`XinyuScene` 的颜色）。其中 3D 光照色、Recharts 图表色不读 CSS 变量，本就不宜变量化。全面替换是一次跨多文件的纯外观重构，对低刺激 UI 有回归风险，收益低，**建议保留现状**或日后单独小步处理。
2. **`bg-training` 背景渐变动画**：ChatPage 背景 30s 无限缓变（`#FFF5E6→#FFEFD9→#FFE8D6`），属装饰性动画。变化极慢极弱，但严格按「静默优先」可去掉。涉及 ASD 体验判断，未擅自改。
3. **ChatPage 布局比例与文档（10/45/35/10）的偏差**：现版把「对话历史」改为侧边抽屉（`history-drawer`），中央 3D 区 `flex:1` 占满中部，是 Q 系列竞赛迭代的刻意设计，功能正常。未强行还原旧比例。
4. **前端无显式 `/api/health` 探活**：前端靠 `navigator.onLine` + 每次请求的 try/catch 温和兜底来应对后端不可用，无主动健康轮询。当前降级体验已可预测（断网横幅 + 「心屿暂时说不出话」），新增探活属新功能，未实现。
5. **构建产物体积告警**：`index.js` ≈1641kB > `chunkSizeWarningLimit`(1600)。源于 three.js + @mediapipe + recharts，`vite.config.js` 已注明「目前不影响交付」。非本次改动引入，未处理。

---

## 五、构建自检结果

```
> vite build
vite v6.4.2 building for production...
✓ 1281 modules transformed.
dist/index.html                 0.40 kB │ gzip:   0.29 kB
dist/assets/index-*.css        14.16 kB │ gzip:   3.24 kB
dist/assets/index-*.js      1,641.47 kB │ gzip: 468.23 kB
(!) Some chunks are larger than 1600 kB  ← 既有体积告警，非本次引入
✓ built in 8.19s
```

无语法错误、无未解析导入。仅有上述体积告警。

---

## 六、验收对照

- [x] `backend/` 下零写操作
- [x] 全代码无「暖暖」、无前端密钥、无扁平 `message` 字符串
- [x] 儿童可见组件零临床/评分数据泄露（面部指标开关已加密码门控）
- [x] 所有 fetch 有 try/catch + 温和兜底
- [x] 路线图/未启用项被正确跳过，未误改、未误实现
- [x] `npm run build` 通过
- [x] 本报告已生成（`docs/frontend-code-audit.md`）
- [x] 未执行任何 git 提交
