/**
 * session.js — 治疗师角色与会话配置工具
 *
 * 存储键（均使用 xy_ 前缀，与 xinyu_ 家长键区分）：
 *   xy_role              : 'parent' | 'therapist'
 *   xy_therapist_pin     : SHA-256 哈希后的 PIN 十六进制字符串（明文不落盘）
 *   xy_session_config    : JSON — 由治疗师准备台写入、ChatPage 只读
 */

const ROLE_KEY = 'xy_role'
const PIN_KEY = 'xy_therapist_pin'
const SESSION_KEY = 'xy_session_config'

// ─── 角色 ──────────────────────────────────────────────────────────────────

/** @returns {'parent'|'therapist'|null} */
export function getRole() {
  return localStorage.getItem(ROLE_KEY) || null
}

/** @param {'parent'|'therapist'} role */
export function setRole(role) {
  localStorage.setItem(ROLE_KEY, role)
}

// ─── 会话配置 ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} SessionConfig
 * @property {string}  childId
 * @property {string}  scene              - 'free' | 'supermarket'
 * @property {string}  goalId
 * @property {Object}  goalPlaceholders
 * @property {'low'|'mid'|'high'} ageBand
 * @property {'standard'} predictabilityTier
 * @property {string}  createdBy
 * @property {number}  createdAt
 */

/** @returns {SessionConfig|null} */
export function getSessionConfig() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** @param {SessionConfig} config */
export function setSessionConfig(config) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(config))
}

/** 清除本次会话配置（治疗师退出或孩子结束后调用） */
export function clearSessionConfig() {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(ROLE_KEY)
}

// ─── PIN 管理（SHA-256，Web Crypto subtle.digest）─────────────────────────

/**
 * 将 PIN 字符串散列为十六进制字符串
 * @param {string} pin
 * @returns {Promise<string>} hex
 */
export async function hashPin(pin) {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 当前设备是否已设置治疗师 PIN */
export function hasPin() {
  return !!localStorage.getItem(PIN_KEY)
}

/**
 * 设置新 PIN（散列后存储）
 * @param {string} pin
 */
export async function setPin(pin) {
  const hex = await hashPin(pin)
  localStorage.setItem(PIN_KEY, hex)
}

/**
 * 验证 PIN（散列后比对）
 * @param {string} pin
 * @returns {Promise<boolean>}
 */
export async function verifyPin(pin) {
  const stored = localStorage.getItem(PIN_KEY)
  if (!stored) return false
  const hex = await hashPin(pin)
  return hex === stored
}
