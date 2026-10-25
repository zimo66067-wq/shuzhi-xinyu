import { API_BASE } from './api'

const AUTH_KEY = 'xy_experiment_auth'
export function readExperimentAuth() {
  try { return JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null') } catch { return null }
}
export function saveExperimentAuth(value) {
  if (value) sessionStorage.setItem(AUTH_KEY, JSON.stringify(value))
  else sessionStorage.removeItem(AUTH_KEY)
}
export function experimentClient(auth, sessionId) {
  const headers = () => ({ Authorization: `Experiment ${auth.token}` })
  const call = async (path, method = 'GET', data, extra = {}) => {
    const response = await fetch(`${API_BASE}/api/experiment${path}`, {
      method, headers: { ...headers(), ...(data ? { 'Content-Type': 'application/json' } : {}), ...extra },
      ...(data ? { body: JSON.stringify(data) } : {}), cache: 'no-store',
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`)
    return result
  }
  const sessionPath = `/sessions/${sessionId}`
  const requestHeaders = async (scope) => {
    if (scope !== 'ui') await eventQueue
    const token = await call(`${sessionPath}/nonce`, 'POST', { scope })
    return { ...headers(), 'X-Experiment-Session': sessionId, 'X-Experiment-Nonce': token.nonce }
  }
  // Event callbacks remain client reports. No callback sets an upstream source or model_called.
  let eventQueue = Promise.resolve()
  let eventErrorHandler = () => {}
  const emit = (type, detail = {}) => {
    eventQueue = eventQueue.catch(() => {}).then(async () => {
      const h = await requestHeaders('ui')
      return call(`${sessionPath}/ui-events`, 'POST', { type, ...detail }, h)
    }).catch((error) => { eventErrorHandler(error.message) })
    return eventQueue
  }
  const send = async (text, scenario, modality = 'text') => {
    await eventQueue
    const key = `xy_experiment_pending:${sessionId}`
    const payload = { text, modality, scenario }
    let pending
    try { pending = JSON.parse(sessionStorage.getItem(key) || 'null') } catch { pending = null }
    if (pending && JSON.stringify(pending.payload) !== JSON.stringify(payload)) {
      throw new Error('上一轮请求结果尚未确认。请重发原文核对，或由管理员复核中断记录。')
    }
    if (!pending) {
      pending = { payload, headers: await requestHeaders('chat'), id: crypto.randomUUID() }
      sessionStorage.setItem(key, JSON.stringify(pending))
    }
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST', headers: { ...pending.headers, 'Content-Type': 'application/json', 'Idempotency-Key': pending.id },
      body: JSON.stringify(pending.payload), cache: 'no-store',
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      // These rejections happen before a turn reservation and cannot have called the model.
      if (['nonce_expired', 'admission_expired', 'session_not_active', 'account_rate_limit'].includes(result.error)) sessionStorage.removeItem(key)
      throw new Error(result.error || `HTTP ${response.status}`)
    }
    sessionStorage.removeItem(key)
    return result
  }
  return { call, send, emit, requestHeaders, headers,
    onEventError: (callback) => { eventErrorHandler = callback },
    flush: () => eventQueue,
    async download(batchId) {
      const response = await fetch(`${API_BASE}/api/experiment/batches/${batchId}/export`, { headers: headers(), cache: 'no-store' })
      if (!response.ok) throw new Error(`导出失败 HTTP ${response.status}`)
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a'); link.href = url; link.download = `experiment-${batchId}.zip`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
  }
}
