import { useState } from 'react'
import { verify } from '../lib/parentAuth'

/**
 * 家长密码门 — 服务端鉴权版本
 *
 * 与旧版不同点：
 * - 不再接受 expectedPassword 明文 prop（前端不再持有任何密码）
 * - 用户输入 → 调 /api/parent/verify → 后端校验 → 拿短期 token
 * - 父组件不感知密码本身，只感知"通过/未通过"
 */
function PasswordGate({ onSuccess, onCancel }) {
  const [pwdInput, setPwdInput] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleConfirm = async () => {
    if (!pwdInput || busy) return
    setBusy(true)
    setError('')
    const { ok, error: errMsg } = await verify(pwdInput)
    setBusy(false)
    if (ok) {
      onSuccess?.()
    } else {
      setError(errMsg || '密码不对')
      setPwdInput('')
      setTimeout(() => setError(''), 2000)
    }
  }

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
      }}
    >
      <div className="modal-content">
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
        <h3>家长验证</h3>
        <p className="subtitle" style={{ marginTop: '8px' }}>
          {error || (busy ? '验证中...' : '请输入家长密码')}
        </p>
        <input
          type="password"
          inputMode="text"
          maxLength={32}
          placeholder="密码"
          value={pwdInput}
          onChange={(e) => setPwdInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
          disabled={busy}
          autoFocus
          style={{
            borderColor: error ? 'var(--alert-soft)' : undefined,
          }}
          aria-label="家长密码"
        />
        <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
          <button
            className="btn-primary"
            style={{
              backgroundColor: 'var(--text-sub)',
              color: 'white',
            }}
            onClick={onCancel}
            disabled={busy}
          >
            取消
          </button>
          <button
            className="btn-primary"
            onClick={handleConfirm}
            disabled={pwdInput.length === 0 || busy}
            style={{ opacity: pwdInput.length === 0 || busy ? 0.4 : 1 }}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  )
}

export default PasswordGate
