import { useState } from 'react'

function PausePage({ navigate }) {
  const [showPwd, setShowPwd] = useState(false)
  const [pwdInput, setPwdInput] = useState('')

  // 默认家长密码（后期接入家长后台时替换）
  const PARENT_PASSWORD = '1234'

  const handleConfirm = () => {
    if (pwdInput === PARENT_PASSWORD) {
      // 清空对话记忆，回到启动页
      localStorage.removeItem('xinyu_currentPage')
      navigate('startup')
    } else {
      alert('密码不对，请告诉爸爸妈妈')
      setPwdInput('')
    }
  }

  return (
    <div
      className="page-container"
      style={{ justifyContent: 'center', alignItems: 'center' }}
    >
      <h2 style={{ marginBottom: '64px' }}>我们要休息一下吗？</h2>

      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        <button className="btn-primary" onClick={() => navigate('chat')}>
          继续聊天
        </button>
        <button className="btn-alert" onClick={() => setShowPwd(true)}>
          今天到这里
        </button>
      </div>

      {showPwd && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setShowPwd(false)}
        >
          <div className="modal-content">
            <h3>请告诉爸爸妈妈</h3>
            <p className="subtitle" style={{ marginTop: '8px' }}>
              输入密码结束训练
            </p>
            <input
              type="password"
              placeholder="密码"
              value={pwdInput}
              onChange={(e) => setPwdInput(e.target.value)}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
              <button
                className="btn-primary"
                style={{ backgroundColor: 'var(--text-sub)', color: 'white' }}
                onClick={() => {
                  setShowPwd(false)
                  setPwdInput('')
                }}
              >
                取消
              </button>
              <button className="btn-primary" onClick={handleConfirm}>
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PausePage
