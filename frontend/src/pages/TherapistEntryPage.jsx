import { useState, useContext } from 'react'
import { ChatContext } from '../App'
import {
  hasPin,
  setPin,
  verifyPin,
  setRole,
  setSessionConfig,
} from '../lib/session'

import GOAL_TEMPLATES from '../data/goalTemplates.json'

// ageBand → UI 标签 + 代表年龄（用于 prompt 注入，childInfo.age 不存在时回落）
const AGE_BAND_OPTIONS = [
  { value: 'low', label: '3–5 岁', repAge: 4 },
  { value: 'mid', label: '6–9 岁', repAge: 7 },
  { value: 'high', label: '10 岁+', repAge: 11 },
]

const SCENE_OPTIONS = [
  { value: 'free', label: '自由对话' },
  { value: 'supermarket', label: '超市购物' },
]

// ── 公共表单行样式 ──────────────────────────────────────────────────
const fieldStyle = { marginBottom: '18px', textAlign: 'left' }
const labelStyle = { display: 'block', fontSize: '14px', color: 'var(--text-sub)', marginBottom: '6px' }
const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '10px',
  border: '1.5px solid var(--card-border)',
  background: 'var(--card-bg)',
  color: 'var(--text-main)',
  fontSize: '15px',
  boxSizing: 'border-box',
}
const selectStyle = { ...inputStyle, cursor: 'pointer' }

// ── PIN 输入框 ─────────────────────────────────────────────────────
function PinInput({ value, onChange, disabled, label, ariaLabel }) {
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>{label}</label>
      <input
        type="password"
        inputMode="numeric"
        maxLength={8}
        placeholder="PIN（4–8 位数字）"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        disabled={disabled}
        style={inputStyle}
        aria-label={ariaLabel}
      />
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 阶段 A：PIN 门控
//   首次 → 设置新 PIN（含二次确认）
//   已有 PIN → 输入验证
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function PinGate({ onPassed, onCancel }) {
  const isFirstTime = !hasPin()
  const [pin, setPin_] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async () => {
    if (busy) return
    setError('')
    if (pin.length < 4) {
      setError('PIN 至少 4 位')
      return
    }
    setBusy(true)
    if (isFirstTime) {
      if (pin !== confirm) {
        setError('两次输入不一致')
        setPin_('')
        setConfirm('')
        setBusy(false)
        return
      }
      await setPin(pin)
      onPassed()
    } else {
      const ok = await verifyPin(pin)
      if (ok) {
        onPassed()
      } else {
        setError('PIN 不正确')
        setPin_('')
        setBusy(false)
      }
    }
  }

  return (
    <div className="page-container" style={{ justifyContent: 'center', alignItems: 'center', paddingTop: '40px' }}>
      <div className="modal-content" style={{ width: '100%', maxWidth: '340px' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔐</div>
        <h3 style={{ marginBottom: '4px' }}>
          {isFirstTime ? '首次设置治疗师 PIN' : '治疗师验证'}
        </h3>
        <p className="subtitle" style={{ marginBottom: '20px', fontSize: '13px' }}>
          {isFirstTime
            ? '设置 PIN 后，下次直接输入 PIN 进入准备台'
            : '请输入治疗师 PIN'}
        </p>

        {error && (
          <p style={{ color: 'var(--alert-soft)', fontSize: '13px', marginBottom: '12px' }}>
            {error}
          </p>
        )}

        <PinInput
          value={pin}
          onChange={setPin_}
          disabled={busy}
          label="PIN"
          ariaLabel="输入治疗师 PIN"
        />

        {isFirstTime && (
          <PinInput
            value={confirm}
            onChange={setConfirm}
            disabled={busy}
            label="再次确认 PIN"
            ariaLabel="再次确认治疗师 PIN"
          />
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className="btn-primary"
            style={{ background: 'var(--text-sub)', color: 'white', flex: 1 }}
            onClick={onCancel}
            disabled={busy}
          >
            取消
          </button>
          <button
            className="btn-primary"
            style={{ flex: 1, opacity: pin.length < 4 || busy ? 0.4 : 1 }}
            onClick={handleSubmit}
            disabled={pin.length < 4 || busy}
            aria-label={isFirstTime ? '设置 PIN' : '确认'}
          >
            {busy ? '验证中…' : isFirstTime ? '设置 PIN' : '确认'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 阶段 B：会话准备台表单
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ConfigForm({ navigate }) {
  const { childInfo, setChildInfo, setMessages, setScenario, setCurrentScene } =
    useContext(ChatContext)

  const [alias, setAlias] = useState(childInfo?.name || '')
  const [ageBand, setAgeBand] = useState('mid')
  const [scene, setScene] = useState('free')
  const [goalId, setGoalId] = useState(GOAL_TEMPLATES[0].id)

  const canSubmit = alias.trim().length > 0

  const handleStart = () => {
    if (!canSubmit) return

    const bandOpt = AGE_BAND_OPTIONS.find((o) => o.value === ageBand)
    const repAge = childInfo?.age ?? bandOpt.repAge

    // 写 ChatContext childInfo（供 ChatPage guard + system prompt 读取）
    setChildInfo({ name: alias.trim(), age: repAge })
    // 清上次对话历史（治疗师开新课时从头开始）
    setMessages([])

    // 场景预置
    if (scene === 'supermarket') {
      setScenario('supermarket')
      setCurrentScene('enter')
    } else {
      setScenario(null)
      setCurrentScene(null)
    }

    // 写 xy_session_config + xy_role
    const tpl = GOAL_TEMPLATES.find((t) => t.id === goalId) || GOAL_TEMPLATES[0]
    const goalPlaceholders = Object.fromEntries(
      tpl.placeholders.map((p) => [p.key, ''])
    )
    setRole('therapist')
    setSessionConfig({
      childId: alias.trim(),
      scene,
      goalId,
      goalPlaceholders,
      ageBand,
      predictabilityTier: 'standard',
      createdBy: 'therapist',
      createdAt: Date.now(),
    })

    // 标记本次 session 未应用（ChatPage 的 scene-init useEffect 用）
    sessionStorage.removeItem('xy_session_applied')

    navigate('chat')
  }

  return (
    <div
      className="page-container"
      style={{ overflowY: 'auto', height: '100vh', paddingBottom: '32px' }}
    >
      <div style={{ width: '100%', maxWidth: '400px', padding: '32px 24px 0' }}>
        <h2 style={{ marginBottom: '4px' }}>会话准备台</h2>
        <p className="subtitle" style={{ marginBottom: '24px', fontSize: '13px' }}>
          治疗师视图 · 配置后交平板给孩子
        </p>

        {/* 孩子别名 */}
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="therapist-alias">孩子别名（化名）</label>
          <input
            id="therapist-alias"
            type="text"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            maxLength={10}
            placeholder="心屿会用这个名字称呼孩子"
            style={inputStyle}
            aria-label="孩子别名"
          />
        </div>

        {/* 年龄档 */}
        <div style={fieldStyle}>
          <span style={labelStyle}>年龄档（影响 UI 字号与表情数量）</span>
          <div style={{ display: 'flex', gap: '10px' }}>
            {AGE_BAND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAgeBand(opt.value)}
                style={{
                  flex: 1,
                  padding: '10px 6px',
                  borderRadius: '10px',
                  border: `1.5px solid ${ageBand === opt.value ? 'var(--accent)' : 'var(--card-border)'}`,
                  background: ageBand === opt.value ? 'var(--accent)' : 'var(--card-bg)',
                  color: ageBand === opt.value ? 'white' : 'var(--text-main)',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                aria-pressed={ageBand === opt.value}
                aria-label={`年龄档 ${opt.label}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 训练场景 */}
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="therapist-scene">训练场景</label>
          <select
            id="therapist-scene"
            value={scene}
            onChange={(e) => setScene(e.target.value)}
            style={selectStyle}
            aria-label="选择训练场景"
          >
            {SCENE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* 本次目标（F4） */}
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="therapist-goal">本次训练目标</label>
          <select
            id="therapist-goal"
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            style={selectStyle}
            aria-label="选择本次训练目标"
          >
            {GOAL_TEMPLATES.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.name}</option>
            ))}
          </select>
          {(() => {
            const tpl = GOAL_TEMPLATES.find((t) => t.id === goalId)
            return tpl ? (
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-sub)', lineHeight: 1.5 }}>
                {tpl.description}
              </p>
            ) : null
          })()}
        </div>

        <button
          className="btn-primary"
          onClick={handleStart}
          disabled={!canSubmit}
          style={{ opacity: canSubmit ? 1 : 0.4, width: '100%', marginTop: '8px' }}
          aria-label="配置完成，交给孩子开始"
        >
          配置完成 · 交给孩子 🌟
        </button>

        <p
          style={{
            fontSize: '11px',
            color: 'var(--text-sub)',
            textAlign: 'center',
            marginTop: '16px',
            opacity: 0.7,
          }}
        >
          评分与训练数据仅在家长/治疗师后台可见，孩子界面不显示
        </p>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 主页面：PIN 门控 → 配置表单
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TherapistEntryPage({ navigate }) {
  const [pinPassed, setPinPassed] = useState(false)

  if (!pinPassed) {
    return (
      <PinGate
        onPassed={() => setPinPassed(true)}
        onCancel={() => navigate('startup')}
      />
    )
  }

  return <ConfigForm navigate={navigate} />
}

export default TherapistEntryPage
