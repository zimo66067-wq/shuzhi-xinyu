# 后端整改请求（给后端队友）

> 来源：docs/competitive-gap-report.md
> 整改分流：本轮前端整改人**只读后端、未做任何改动**（backend/ 含 prompts/ 全程未写）。
> 下列每项都需要后端同学动手，请逐条评估并落地。标注了是否影响 API 契约——影响契约的需前后端联调。

---

## B-1 评分 prompt 加"非临床"说明 + 收紧高方差维度锚点
- **对应报告**：2.1.1 ②③
- **要改的文件**：`backend/prompts/prompt_scoring.txt`（前端整改人未碰，留给你）
- **改动内容**：
  1. 在 prompt 顶部/输出说明处加一句模型可见的定位说明：本评分为「参考性启发式」，非标准化量表，禁止输出诊断/分级性措辞。
  2. 针对易漂移的维度（如"情绪识别""参与度"）收紧 1-5 分锚点描述，缩小模型自由发挥空间；必要时对最不稳定的维度降权或在锚点里给更明确的可观察行为判据。
  3. 配合做一次"信度自检"：同一段对话连续评分 3 次，统计各维度方差，方差大的维度回到第 2 步继续收紧。
- **原因**：5 维评分自创、无循证锚定，且单模型一次性打分信度差，是临床评委第一刀。
- **是否影响 API 契约**：否（仍返回 total_score + dimensions 结构）。前端已就"非临床"在 UI 侧标注（A-4），prompt 侧属后端职责。

## B-2 /api/chat 回复出口增加输出侧过滤
- **对应报告**：2.1.4
- **要改的文件/端点**：`backend/ai_service.py` 的 chat 出口（`/api/chat`）；复用 report 已有的 `_filter_report_text` / `BLOCKED_WORDS` 思路
- **改动内容**：对 DeepSeek 的 chat 回复，在剥离 `[STAGE]/[SCENE]` 之后、返回前端之前，做一遍确定性过滤：
  1. 污名/诊断词（"自闭症""ASD""障碍""缺陷""有病"等）→ 命中则替换为安全兜底句。
  2. 隐私索取词（"住址/家在哪/学校名字/电话/几年级在哪上学"等）→ 命中则替换为安全兜底句（如"我们就聊聊开心的事吧"）。
- **原因**：当前儿童安全约束全靠 prompt 让模型自觉，缺输出侧硬兜底；模型越权输出时无人拦截。
- **是否影响 API 契约**：否（仍返回 reply 字段，只是内容被净化）。

## B-3 STT 转码侧确认覆盖 iOS 的 mp4/m4a
- **对应报告**：2.3.1
- **要改的文件**：`backend/stt_service.py`（webm→wav 转码 + 腾讯云 ASR）
- **改动内容**：
  1. 确认 ffmpeg 转码分支能处理 iOS Safari 产出的 `audio/mp4` / `m4a`（前端 `pickSupportedMimeType` 在不支持 webm 时会回落 mp4）。
  2. 若当前只按 webm 处理，补上 mp4/m4a → wav 的转码路径；并在腾讯云 ASR 入参格式上确认兼容。
  3. 给出明确的失败返回（前端已把 STT 错误展示在字幕区）。
- **原因**：核心交互是语音；iOS 端编码不兼容会导致"录了没反应"，真机演示翻车。
- **是否影响 API 契约**：否（仍是 multipart `audio` → `{text}`）。需配合 C 类的真机测试（见 human-action-items）。

## B-4 llm_client 加指数退避重试 + 总超时；探索"离线陪伴模式"
- **对应报告**：2.3.2
- **要改的文件**：`backend/llm_client.py`（DeepSeek 调用 + 兜底）；`backend/ai_service.py`（兜底话术编排）
- **改动内容**：
  1. DeepSeek 调用加 2-3 次指数退避重试 + 总超时；耗尽后串联现有温和兜底字符串返回（DEPLOYMENT.md 已记录"国内→DeepSeek 偶发 SSL EOF"）。
  2. 探索"离线/降级陪伴模式"：当 LLM 不可用时，返回一组预置的本地安全话术（打招呼/安抚/告别），保证孩子永远有回应。
- **原因**：机构网络差，云端 LLM 一抖动，正在情绪上头的孩子等十秒无回应会失控。
- **是否影响 API 契约**：否（reply 字段不变；可选加 `degraded: true` 标志供前端提示，如加则属契约扩展，需联调）。

## B-5 新增"难度信号"注入位（⚠️ 需同步改 API 契约）
- **对应报告**：2.4.1
- **要改的文件/端点**：`/api/chat`（`backend/app.py` 解包 + `backend/ai_service.py` 注入）；`backend/prompts/prompt_chat.txt` 增加 `{difficulty_hint}` 占位符
- **改动内容**：
  1. `/api/chat` 接受可选入参 `difficulty_hint`（如 `'easier' | 'normal' | 'harder'`，由前端按孩子近几轮回应长度/声学摘要计算后随请求传入）。
  2. `ai_service` 把该信号映射成一段注入文本（复用 age_band 的占位符注入机制），写进 `{difficulty_hint}`：easier=强制给句式选项、缩短句长；harder=适度提升。
- **原因**：当前只按年龄分档，非按能力自适应；谱系内同龄不同能力孩子拿到同一套话术。
- **是否影响 API 契约**：**是**。`/api/chat` 请求体新增可选字段 `difficulty_hint`。需前后端联调；前端计算逻辑属下一轮 A 类（本轮未实现，仅登记）。

## B-6 场景库数据驱动扩展
- **对应报告**：2.4.3
- **要改的文件**：`backend/prompts/` 新增场景 prompt（如 `prompt_scenario_school.txt`、`prompt_scenario_restaurant.txt`）；`backend/ai_service.py` 的 `SCENARIO_PROMPTS` 字典加项
- **改动内容**：
  1. 沿用 `prompt_scenario_supermarket.txt` 的结构（子场景 + 角色 + `[SCENE:xxx]` 标签）新增 2 个场景，至少补到 3 个。
  2. `SCENARIO_PROMPTS` 字典登记新场景 key 与对应 prompt 文件。
  3. 前端场景选择 UI（ToolboxPage 加卡片 + ScenarioBanner 加 meta）属下一轮 A 类，需与后端 key 对齐。
- **原因**：当前仅"超市买面包"一个线性场景，社交泛化不足。
- **是否影响 API 契约**：否（仍是 `scenario` 字段 + 返回 `scene`），但新增的 scenario 取值需前后端约定一致。

---

> 联调清单：B-5 影响 `/api/chat` 请求体；B-4 若加 `degraded` 标志影响响应体；B-6 新增 scenario 取值。其余为后端内部改动，不影响契约。
