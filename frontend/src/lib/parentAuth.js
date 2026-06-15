/**
 * 家长鉴权客户端工具
 * - verify(password)  → 后端 /api/parent/verify 校验密码，成功后把 token 存 sessionStorage
 * - getToken()        → 取出当前有效 token；过期/不存在返回 null
 * - clear()           → 清掉 token（用于"退出家长后台"）
 * - authHeader()      → 返回 fetch 用的 { Authorization } 头
 *
 * 安全要点：
 * - 密码不再硬编码 / 不再放 VITE_ env，只由用户输入、发给后端校验
 * - token 存 sessionStorage（关浏览器即清），不持久化
 * - token 自带过期时间，过期后强制重新输密码
 */

import { API_BASE } from './api'

const STORAGE_KEY = 'xinyu_parent_token'

/**
 * 校验家长密码
 * @param {string} password
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function verify(password) {
  try {
    const res = await fetch(`${API_BASE}/api/parent/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.status === 401) {
      return { ok: false, error: '密码不对' }
    }
    if (res.status === 429) {
      return { ok: false, error: '尝试太频繁，请稍后再试' }
    }
    if (!res.ok) {
      return { ok: false, error: '验证服务暂时不可用' }
    }
    const data = await res.json()
    if (!data.token) {
      return { ok: false, error: '验证失败' }
    }
    // token 自身已含过期时间；前端再加一层 sessionStorage 兜底
    const expiresAt = Date.now() + (data.expires_in || 3600) * 1000
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token: data.token, expiresAt }),
    )
    return { ok: true }
  } catch (e) {
    console.debug('[parentAuth] verify failed:', e)
    return { ok: false, error: '网络错误' }
  }
}

/**
 * 取当前有效 token
 * @returns {string|null}
 */
export function getToken() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const { token, expiresAt } = JSON.parse(raw)
    if (!token || Date.now() > expiresAt) {
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return token
  } catch {
    return null
  }
}

/** 清掉 token（退出家长后台） */
export function clear() {
  sessionStorage.removeItem(STORAGE_KEY)
}

/**
 * 给 fetch 用的请求头
 * @returns {Record<string,string>}
 */
export function authHeader() {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}
