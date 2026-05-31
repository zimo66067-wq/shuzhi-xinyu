import { useState } from 'react'

function PasswordGate({ expectedPassword = '1234', onSuccess, onCancel }) {
  const [pwdInput, setPwdInput] = useState('')
  const [error, setError] = useState(false)

  const handleConfirm = () => {
    if (pwdInput === expectedPassword) {
      onSuccess?.()
    } else {
      setError(true)
      setPwdInput('')
      setTimeout(() => setError(false), 1500)
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
          {error ? '密码不对，请再试一次' : '请输入家长密码'}
        </p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder="密码"
          value={pwdInput}
          onChange={(e) => setPwdInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
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
          >
            取消
          </button>
          <button
            className="btn-primary"
            onClick={handleConfirm}
            disabled={pwdInput.length === 0}
            style={{ opacity: pwdInput.length === 0 ? 0.4 : 1 }}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  )
}

export default PasswordGate
