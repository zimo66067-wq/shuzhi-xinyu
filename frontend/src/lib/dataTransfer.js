/**
 * dataTransfer.js — 跨设备数据归集（F6，纯前端、纯文件、无服务端）
 *
 * 导出某儿童的【最小化】结构化训练数据为本地 JSON，另一台设备可导入、校验、
 * 合并去重写入 localStorage。全程本地文件手动传递，绝不上云 / 不写 URL。
 *
 * 合规硬约束（第六章）：
 * - 数据最小化：仅训练指标 + 化名；剔除真名 / 对话原文 / 联系方式 / 家庭信息
 * - 不含原始录音、不含声学明细、不含治疗师标注自由文本（schema 即不含这些字段）
 * - 化名由治疗师在导出时手动输入确认（UI 层负责），本模块不读 childInfo.name
 * - 导入数据落 xinyu_scoreHistory（xinyu_ 前缀）→ 既有永久删除路径自动覆盖
 * - 内置 version + 向后兼容；不兼容 / 损坏文件明确报错并拒绝，绝不静默损坏既有数据
 */

const CURRENT_VERSION = 1
const SCORE_HISTORY_KEY = 'xinyu_scoreHistory'
const MERGE_CAP = 200 // 合并后上限，防无限增长（既有单设备上限 50，导入放宽到 200）

const DIMENSIONS = ['主动发起', '话题维持', '情绪识别', '礼貌用语', '参与度']

// ── 内部工具 ────────────────────────────────────────────────────────

function loadScoreHistory() {
  try {
    const raw = localStorage.getItem(SCORE_HISTORY_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function toNum(v) {
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0
}

// 单条评分最小化：仅保留 date / total_score / dimensions{dim:{score,max}}
// 显式剔除 comment 等自由文本，杜绝其中夹带可识别信息的风险
function minimizeSession(s) {
  const dims = {}
  DIMENSIONS.forEach((d) => {
    const item = s?.dimensions?.[d]
    if (item && typeof item === 'object') {
      dims[d] = { score: toNum(item.score), max: 5 }
    }
  })
  return {
    date: String(s?.date || ''),
    total_score: toNum(s?.total_score),
    dimensions: dims,
  }
}

// 由 sessions 派生轻量趋势摘要（信息性；导入以 sessions 为准，不依赖本字段）
function deriveTrends(sessions) {
  const n = sessions.length
  if (n === 0) return { count: 0, avgTotal: 0, dims: {} }
  const avgTotal = Math.round(
    sessions.reduce((a, s) => a + toNum(s.total_score), 0) / n,
  )
  const dims = {}
  DIMENSIONS.forEach((d) => {
    const vals = sessions.map((s) => toNum(s.dimensions?.[d]?.score))
    dims[d] = Math.round((vals.reduce((a, b) => a + b, 0) / n) * 10) / 10
  })
  return { count: n, avgTotal, dims }
}

// ── 导出（步骤 1）──────────────────────────────────────────────────

/**
 * 构建最小化导出对象（纯函数，便于自测）。
 * @param {string} childAlias - 治疗师手动输入的化名（必填、非空）
 * @returns {object|null} - 化名为空时返回 null（不产出文件）
 */
export function buildChildExport(childAlias) {
  const alias = (childAlias || '').trim()
  if (!alias) return null

  const sessions = loadScoreHistory().map(minimizeSession).filter((s) => s.date)

  return {
    version: CURRENT_VERSION,
    app: '数智心屿',
    exportedAt: new Date().toISOString(),
    childAlias: alias,
    sessions,
    trends: deriveTrends(sessions),
  }
}

/**
 * 执行导出：构建最小化对象 + 触发本地 Blob 下载（不触网）。
 * @param {string} childAlias
 * @returns {{ ok: boolean, count?: number, error?: string }}
 */
export function exportChildData(childAlias) {
  const payload = buildChildExport(childAlias)
  if (!payload) return { ok: false, error: '化名为空，未产出文件' }

  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // 文件名用化名 + 日期，便于跨设备识别（化名由治疗师设定，非真名）
    const safeAlias = payload.childAlias.replace(/[^\w一-龥-]/g, '_')
    a.download = `xinyu-transfer-${safeAlias}-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return { ok: true, count: payload.sessions.length }
  } catch (e) {
    console.debug('[dataTransfer] 导出失败:', e)
    return { ok: false, error: '导出失败，请稍后再试' }
  }
}

// ── 导入（步骤 2 + 3）──────────────────────────────────────────────

/**
 * 校验并解析导入文本（纯函数，便于自测）。
 * 防损坏：先全量校验通过才返回 data；任何不合法 → ok:false + 明确原因。
 * @param {string} text
 * @returns {{ ok: boolean, error?: string, data?: object }}
 */
export function parseChildImport(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: '文件不是有效的 JSON，已拒绝导入' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: '文件结构不正确，已拒绝导入' }
  }

  // 版本校验：向后兼容（旧版本可解析），版本过新则拒绝
  const v = parsed.version
  if (typeof v !== 'number' || v < 1) {
    return { ok: false, error: '文件缺少有效版本号，已拒绝导入' }
  }
  if (v > CURRENT_VERSION) {
    return {
      ok: false,
      error: `文件版本过新（v${v}），请升级应用后再导入，已拒绝以防数据损坏`,
    }
  }

  // 结构校验
  if (typeof parsed.childAlias !== 'string' || !parsed.childAlias.trim()) {
    return { ok: false, error: '文件缺少化名，已拒绝导入' }
  }
  if (!Array.isArray(parsed.sessions)) {
    return { ok: false, error: '文件缺少 sessions 列表，已拒绝导入' }
  }

  // 逐条筛出合法 session（必须有 date 字符串 + 数值 total_score）
  const validSessions = parsed.sessions
    .filter(
      (s) =>
        s &&
        typeof s === 'object' &&
        typeof s.date === 'string' &&
        s.date.trim() &&
        typeof s.total_score === 'number',
    )
    .map(minimizeSession)

  if (validSessions.length === 0) {
    return { ok: false, error: '文件中没有可导入的有效训练记录，已拒绝导入' }
  }

  return {
    ok: true,
    data: { childAlias: parsed.childAlias.trim(), sessions: validSessions },
  }
}

/**
 * 合并去重写入 xinyu_scoreHistory（按 date 去重；既有条目优先保留）。
 * @param {Array} importedSessions
 * @returns {{ added: number, skipped: number, total: number }}
 */
export function mergeImportedSessions(importedSessions) {
  const existing = loadScoreHistory()
  const seen = new Set(existing.map((s) => s?.date).filter(Boolean))

  let added = 0
  let skipped = 0
  const merged = [...existing]
  importedSessions.forEach((s) => {
    if (seen.has(s.date)) {
      skipped += 1
    } else {
      seen.add(s.date)
      merged.push(s)
      added += 1
    }
  })

  merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const capped = merged.slice(-MERGE_CAP)

  localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(capped))
  return { added, skipped, total: capped.length }
}

/**
 * 导入流程：读文件 → 校验 → 合并去重。任一步失败均不写入，既有数据零损坏。
 * @param {File} file
 * @returns {Promise<{ ok: boolean, error?: string, childAlias?: string, added?: number, skipped?: number, total?: number }>}
 */
export async function importChildData(file) {
  if (!file) return { ok: false, error: '未选择文件' }
  let text
  try {
    text = await file.text()
  } catch {
    return { ok: false, error: '读取文件失败，已拒绝导入' }
  }

  const parsed = parseChildImport(text)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  try {
    const { added, skipped, total } = mergeImportedSessions(parsed.data.sessions)
    return { ok: true, childAlias: parsed.data.childAlias, added, skipped, total }
  } catch (e) {
    console.debug('[dataTransfer] 合并失败:', e)
    return { ok: false, error: '写入本地失败，既有数据未改动' }
  }
}
