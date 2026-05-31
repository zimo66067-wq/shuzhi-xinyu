import { useContext, useRef, useState } from 'react'
import { ChatContext } from '../App'

const AGE_OPTIONS = [3, 4, 5, 6, 7, 8, 9, '10+']
const ADMIN_HOLD_MS = 3000

function StartupPage({ navigate }) {
  const { childInfo, setChildInfo, setMessages } = useContext(ChatContext)

  // 预填上次的名字+年龄
  const [name, setName] = useState(childInfo?.name || '')
  const [age, setAge] = useState(childInfo?.age ?? null)

  // 长按家长入口的进度（0-1）
  const [pressProgress, setPressProgress] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const pressTimer = useRef(null)
  const progressTimer = useRef(null)

  const handlePressStart = () => {
    setPressProgress(0)
    setShowHint(true)
    const startTime = Date.now()
    progressTimer.current = setInterval(() => {
      const elapsed = Date.now() - startTime
      setPressProgress(Math.min(elapsed / ADMIN_HOLD_MS, 1))
    }, 30)
    pressTimer.current = setTimeout(() => {
      clearInterval(progressTimer.current)
      progressTimer.current = null
      setPressProgress(0)
      setShowHint(false)
      navigate('parent')
    }, ADMIN_HOLD_MS)
  }

  const handlePressEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    if (progressTimer.current) clearInterval(progressTimer.current)
    pressTimer.current = null
    progressTimer.current = null
    setPressProgress(0)
    setTimeout(() => setShowHint(false), 600)
  }

  const canSubmit = name.trim().length > 0 && age !== null

  const handleStart = () => {
    if (!canSubmit) return
    const newInfo = { name: name.trim(), age }
    // 只有换孩子（名字或年龄变）才清历史；同一孩子保留对话
    if (
      childInfo &&
      (childInfo.name !== newInfo.name || childInfo.age !== newInfo.age)
    ) {
      setMessages([])
    }
    setChildInfo(newInfo)
    navigate('chat')
  }

  // admin 按钮填充高度（0-100%）
  const fillPercent = Math.round(pressProgress * 100)

  return (
    <div
      className="page-container"
      style={{
        justifyContent: 'flex-start',
        alignItems: 'center',
        textAlign: 'center',
        paddingTop: '32px',
      }}
    >
      <div className="startup-circle" style={{ marginBottom: '16px' }}></div>
      <h1 style={{ marginBottom: '24px' }}>心屿等你来玩!</h1>

      <p className="startup-label">你叫什么名字？</p>
      <input
        className="startup-input"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="输入名字"
        maxLength={10}
        aria-label="输入孩子姓名"
      />

      <p className="startup-label">你几岁了？</p>
      <div className="age-grid">
        {AGE_OPTIONS.map((a) => (
          <button
            key={a}
            type="button"
            className={`age-btn ${age === a ? 'selected' : ''}`}
            onClick={() => setAge(a)}
            aria-label={`选择年龄 ${a}`}
          >
            {a}
          </button>
        ))}
      </div>

      <button
        className="btn-primary"
        onClick={handleStart}
        disabled={!canSubmit}
        style={{ opacity: canSubmit ? 1 : 0.4, marginTop: '8px' }}
        aria-label="开始和心屿聊天"
      >
        开始和心屿聊天 🌟
      </button>

      {/* 家长入口：长按 3 秒带视觉进度 */}
      {showHint && (
        <div className="admin-hint">长按 3 秒进入家长后台</div>
      )}
      <button
        className="admin-btn-v2"
        onPointerDown={handlePressStart}
        onPointerUp={handlePressEnd}
        onPointerLeave={handlePressEnd}
        onPointerCancel={handlePressEnd}
        style={{
          opacity: pressProgress > 0 ? 1 : 0.45,
          touchAction: 'none',
        }}
        aria-label="家长后台（长按 3 秒）"
        title="长按 3 秒"
      >
        <div className="admin-btn-fill" style={{ height: `${fillPercent}%` }} />
        <span className="admin-btn-icon">⚙️</span>
      </button>
    </div>
  )
}

export default StartupPage
