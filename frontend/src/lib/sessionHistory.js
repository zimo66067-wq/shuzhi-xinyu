/**
 * sessionHistory.js — 历次对话摘要存储（纯本地，不含原始对话文本）
 *
 * 仅存储：时间戳 / 孩子姓名 / 消息条数 / 第一条用户消息前 40 字预览。
 * 不存储完整对话内容，符合数据最小化原则。
 */

const SESSION_LIST_KEY = 'xinyu_session_list'
const MAX_SESSIONS = 30

/**
 * 离开 chat 页面时调用，保存本次对话摘要。
 * 少于 2 条有效消息的会话不存储（防保存空会话）。
 */
export function saveSession(childName, messages) {
  const visible = (messages || []).filter((m) => m.role !== 'system')
  if (visible.length < 2) return
  const firstUser = visible.find((m) => m.role === 'user')
  const entry = {
    id: Date.now(),
    date: new Date().toISOString(),
    childName: (childName || '练习').slice(0, 20),
    messageCount: visible.length,
    preview: firstUser ? firstUser.content.slice(0, 40) : '（无内容）',
  }
  try {
    const arr = loadSessions()
    localStorage.setItem(
      SESSION_LIST_KEY,
      JSON.stringify([...arr, entry].slice(-MAX_SESSIONS)),
    )
  } catch {}
}

/** 读取所有历史摘要（按存入顺序，最旧在前）。 */
export function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSION_LIST_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
