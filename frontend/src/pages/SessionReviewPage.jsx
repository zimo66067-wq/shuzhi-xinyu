import { useState, useContext, useMemo, useCallback } from 'react'
import { ChatContext } from '../App'
import PasswordGate from '../components/PasswordGate'
import { getToken } from '../lib/parentAuth'
import { getSessionConfig, getRole } from '../lib/session'

/**
 * SessionReviewPage — 治疗师会话复核与标注层（F3，纯前端）
 *
 * 对一次【已记录】会话做列表式回放，并允许治疗师加注「观察记录」（非诊断）。
 *
 * 数据来源（全部只读引用，不改写源数据）：
 *   - 对话历史 xinyu_messages（经 ChatContext）：单条无时间戳，按对话顺序回放
 *   - 声学特征 xinyu_acousticHistory（经 ChatContext）：带 timestamp，作 auto 标注来源
 * 标注存储：localStorage['xy_annotations:'+sessionId]，仅写 manual，auto 不落盘
 *
 * 合规：本页属专业数据，仅在密码门控视图可达；label/note 文案为「观察」非「诊断」，
 *       无 DSM-5/ABA/量表术语；定位「社交训练为主、评估为辅」。
 */

// ── 合成 sessionId：项目无 sessionId 概念，用 F1 的 createdAt 作稳定 id ──
function getSessionId() {
  const cfg = getSessionConfig()
  return cfg?.createdAt ? String(cfg.createdAt) : 'current'
}
function getSessionStartTs() {
  const cfg = getSessionConfig()
  return typeof cfg?.createdAt === 'number' ? cfg.createdAt : 0
}

// ── auto 声学标签：复用 ParentPage 已审中性措辞（整改 P-1），零诊断语义 ──
function deriveAcousticLabel(entry) {
  const parts = []
  const std = entry?.pitch?.std
  const validRatio = entry?.pitch?.validRatio ?? 1
  if (typeof std === 'number' && validRatio > 0.15) {
    if (std < 25) parts.push('声音比较平稳')
    else if (std > 80) parts.push('声音起伏较大')
  }
  const sil = entry?.silence_ratio
  if (typeof sil === 'number') {
    if (sil > 0.5) parts.push('停顿较多')
    else if (sil <= 0.3) parts.push('说得比较连贯')
  }
  const rms = entry?.rms?.mean
  if (typeof rms === 'number') {
    if (rms < 0.05) parts.push('音量偏小')
    else if (rms > 0.3) parts.push('音量偏大')
  }
  return parts.length ? parts.join('，') : '记录到一次发声'
}

// ── 标注持久化 ─────────────────────────────────────────────────────
function loadAnnotations(sessionId) {
  try {
    const raw = localStorage.getItem('xy_annotations:' + sessionId)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
function saveAnnotations(sessionId, list) {
  try {
    localStorage.setItem('xy_annotations:' + sessionId, JSON.stringify(list))
  } catch (e) {
    console.debug('[SessionReview] 标注写入失败:', e)
  }
}

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

// ── 公共样式 ───────────────────────────────────────────────────────
const sectionStyle = {
  backgroundColor: 'var(--bg-card)',
  borderRadius: 'var(--radius-base)',
  padding: '12px 14px',
  marginBottom: '14px',
}
const h3Style = { fontSize: '16px', color: 'var(--text-main)', marginBottom: '8px' }

function ReviewBody({ navigate }) {
  const { childInfo, messages, acousticHistory = [] } = useContext(ChatContext)

  const sessionId = useMemo(() => getSessionId(), [])
  const sessionStart = useMemo(() => getSessionStartTs(), [])

  // 步骤 1：规范化为可回放事件流
  // 对话事件（按顺序，无时间戳，用 seq）
  const dialogueEvents = useMemo(() => {
    return (messages || [])
      .filter((m) => m.role !== 'system')
      .map((m, i) => ({ seq: i, role: m.role, content: m.content }))
  }, [messages])

  // auto 声学事件（按 timestamp 圈定本次会话；无 createdAt 则取全部）
  const autoEvents = useMemo(() => {
    return (acousticHistory || [])
      .filter((h) => (h?.timestamp ?? 0) >= sessionStart)
      .map((h) => ({ t: h.timestamp, label: deriveAcousticLabel(h) }))
      .sort((a, b) => a.t - b.t)
  }, [acousticHistory, sessionStart])

  // 步骤 3：已存 manual 标注
  const [annotations, setAnnotations] = useState(() => loadAnnotations(sessionId))

  // 加注表单
  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')

  const canAdd = label.trim().length > 0 || note.trim().length > 0

  const handleAdd = useCallback(() => {
    if (!canAdd) return
    const now = Date.now()
    const entry = {
      t: now,
      type: 'manual',
      label: label.trim(),
      note: note.trim(),
      author: getRole() || 'therapist',
      createdAt: now,
    }
    const next = [...annotations, entry]
    setAnnotations(next)
    saveAnnotations(sessionId, next)
    setLabel('')
    setNote('')
  }, [canAdd, label, note, annotations, sessionId])

  const handleRemove = useCallback(
    (idx) => {
      const next = annotations.filter((_, i) => i !== idx)
      setAnnotations(next)
      saveAnnotations(sessionId, next)
    },
    [annotations, sessionId],
  )

  return (
    <div className="page-container">
      {/* 顶栏 */}
      <div className="top-bar-new">
        <button
          className="btn-icon top-back"
          onClick={() => navigate('parent')}
          aria-label="返回家长后台"
        >
          ← 返回
        </button>
        <div className="top-title">会话复核</div>
        <div className="top-pause" />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '8px 0' }}>
        {/* 定位标注 */}
        <div
          style={{
            fontSize: '12px',
            color: 'var(--text-sub)',
            lineHeight: 1.6,
            padding: '10px 12px',
            marginBottom: '12px',
            border: '1px dashed var(--text-sub)',
            borderRadius: '10px',
          }}
        >
          会话复核用于专业人员记录观察，<strong>社交训练为主、评估为辅</strong>，所记为观察非诊断，不替代专业诊断。
        </div>

        {/* 孩子信息 */}
        {childInfo && (
          <div style={{ ...sectionStyle }}>
            👶 <strong>{childInfo.name}</strong> · {childInfo.age} 岁
          </div>
        )}

        {/* 步骤 2：对话回放（列表式，按对话顺序） */}
        <section>
          <h3 style={h3Style}>💬 对话回放（{dialogueEvents.length} 条）</h3>
          <div
            style={{
              ...sectionStyle,
              maxHeight: '260px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '14px',
            }}
          >
            {dialogueEvents.length === 0 ? (
              <div style={{ color: 'var(--text-sub)', textAlign: 'center', padding: '12px' }}>
                本次会话还没有对话记录
              </div>
            ) : (
              dialogueEvents.map((e) => (
                <div key={e.seq} style={{ lineHeight: 1.5 }}>
                  <span style={{ color: 'var(--text-sub)', fontSize: '12px', marginRight: '6px' }}>
                    #{e.seq + 1}
                  </span>
                  <span
                    style={{
                      color: e.role === 'user' ? 'var(--accent-deep)' : 'var(--soft-feedback)',
                      fontWeight: 600,
                    }}
                  >
                    {e.role === 'user' ? childInfo?.name || '孩子' : '心屿'}：
                  </span>
                  <span style={{ color: 'var(--text-main)' }}>{e.content}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* auto 声学观察（只读，来自已记录信号） */}
        <section>
          <h3 style={h3Style}>🎵 声学观察 · 自动（{autoEvents.length} 条）</h3>
          <div style={{ ...sectionStyle, display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
            {autoEvents.length === 0 ? (
              // 降级说明：本次会话无可用声学信号 → 退到纯人工标注，不补造数据
              <div style={{ color: 'var(--text-sub)', textAlign: 'center', padding: '12px' }}>
                本次会话未记录到可用声学信号，可在下方用人工标注记录观察。
              </div>
            ) : (
              autoEvents.map((e, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'baseline',
                    padding: '6px 10px',
                    background: 'white',
                    borderRadius: '8px',
                  }}
                >
                  <span style={{ color: 'var(--text-sub)', fontSize: '12px', minWidth: '44px' }}>
                    {fmtTime(e.t)}
                  </span>
                  <span style={{ color: 'var(--text-main)' }}>{e.label}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 步骤 2/3：治疗师标注（manual） */}
        <section>
          <h3 style={h3Style}>📝 治疗师标注 · 人工（{annotations.length} 条）</h3>

          {/* 加注表单 */}
          <div style={{ ...sectionStyle }}>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-sub)', marginBottom: '6px' }} htmlFor="ann-label">
              观察标签（短）
            </label>
            <input
              id="ann-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={20}
              placeholder="例：主动发起、轮流较好"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1.5px solid var(--card-border)',
                background: 'white',
                color: 'var(--text-main)',
                fontSize: '14px',
                boxSizing: 'border-box',
                marginBottom: '10px',
              }}
              aria-label="观察标签"
            />
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-sub)', marginBottom: '6px' }} htmlFor="ann-note">
              观察记录
            </label>
            <textarea
              id="ann-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="记录本次会话中观察到的具体行为表现（非诊断）"
              style={{
                width: '100%',
                minHeight: '72px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1.5px solid var(--card-border)',
                background: 'white',
                color: 'var(--text-main)',
                fontSize: '14px',
                lineHeight: 1.6,
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                marginBottom: '10px',
              }}
              aria-label="观察记录"
            />
            <button
              className="btn-primary"
              onClick={handleAdd}
              disabled={!canAdd}
              style={{ opacity: canAdd ? 1 : 0.4, width: '100%' }}
              aria-label="添加观察标注"
            >
              ＋ 添加标注
            </button>
          </div>

          {/* 已存标注列表 */}
          {annotations.length > 0 && (
            <div style={{ ...sectionStyle, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {annotations.map((a, i) => (
                <div
                  key={a.createdAt + '-' + i}
                  style={{
                    padding: '10px 12px',
                    background: 'white',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--accent-deep)' }}>
                      {a.label || '（无标签）'}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-sub)' }}>
                      {a.author} · {fmtTime(a.createdAt)}
                    </span>
                  </div>
                  {a.note && (
                    <div style={{ color: 'var(--text-main)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {a.note}
                    </div>
                  )}
                  <button
                    onClick={() => handleRemove(i)}
                    style={{
                      marginTop: '6px',
                      fontSize: '12px',
                      color: 'var(--text-sub)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 0,
                    }}
                    aria-label="删除这条标注"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

// ── 主页面：密码门控（纵深防御，与 ParentPage 同模式）→ 复核正文 ──
function SessionReviewPage({ navigate }) {
  const [authed, setAuthed] = useState(false)

  // 已有有效家长 token 直接放行（从家长后台跳转而来时无需重输）
  if (!authed && getToken()) {
    setAuthed(true)
  }

  if (!authed) {
    return (
      <PasswordGate
        onSuccess={() => setAuthed(true)}
        onCancel={() => navigate('parent')}
      />
    )
  }

  return <ReviewBody navigate={navigate} />
}

export default SessionReviewPage
