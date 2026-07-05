/**
 * sessionHistory.js — 历次对话存储（纯本地）
 *
 * 侧边栏需要能恢复会话，因此新记录会保存可见对话 messages。
 * 只保存 role/content，显式过滤 system message；不保存录音、声学明细、面部指标或密钥。
 * 旧版本只保存摘要，没有完整 messages，无法恢复正文。
 */

const SESSION_LIST_KEY = 'xinyu_session_list'
const MAX_SESSIONS = 30

function normalizeMessages(messages) {
  return (messages || [])
    .filter((m) => m && m.role !== 'system' && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 2000) }))
}

/**
 * 离开 chat 页面时调用，保存本次对话。
 * 少于 2 条有效消息的会话不存储（防保存空会话）。
 */
export function saveSession(childName, messages) {
  const visible = normalizeMessages(messages)
  if (visible.length < 2) return
  const firstUser = visible.find((m) => m.role === 'user')
  const entry = {
    id: Date.now(),
    date: new Date().toISOString(),
    childName: (childName || '练习').slice(0, 20),
    messageCount: visible.length,
    preview: firstUser ? firstUser.content.slice(0, 40) : '（无内容）',
    messages: visible,
  }
  try {
    const arr = loadSessions()
    localStorage.setItem(
      SESSION_LIST_KEY,
      JSON.stringify([...arr, entry].slice(-MAX_SESSIONS)),
    )
  } catch {}
}

/** 读取所有历史记录（按存入顺序，最旧在前）。 */
export function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSION_LIST_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function hasRestorableMessages(session) {
  return Array.isArray(session?.messages) && session.messages.length > 0
}
