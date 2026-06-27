/**
 * archiveReport.js — 阶段性进度存档报告聚合器（F5，纯前端）
 *
 * buildArchiveReport(sessions, period) → { trend, skeletonText, data }
 *   sessions : 本地已存的多次会话评分，结构 [{ date, total_score, dimensions }]
 *              （来源 localStorage['xinyu_scoreHistory']）
 *   period   : ARCHIVE_PERIODS 中的一项（聚合时间区间 / 最近 N 次）
 *
 * 合规约束：
 * - 仅「骨架 + 真实数据填充」，绝不编造未发生的进步或结论
 * - 训练进度叙述为中性事实（上升/下降/持平），无 DSM-5/ABA/量表术语、无诊断语义
 * - 定位「社交训练为主、评估为辅」
 *
 * F6 就绪后：被导入的会话只是 xinyu_scoreHistory 多出的条目，本函数直接一并读取，
 * 签名无需改动（本次不为 F6 预留特殊逻辑）。
 */

// 与后端 /api/score 及既有图表组件固定一致的 5 维度顺序
const DIMENSIONS = ['主动发起', '话题维持', '情绪识别', '礼貌用语', '参与度']

const DAY_MS = 24 * 60 * 60 * 1000

// period 预设（供面板下拉与本函数共用，避免重复定义）
export const ARCHIVE_PERIODS = [
  { key: 'all', label: '全部', days: null, maxCount: null },
  { key: '30d', label: '近 30 天', days: 30, maxCount: null },
  { key: '90d', label: '近 90 天', days: 90, maxCount: null },
  { key: 'recent10', label: '最近 10 次', days: null, maxCount: 10 },
]

function toNum(v) {
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0
}

function mean(arr) {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function round1(n) {
  return Math.round(n * 10) / 10
}

function fmtDate(iso) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return '—'
  }
}

// 中性事实措辞：仅描述数值变化方向，不做"进步/改善"等结论
function deltaWord(d) {
  if (d > 0) return `上升 ${d}`
  if (d < 0) return `下降 ${Math.abs(d)}`
  return '持平'
}

/**
 * @param {Array} sessions
 * @param {{key, label, days, maxCount}} period
 * @returns {{ trend: Array, skeletonText: string, data: object }}
 */
export function buildArchiveReport(sessions, period) {
  const list = Array.isArray(sessions) ? sessions : []
  const p = period || ARCHIVE_PERIODS[0]

  // 1. 时间过滤
  const sinceTs = p.days == null ? null : Date.now() - p.days * DAY_MS
  let filtered = list.filter((s) => {
    if (!s || !s.date) return false
    if (sinceTs == null) return true
    const t = new Date(s.date).getTime()
    return !Number.isNaN(t) && t >= sinceTs
  })

  // 2. 按时间升序（防御：源数据本是追加序，仍排序保稳）
  filtered = filtered
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // 3. 最近 N 次上限（备用方案：限定聚合量）
  if (p.maxCount != null && filtered.length > p.maxCount) {
    filtered = filtered.slice(-p.maxCount)
  }

  const count = filtered.length

  // 空数据：返回结构完整但计数为 0 的对象，面板据此显示空状态
  if (count === 0) {
    return {
      trend: [],
      data: {
        periodLabel: p.label,
        count: 0,
        firstDate: '—',
        lastDate: '—',
        avgTotal: 0,
        firstTotal: 0,
        lastTotal: 0,
        totalDelta: 0,
        dims: DIMENSIONS.map((name) => ({ name, avg: 0, first: 0, last: 0, delta: 0 })),
        radarDimensions: Object.fromEntries(DIMENSIONS.map((d) => [d, { score: 0, max: 5 }])),
      },
      skeletonText: `# 阶段性训练记录报告\n\n本阶段（${p.label}）暂无练习数据。\n\n完成练习并在家长后台生成练习回顾后，这里会按真实数据自动汇总。`,
    }
  }

  // 4. 总分聚合（真实计算）
  const totals = filtered.map((s) => toNum(s.total_score))
  const avgTotal = Math.round(mean(totals))
  const firstTotal = totals[0]
  const lastTotal = totals[count - 1]
  const totalDelta = lastTotal - firstTotal

  // 5. 各维度聚合（真实计算）
  const dims = DIMENSIONS.map((name) => {
    const scores = filtered.map((s) => toNum(s.dimensions?.[name]?.score))
    const first = scores[0]
    const last = scores[count - 1]
    return {
      name,
      avg: round1(mean(scores)),
      first,
      last,
      delta: last - first,
    }
  })

  const radarDimensions = Object.fromEntries(
    dims.map((d) => [d.name, { score: d.avg, max: 5 }]),
  )

  const firstDate = fmtDate(filtered[0].date)
  const lastDate = fmtDate(filtered[count - 1].date)

  // 6. 骨架文本（占位 + 真实数据填充；含维度表，可直接作 .md 导出内容）
  const dimLines = dims
    .map((d) => `| ${d.name} | ${d.avg} | ${d.first} | ${d.last} | ${deltaWord(d.delta)} |`)
    .join('\n')

  const skeletonText = `# 阶段性训练记录报告

本阶段：${p.label}
练习次数：${count} 次
时间范围：${firstDate} ~ ${lastDate}

## 总分概览（满分 100）

- 平均总分：${avgTotal}
- 首次 ${firstTotal} → 最近 ${lastTotal}（${deltaWord(totalDelta)}）

## 各维度概览（满分 5）

| 维度 | 平均 | 首次 | 最近 | 变化 |
|------|------|------|------|------|
${dimLines}

---

社交训练为主、评估为辅。本报告基于本设备已记录的练习数据自动汇总，仅供专业人员参考，
为训练参考材料，非诊断、非标准化评估，不替代专业判断。
`

  return {
    trend: filtered,
    data: {
      periodLabel: p.label,
      count,
      firstDate,
      lastDate,
      avgTotal,
      firstTotal,
      lastTotal,
      totalDelta,
      dims,
      radarDimensions,
    },
    skeletonText,
  }
}
