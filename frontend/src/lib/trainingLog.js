/**
 * trainingLog.js — 机构训练记录生成器
 *
 * buildLog(report, fields) → markdown 字符串
 *   report : /api/report 输出的 report_text 字符串；空则用占位
 *   fields : 教师填写的字段对象（见 FIELD_KEYS）
 *
 * 设计约束：
 * - 纯本地运算，不依赖任何后端接口，作为基线始终可用
 * - 只整理已有数据 + 教师手填内容，禁止生成任何未提供的临床数据或诊断语义
 * - 所有来源空缺时退化为「____」或「（请填写）」占位，不报错
 */

import { getSessionConfig } from './session'

// goalId → 中文名称（与 TherapistEntryPage 的 GOAL_OPTIONS 保持一致）
const GOAL_ID_MAP = {
  turn_taking: '轮流对话',
  greeting: '主动打招呼',
  express_need: '表达需求',
  emotion_naming: '情绪命名',
  joint_attention: '共同注意',
}

// scene 值 → 中文名称
const SCENE_NAME_MAP = {
  free: '自由对话',
  supermarket: '超市购物',
}

function blank(value, fallback = '____') {
  if (value == null || String(value).trim() === '') return fallback
  return String(value).trim()
}

/**
 * 从 sessionConfig + fields 推算显示值
 * @param {Object} fields - 教师填写字段
 */
function resolveFields(fields) {
  const cfg = getSessionConfig()

  const childAlias = blank(
    fields.childAlias ?? cfg?.childId,
  )

  const date = blank(
    fields.date,
    new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }),
  )

  const duration = blank(fields.duration)

  const scene = blank(
    fields.scene ?? (cfg?.scene ? SCENE_NAME_MAP[cfg.scene] : ''),
  )

  const goal = blank(
    fields.goal ?? (cfg?.goalId ? GOAL_ID_MAP[cfg.goalId] : ''),
  )

  return { childAlias, date, duration, scene, goal }
}

/**
 * 生成机构训练记录 markdown
 *
 * @param {string} report  - /api/report 的 report_text（可为空）
 * @param {Object} fields  - 教师填写字段
 *   childAlias  {string}  孩子化名
 *   date        {string}  训练日期
 *   duration    {string}  时长（分钟）
 *   scene       {string}  场景（可覆盖 sessionConfig）
 *   goal        {string}  本次目标（可覆盖 sessionConfig）
 *   observation {string}  课堂观察
 *   intervention{string}  干预策略
 *   nextStep    {string}  下一步建议
 *   teacherName {string}  教师签名
 * @returns {string} markdown
 */
export function buildLog(report = '', fields = {}) {
  const { childAlias, date, duration, scene, goal } = resolveFields(fields)

  const aiSummary = report && report.trim()
    ? report.trim()
    : '（本次未生成 AI 摘要，可手填）'

  const observation  = blank(fields.observation,  '（请填写）')
  const intervention = blank(fields.intervention, '（请填写）')
  const nextStep     = blank(fields.nextStep,     '（请填写）')
  const teacherName  = blank(fields.teacherName)

  return `# 社交训练记录

> 本记录为社交训练参考材料，仅供专业人员内部使用，不可用于诊断或分级。

---

## 基本信息

| 项目 | 内容 |
|------|------|
| 儿童（化名） | ${childAlias} |
| 训练日期 | ${date} |
| 训练时长 | ${duration === '____' ? '____' : duration + ' 分钟'} |
| 训练场景 | ${scene} |
| 本次目标 | ${goal} |

---

## 训练摘要（AI 生成，仅供参考）

${aiSummary}

*本摘要由 AI 辅助生成，仅反映本次对话参与情况，非标准化评估，不可用于诊断。*

---

## 课堂观察（教师填写）

${observation}

---

## 干预策略（教师填写）

${intervention}

---

## 下一步建议（教师填写）

${nextStep}

---

## 教师确认

教师签名：${teacherName}　　日期：${date}

---

*数智心屿 · 社交训练为主、评估为辅 · 本记录不替代专业诊断*
`
}

/**
 * 触发 .md 文件下载
 * @param {string} markdown
 * @param {string} [filename]
 */
export function downloadMarkdown(markdown, filename) {
  const date = new Date().toISOString().slice(0, 10)
  const name = filename || `xinyu-training-${date}.md`
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
