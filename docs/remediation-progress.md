# 整改进度表（全量分流）

> 整改执行日期：2026-06-15 · 依据：docs/competitive-gap-report.md
> 分流四类：**A 前端本轮实现** / **B 需后端配合** / **C 需人工·外部** / **D 占位待填（有捏造风险）**
> 本轮只实现 A 类的 P0+P1 六项（A-1~A-6）；其余前端项登记为"下一轮"，本轮不动手。
> 约束：后端（含 prompts/）全程只读未改；危机热线号码为占位；临床映射仅占位骨架。

---

## 一、本轮已实现（A 类 · 前端 P0+P1）

| 编号 | 标题 | 分类 | 本轮状态 | 落地位置 |
|---|---|---|---|---|
| A-1 | 去"评估系统"定位、改对外措辞 | A | ✅ 已实现 | README 标题/声明、ParentPage 标题/按钮/错误文案、ScoreRadarChart 系列名；grep 确认前端+README 无残留"评估系统/社交能力评估" |
| A-2 | 监护人知情同意页 | A | ✅ 已实现 | `components/ConsentGate.jsx`；`StartupPage` 首次启动门控；`App.jsx` consent 持久化 |
| A-3 | 危机升级"叫真实成人" | A | ✅ 已实现 | ChatPage 安抚横幅"叫大人"按钮+提示音+"等大人来"；同意页"全程陪同"勾选；ParentPage 危机求助区块（号码占位）；README/PRIVACY 补"非危机干预工具" |
| A-4 | 评分 UI 非临床标注 | A | ✅ 已实现 | ParentPage 评分区 + 报告区固定标注"参考性启发式，非标准化量表，不可用于诊断或分级" |
| A-5 | 纵向评分历史 + 趋势折线 | A | ✅ 已实现 | `components/ScoreTrendChart.jsx`（Recharts，零新依赖）；ParentPage 写 `xinyu_scoreHistory` + 渲染；仅家长区，ChatPage 零泄露 |
| A-6 | 感官开关 + reduced-motion | A | ✅ 已实现 | `index.css` prefers-reduced-motion + `.reduce-motion`；ParentPage 三开关存 `xinyu_settings`；ChatPage TTS/声学按开关生效；XinyuModel 浮动/摇头按开关停 |

---

## 二、需后端配合（B 类 → docs/backend-change-requests.md）

| 报告编号 | 标题 | 分类 | 本轮状态 | 去向 |
|---|---|---|---|---|
| 2.1.1 ② | 评分 prompt 加"非临床"说明 | B | ⏳ 待后端 | B-1 |
| 2.1.1 ③ | 收紧/降权高方差维度锚点 + 信度自检 | B | ⏳ 待后端 | B-1 |
| 2.1.4 | /api/chat 回复出口加输出侧过滤（污名词+隐私索取词） | B | ⏳ 待后端 | B-2 |
| 2.3.1（转码） | STT 转码侧确认覆盖 iOS mp4/m4a | B | ⏳ 待后端 | B-3 |
| 2.3.2 | llm_client 指数退避重试+总超时；离线陪伴模式 | B | ⏳ 待后端 | B-4 |
| 2.4.1（注入位） | 新增 difficulty_hint 注入位（⚠️ 改 API 契约） | B | ⏳ 待后端 | B-5 |
| 2.4.3（后端） | 场景库数据驱动扩展（prompt + SCENARIO_PROMPTS） | B | ⏳ 待后端 | B-6 |

---

## 三、需人工 / 外部（C 类 → docs/human-action-items.md）

| 报告编号 | 标题 | 分类 | 本轮状态 | 去向 |
|---|---|---|---|---|
| 2.6.1（链路） | 香港免备案 HTTPS 演示链路 | C | 🙋 待人工 | C-1 |
| 2.3.1（真机） | iOS/桌面真机过语音链路 | C | 🙋 待人工 | C-2 |
| 2.2.2 | 与 DeepSeek/腾讯云谈"不用于训练"/DPA | C | 🙋 待人工 | C-3 |
| 2.6.2 / 2.6.3 | 机构试点 + 临床联合署名 + 采购路径 | C | 🙋 待人工 | C-4 |
| 2.3.3 | 大陆真机 DevTools Network 截图存档 | C | 🙋 待人工 | C-5 |
| 2.2.1（法务） | 知情同意/PRIVACY 全文法务复核 | C | 🙋 待人工 | C-6 |
| 2.1.3（号码） | 危机求助热线号码核实填入（占位待替换） | C | 🙋 待人工 | C-7 |
| 报告第 5 节 | 全部"不确定项"逐项调研 | C | 🙋 待人工 | C-8 |

---

## 四、占位待填（D 类 · 有捏造风险）

| 报告编号 | 标题 | 分类 | 本轮状态 | 去向 |
|---|---|---|---|---|
| 2.1.1 ①（循证映射） | 5 维 × 循证框架条目 × 文献 映射 | D | 📝 占位待填 | `docs/scoring-framework-mapping.TEMPLATE.md`（每格"待团队据真实文献填写，禁止编造"） |

---

## 五、前端·下一轮（本轮只登记，不实现）

| 报告编号 | 标题 | 分类 | 本轮状态 | 备注 |
|---|---|---|---|---|
| 2.2.3 | 面部分析使用前单独提示 + 声学解读措辞中性化 | A（下一轮） | 🔜 下一轮 | 前端可做，去"模式/障碍"暗示 |
| 2.4.1（前端） | 计算 difficulty_hint 随请求传入 | A（下一轮） | 🔜 下一轮 | 依赖 B-5 契约 |
| 2.4.2 | PECS/图卡作答 + 轮流视觉支持 | A（下一轮） | 🔜 下一轮 | 前端 UI |
| 2.4.3（前端） | 场景选择 UI（ToolboxPage 卡片 + ScenarioBanner meta） | A（下一轮） | 🔜 下一轮 | 依赖 B-6 场景 key |
| 2.5.2 | next_training 升级为可采纳/可追踪目标（IEP 式） | A（下一轮） | 🔜 下一轮 | 复用 scoreHistory 存储 |
| 2.7.2 | 运动无障碍：点按切换录音 + 可调最短时长 | A（下一轮） | 🔜 下一轮 | usePushToTalk 改造 |
| 2.7.3 | 家长可配置项扩展（语速/音量/单次时长/话题） | A（下一轮） | 🔜 下一轮 | 复用 settings + speak 已有 rate/volume |

---

## 六、战略 / 大改（非本轮范围）

| 报告编号 | 标题 | 分类 | 本轮状态 | 备注 |
|---|---|---|---|---|
| 2.5.3 | 治疗师/老师专业方 console（多孩子管理） | C/大改 | 🔜 战略 | 先出原型图；childInfo 改多孩子模型 |
| 2.5.1（机构版） | 评分后端持久化（SQLite） | B/大改 | 🔜 战略 | 本轮已用 localStorage 起步，机构版再上后端 |

---

## 七、本轮自检

- [x] backend/ 下零写操作（含 prompts/）——全程只读
- [x] grep 确认前端 + README 无残留"评估系统/社交能力评估"对外字样
- [x] 趋势折线/评分仅在密码门控家长区，ChatPage 零泄露
- [x] 危机功能指向真实成人；热线号码为占位、非编造
- [x] 临床框架映射仅为占位骨架，无任何编造的循证断言
- [x] B/C/D 三份文档 + 本进度表均已生成，报告无项遗漏
- [x] `npm run build` 通过（vite v6.4.2，1283 模块，built in ~7.8s，EXIT=0；仅有既有的分包大小警告，非错误）
- [x] 未执行 git 提交

> 说明：报告全部差距项（2.1.1~2.7.3）已逐条落入上述六张表之一，无静默丢弃。

---

## 八、第 2 轮已实现（A 类 · 前端续，2026-06-15）

> 承接第一轮「五、前端·下一轮」，本轮实现其中 6 项纯前端、不改契约的工作（P-1~P-6）。
> 约束遵守：backend/（含 prompts/）全程只读未改；扩展单一 `xinyu_settings`，未新建并行设置 store；
> 所有家长向内容（声学/面部/目标/配置）仅在密码门控家长区或家长视图内，ChatPage 零泄露。

| 编号 | 报告项 | 状态 | 落地位置 |
|---|---|---|---|
| P-1 | 2.2.3 声学解读措辞中性化 | ✅ 已实现 | `pages/ParentPage.jsx`：`interpretPitch`「语调偏单调/情绪起伏较大」→「声音比较平稳/起伏较大」；底部说明去掉「与社交沟通模式相关/诊断」，改为「今天说话的音量和停顿情况，仅供了解，不代表任何评估或诊断」 |
| P-2 | 2.2.3 面部分析开启前单独提示 | ✅ 已实现 | `components/FaceMetrics.jsx` 新增 `confirmed` 一次性确认卡「即将开启摄像头做面部表情参考，仅本地处理、不上传、不录像」，确认才进 getUserMedia；`ChatPage` 传 `onCancel` 取消即关家长视图；默认关闭（visible 才启）不变 |
| P-3 | 2.2.2（部分）导出 + 永久删除 | ✅ 已实现 | `App.jsx` 新增 `wipeAllData()`（清空全部 `xinyu_*` localStorage + sessionStorage → 跳根路径回首启态）；`ParentPage.jsx`「本设备数据」区块：导出 JSON 备份 + 二次确认永久删除 |
| P-4 | 2.5.2 IEP 式可追踪目标 | ✅ 已实现 | 新建 `components/GoalTracker.jsx`；`ParentPage` 接入：`score.next_training` 旁「设为本周目标」→ 结构化模板（行为 + 频次 + 周期 + **家长手选 1 个相关维度，不自动猜**），存 `xinyu_goals`；目标卡进度复用 `scoreHistory`（A-5 产物）算所选维度 baseline→最新 变化 |
| P-5 | 2.7.2 点按录音 + 可调最短时长 | ✅ 已实现 | `App.jsx` settings 加 `recordMode/minRecordMs`；`hooks/usePushToTalk.js` 接 `minRecordMs` 替换硬编码 300；`ChatPage` 按 `recordMode` 切换长按/点按（点一下开始、再点停止），**保留长按 + 文字输入**；`ParentPage` 录音设置 UI |
| P-6 | 2.7.3 家长可配置项扩展 | ✅ 已实现 | `App.jsx` settings 加 `ttsRate/ttsPitch/ttsVolume/sessionLimitMin`；`ChatPage` 两处 `speak()` 接出语速/音调/音量、依恋护栏 15 分钟改读 `sessionLimitMin`；`lib/tts.js` 腾讯云音频接 `volume/playbackRate`（默认 1.0 无回归，pitch 仅 Web Speech 兜底消费）；`ParentPage` 朗读与时长设置 UI |

### `xinyu_settings` 字段变化（单一扩展，无并行 store）
- 原有：`autoTTS / animations / acoustic`
- 本轮新增：`recordMode`(默认 'hold')、`minRecordMs`(300)、`ttsRate`(1.0)、`ttsPitch`(1.0)、`ttsVolume`(1.0)、`sessionLimitMin`(15)
- 读取用 `{...DEFAULT_SETTINGS, ...JSON.parse(saved)}` 合并，老用户旧数据自动补默认。
- 另新增独立数据键 `xinyu_goals`（与 `xinyu_scoreHistory` 平级，非设置 store）。

## 九、第 2 轮明确不做（登记阻塞原因，未动手、未凑占位）

| 报告编号 | 标题 | 阻塞原因 |
|---|---|---|
| 2.4.3 | 场景选择 UI | 后端现仅 1 个场景（supermarket），不给不存在的场景做选择器；待后端多场景（B-6）后再做 |
| 2.4.2 | PECS 图卡 | 需真实图片素材（设计）+ 后端场景状态，禁止用 emoji 占位冒充 |
| 2.5.3 | 治疗师 console / 多孩子 | 大型数据模型重构（childInfo 单→多），留单独一轮 |
| 2.2.2 | 本地加密 | 家长密码派生 key 与「孩子免密对话」架构冲突，需先定密钥方案 |

## 十、第 2 轮自检

- [x] backend/ 下零写操作（含 prompts/）——全程只读
- [x] 6 项（P-1~P-6）均实现；`npm run build` 通过（vite v6.4.2，1284 模块，built in ~11.6s，EXIT=0；仅既有分包大小警告，非错误）
- [x] 家长向内容（声学/面部/目标/配置）仅家长区或家长视图，ChatPage 仅「读 settings 生效」，零泄露
- [x] 点按录音为长按的可选替代；长按 + 文字输入路径均保留
- [x] `xinyu_settings` 为单一扩展，无重复 store
- [x] 被剔除 4 项未动手、未凑占位，阻塞原因已登记（八/九）
- [x] 本轮无新增后端需求，未改 `backend-change-requests.md`
- [x] 未执行 git 提交
