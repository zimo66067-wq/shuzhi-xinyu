import { useContext, useRef, useState } from 'react'
import { ChatContext } from '../App'
import ConsentGate from '../components/ConsentGate'

const AGE_OPTIONS = [3, 4, 5, 6, 7, 8, 9, '10+']
const ADMIN_HOLD_MS = 3000

function StartupPage({ navigate }) {
  const { childInfo, setChildInfo, setMessages, consent, agreeConsent } =
    useContext(ChatContext)

  // 预填上次的名字+年龄
  const [name, setName] = useState(childInfo?.name || '')
  const [age, setAge] = useState(childInfo?.age ?? null)

  // 任务 6（Q4）：首次启动 vs 再次启动 — 不同叙事
  //   首次：家长设置模式（标题、文案面向成人）
  //   再次：已有 childInfo → 简洁问候 + 一键继续
  const isFirstSetup = !childInfo

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

  // 整改 A-2：首次使用、采集姓名/年龄前，先过监护人知情同意；未同意不放行
  if (isFirstSetup && !consent?.agreed) {
    return <ConsentGate onAgree={agreeConsent} />
  }

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
      <h1 style={{ marginBottom: '8px' }}>
        {isFirstSetup ? '为孩子设置心屿' : `心屿等${childInfo?.name}回来`}
      </h1>
      {isFirstSetup && (
        <p
          className="subtitle"
          style={{ fontSize: '15px', marginBottom: '20px' }}
        >
          家长引导：填写孩子信息后，由孩子独立和心屿对话
        </p>
      )}
      {!isFirstSetup && (
        <p
          className="subtitle"
          style={{ fontSize: '15px', marginBottom: '20px' }}
        >
          {childInfo?.age} 岁的小朋友
        </p>
      )}

      <p className="startup-label">
        {isFirstSetup ? '孩子叫什么名字？' : '小朋友的名字'}
      </p>
      <input
        className="startup-input"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="输入名字"
        maxLength={10}
        aria-label="输入孩子姓名"
      />

      <p className="startup-label">
        {isFirstSetup ? '孩子几岁了？' : '几岁了'}
      </p>
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
        aria-label={isFirstSetup ? '设置完成进入对话' : '继续和心屿玩'}
      >
        {isFirstSetup ? '设置完成 · 让孩子开始 🌟' : '继续和心屿玩 🌟'}
      </button>

      {/* 已有孩子信息时：提供"换一个孩子"小入口 */}
      {!isFirstSetup && (
        <button
          onClick={() => {
            setChildInfo(null)
            setMessages([])
            setName('')
            setAge(null)
          }}
          style={{
            marginTop: '10px',
            fontSize: '13px',
            color: 'var(--text-sub)',
            background: 'transparent',
            padding: '6px 12px',
            textDecoration: 'underline',
            opacity: 0.7,
          }}
          aria-label="换一个孩子使用"
        >
          换一个孩子使用
        </button>
      )}

      {/* Q0 防御性声明：本产品为比赛作品演示 */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: '24px',
          fontSize: '12px',
          color: 'var(--text-sub)',
          textAlign: 'center',
          opacity: 0.7,
        }}
      >
        本产品为比赛作品演示
      </div>

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
