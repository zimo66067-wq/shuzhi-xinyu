import { useState } from 'react'

/**
 * GoalTracker — IEP 式可追踪目标（P-4，报告 2.5.2）
 *
 * 仅在密码门控的家长区渲染（约束 4：绝不出现在 ChatPage 等儿童可见处）。
 *
 * 复用（约束 5）：
 *  - 进度直接读传入的 scoreHistory（上一轮 A-5 的 xinyu_scoreHistory），不另拉数据
 *  - 维度名沿用与 ScoreRadarChart / ScoreTrendChart 一致的 5 维
 *
 * 数据：localStorage `xinyu_goals`（沿用 xinyu_ 前缀，与 scoreHistory 平级）
 *  每条目标 = { id, behavior, frequency, period, dimension, baselineScore, createdAt }
 *  - 相关维度由家长手动从 5 维里选（不自动猜测）
 *  - baselineScore：采纳目标那一刻该维度的分数，用于和最新分数对比出进度
 */

const DIMENSIONS = ['主动发起', '话题维持', '情绪识别', '礼貌用语', '参与度']
const PERIODS = ['本周', '两周', '本月']
const GOALS_KEY = 'xinyu_goals'

function loadGoals() {
  try {
    const raw = localStorage.getItem(GOALS_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveGoals(arr) {
  try {
    localStorage.setItem(GOALS_KEY, JSON.stringify(arr))
  } catch (e) {
    console.debug('[GoalTracker] 保存目标失败:', e)
  }
}

// 取某维度在历史里"最新一条有效"的分数；没有返回 null
function latestDimScore(history, dim) {
  if (!Array.isArray(history)) return null
  for (let i = history.length - 1; i >= 0; i--) {
    const s = history[i]?.dimensions?.[dim]?.score
    if (typeof s === 'number') return s
  }
  return null
}

function GoalTracker({ score, scoreHistory = [] }) {
  const [goals, setGoals] = useState(loadGoals)
  const [showForm, setShowForm] = useState(false)
  const [behavior, setBehavior] = useState('')
  const [frequency, setFrequency] = useState('')
  const [period, setPeriod] = useState('本周')
  const [dimension, setDimension] = useState('')

  const nextTraining = score?.next_training || ''

  const openForm = () => {
    // 预填本次的训练建议，家长可改
    setBehavior(nextTraining)
    setFrequency('')
    setPeriod('本周')
    setDimension('')
    setShowForm(true)
  }

  const saveGoal = () => {
    if (!behavior.trim() || !dimension) return
    const baseline = score?.dimensions?.[dimension]?.score
    const goal = {
      id: Date.now(),
      behavior: behavior.trim(),
      frequency: frequency.trim(),
      period,
      dimension,
      baselineScore: typeof baseline === 'number' ? baseline : null,
      createdAt: new Date().toISOString(),
    }
    const next = [...goals, goal]
    setGoals(next)
    saveGoals(next)
    setShowForm(false)
  }

  const removeGoal = (id) => {
    if (!window.confirm('删除这个目标吗？')) return
    const next = goals.filter((g) => g.id !== id)
    setGoals(next)
    saveGoals(next)
  }

  const canAdopt = !!nextTraining

  return (
    <section>
      <h3 style={{ fontSize: '16px', color: 'var(--text-main)', marginBottom: '8px' }}>
        🎯 训练目标
      </h3>

      {/* 本次训练建议 + 设为目标（仅在有评分建议时显示） */}
      {canAdopt && !showForm && (
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-base)',
            padding: '12px 14px',
            marginBottom: '12px',
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--text-sub)', marginBottom: '4px' }}>
            本次练习建议
          </div>
          <div
            style={{
              fontSize: '14px',
              color: 'var(--text-main)',
              lineHeight: 1.6,
              marginBottom: '10px',
            }}
          >
            {nextTraining}
          </div>
          <button className="btn-primary" onClick={openForm}>
            ＋ 设为本周目标
          </button>
        </div>
      )}

      {/* 结构化目标模板 */}
      {showForm && (
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-base)',
            padding: '14px',
            marginBottom: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <label style={{ fontSize: '13px', color: 'var(--text-sub)' }}>
            目标行为
            <textarea
              value={behavior}
              onChange={(e) => setBehavior(e.target.value)}
              rows={2}
              placeholder="例如：主动跟家人打招呼"
              style={{
                width: '100%',
                marginTop: '4px',
                padding: '8px 10px',
                borderRadius: '10px',
                border: '1px solid var(--text-sub)',
                fontSize: '14px',
                fontFamily: 'inherit',
                color: 'var(--text-main)',
                resize: 'vertical',
              }}
            />
          </label>

          <label style={{ fontSize: '13px', color: 'var(--text-sub)' }}>
            频次
            <input
              type="text"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              placeholder="例如：每天 1 次"
              style={{
                width: '100%',
                marginTop: '4px',
                padding: '8px 10px',
                borderRadius: '10px',
                border: '1px solid var(--text-sub)',
                fontSize: '14px',
                color: 'var(--text-main)',
              }}
            />
          </label>

          <label style={{ fontSize: '13px', color: 'var(--text-sub)' }}>
            周期
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              style={{
                width: '100%',
                marginTop: '4px',
                padding: '8px 10px',
                borderRadius: '10px',
                border: '1px solid var(--text-sub)',
                fontSize: '14px',
                backgroundColor: 'white',
                color: 'var(--text-main)',
              }}
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: '13px', color: 'var(--text-sub)' }}>
            相关维度（请家长自行选择，不自动判定）
            <select
              value={dimension}
              onChange={(e) => setDimension(e.target.value)}
              style={{
                width: '100%',
                marginTop: '4px',
                padding: '8px 10px',
                borderRadius: '10px',
                border: '1px solid var(--text-sub)',
                fontSize: '14px',
                backgroundColor: 'white',
                color: 'var(--text-main)',
              }}
            >
              <option value="">— 请选择 —</option>
              {DIMENSIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
            <button
              className="btn-primary"
              style={{ backgroundColor: 'var(--text-sub)', color: 'white' }}
              onClick={() => setShowForm(false)}
            >
              取消
            </button>
            <button
              className="btn-primary"
              onClick={saveGoal}
              disabled={!behavior.trim() || !dimension}
              style={{ opacity: !behavior.trim() || !dimension ? 0.4 : 1 }}
            >
              保存目标
            </button>
          </div>
        </div>
      )}

      {/* 目标卡 + 达成进度 */}
      {goals.length === 0 ? (
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-base)',
            padding: '16px',
            textAlign: 'center',
            color: 'var(--text-sub)',
            fontSize: '13px',
            lineHeight: 1.6,
          }}
        >
          还没有目标。生成一次练习回顾后，可以把建议「设为本周目标」🌱
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {goals.map((g) => {
            const latest = latestDimScore(scoreHistory, g.dimension)
            const base = g.baselineScore
            let progressText = '继续练习后，这里会显示该维度的变化'
            let progressColor = 'var(--text-sub)'
            if (typeof latest === 'number' && typeof base === 'number') {
              const diff = latest - base
              const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '＝'
              progressText = `${g.dimension}：起始 ${base} → 最新 ${latest}（${arrow}${
                diff === 0 ? '持平' : Math.abs(diff)
              }）`
              progressColor =
                diff > 0 ? 'var(--soft-feedback)' : diff < 0 ? 'var(--accent-deep)' : 'var(--text-sub)'
            }
            return (
              <div
                key={g.id}
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderRadius: 'var(--radius-base)',
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '8px',
                  }}
                >
                  <div style={{ fontSize: '15px', color: 'var(--text-main)', fontWeight: 600 }}>
                    {g.behavior}
                  </div>
                  <button
                    onClick={() => removeGoal(g.id)}
                    aria-label="删除目标"
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-sub)',
                      background: 'transparent',
                      padding: '2px 6px',
                      flexShrink: 0,
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '4px' }}>
                  {g.frequency ? `${g.frequency} · ` : ''}
                  {g.period} · 关注「{g.dimension}」
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    color: progressColor,
                    marginTop: '8px',
                    fontWeight: 500,
                  }}
                >
                  {progressText}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default GoalTracker
