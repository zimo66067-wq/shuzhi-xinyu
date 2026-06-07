import { useContext, useState } from 'react'
import { ChatContext } from '../App'
import PasswordGate from '../components/PasswordGate'
import ScoreRadarChart from '../components/ScoreRadarChart'
import { authHeader, getToken } from '../lib/parentAuth'

const API_BASE = ''  // 走 vite proxy / nginx 反代，相对路径

function ParentPage({ navigate }) {
  const { childInfo, messages, acousticHistory = [] } = useContext(ChatContext)

  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [score, setScore] = useState(null)
  const [reportText, setReportText] = useState('')
  const [error, setError] = useState('')

  const visibleMessages = messages.filter((m) => m.role !== 'system')
  const conversationReady = visibleMessages.length >= 2

  const handleGenerateReport = async () => {
    if (!conversationReady) return
    setLoading(true)
    setError('')
    setScore(null)
    setReportText('')

    try {
      // 第一步：评分（带家长 token）
      const scoreRes = await fetch(`${API_BASE}/api/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(),
        },
        body: JSON.stringify({
          messages,
          level: 'beginner',
        }),
      })
      if (scoreRes.status === 401) {
        setAuthenticated(false)
        throw new Error('登录已过期，请重新输入密码')
      }
      if (!scoreRes.ok) throw new Error('评分接口失败')
      const scoreData = await scoreRes.json()
      if (scoreData.error) throw new Error(scoreData.error)
      setScore(scoreData)

      // 第二步：报告（基于评分）
      const reportRes = await fetch(`${API_BASE}/api/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(),
        },
        body: JSON.stringify({
          score_data: scoreData,
          level: 'beginner',
        }),
      })
      if (reportRes.status === 401) {
        setAuthenticated(false)
        throw new Error('登录已过期，请重新输入密码')
      }
      if (!reportRes.ok) throw new Error('报告接口失败')
      const reportData = await reportRes.json()
      setReportText(reportData.report_text || '报告生成失败')
    } catch (err) {
      console.debug('[ParentPage] 评估失败:', err)
      setError('评估暂时不可用，请稍后再试')
    } finally {
      setLoading(false)
    }
  }

  // 进入时如果 sessionStorage 已有有效 token，直接放行
  if (!authenticated && getToken()) {
    setAuthenticated(true)
  }

  if (!authenticated) {
    return (
      <PasswordGate
        onSuccess={() => setAuthenticated(true)}
        onCancel={() => navigate('startup')}
      />
    )
  }

  return (
    <div className="page-container">
      {/* 顶栏 */}
      <div className="top-bar-new">
        <button
          className="btn-icon top-back"
          onClick={() => navigate('startup')}
          aria-label="返回首页"
        >
          ← 返回
        </button>
        <div className="top-title">家长后台</div>
        <div className="top-pause" />
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: '8px 0',
        }}
      >
        {/* 孩子信息 */}
        {childInfo && (
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-base)',
              fontSize: '15px',
              color: 'var(--text-main)',
            }}
          >
            👶 <strong>{childInfo.name}</strong> · {childInfo.age} 岁
          </div>
        )}

        {/* 对话记录 */}
        <section>
          <h3
            style={{
              fontSize: '16px',
              color: 'var(--text-main)',
              marginBottom: '8px',
            }}
          >
            📝 本次对话记录（{visibleMessages.length} 条）
          </h3>
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-base)',
              padding: '12px',
              maxHeight: '200px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '14px',
            }}
          >
            {visibleMessages.length === 0 ? (
              <div
                style={{
                  color: 'var(--text-sub)',
                  textAlign: 'center',
                  padding: '12px',
                }}
              >
                还没有对话记录
              </div>
            ) : (
              visibleMessages.map((m, i) => (
                <div key={i} style={{ lineHeight: 1.5 }}>
                  <span
                    style={{
                      color:
                        m.role === 'user'
                          ? 'var(--accent-deep)'
                          : 'var(--soft-feedback)',
                      fontWeight: 600,
                    }}
                  >
                    {m.role === 'user'
                      ? childInfo?.name || '孩子'
                      : '心屿'}
                    ：
                  </span>
                  <span style={{ color: 'var(--text-main)' }}>{m.content}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 生成报告按钮 */}
        <button
          className="btn-primary"
          onClick={handleGenerateReport}
          disabled={!conversationReady || loading}
          style={{
            opacity: !conversationReady || loading ? 0.4 : 1,
            cursor: !conversationReady ? 'not-allowed' : 'pointer',
          }}
          title={!conversationReady ? '需要先和心屿聊几句天' : ''}
        >
          {loading ? '⏳ 心屿正在分析...' : '📊 生成评估报告'}
        </button>

        {error && (
          <div
            style={{
              padding: '12px',
              backgroundColor: '#FFE0E0',
              borderRadius: '8px',
              color: 'var(--text-main)',
              textAlign: 'center',
              fontSize: '14px',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* 雷达图 */}
        {score && score.dimensions && (
          <section>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <h3
                style={{
                  fontSize: '16px',
                  color: 'var(--text-main)',
                  margin: 0,
                }}
              >
                🌟 5 维社交能力评估
              </h3>
              {/* Q0 防御性声明：仅演示 · 非临床 */}
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text-sub)',
                  background: 'var(--bg-card)',
                  padding: '3px 10px',
                  borderRadius: '10px',
                  border: '1px solid var(--text-sub)',
                  opacity: 0.75,
                }}
              >
                仅演示 · 非临床
              </span>
            </div>
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                borderRadius: 'var(--radius-base)',
                padding: '12px',
              }}
            >
              <ScoreRadarChart dimensions={score.dimensions} />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '6px',
                  marginTop: '12px',
                  fontSize: '13px',
                }}
              >
                {Object.entries(score.dimensions).map(([dim, info]) => (
                  <div
                    key={dim}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      color: 'var(--text-main)',
                    }}
                  >
                    <strong>{dim}</strong>：{info.score} / 5
                  </div>
                ))}
              </div>
              <div
                style={{
                  marginTop: '10px',
                  textAlign: 'center',
                  color: 'var(--text-sub)',
                  fontSize: '13px',
                }}
              >
                总分：{score.total_score} / 100
              </div>
            </div>
          </section>
        )}

        {/* 声学概览 */}
        {acousticHistory.length > 0 && (
          <section>
            <h3
              style={{
                fontSize: '16px',
                color: 'var(--text-main)',
                marginBottom: '8px',
              }}
            >
              🎵 声学特征概览（基于 {acousticHistory.length} 次发声）
            </h3>
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                borderRadius: 'var(--radius-base)',
                padding: '12px 16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '10px',
                fontSize: '13px',
                color: 'var(--text-main)',
              }}
            >
              {(() => {
                const mean = (arr) =>
                  arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length
                const avgRms = mean(acousticHistory.map((h) => h.rms?.mean ?? 0))
                const avgPitchMean = mean(
                  acousticHistory.map((h) => h.pitch?.mean ?? 0).filter((p) => p > 0),
                )
                const avgPitchStd = mean(
                  acousticHistory.map((h) => h.pitch?.std ?? 0).filter((p) => p > 0),
                )
                const avgSilence = mean(
                  acousticHistory.map((h) => h.silence_ratio ?? 0),
                )
                const avgDuration = mean(
                  acousticHistory.map((h) => h.duration ?? 0),
                )

                const interpretPitch = (std) => {
                  if (avgPitchMean === 0) return '数据不足'
                  if (std < 25) return '语调偏单调'
                  if (std > 80) return '情绪起伏较大'
                  return '正常范围'
                }
                const interpretSilence = (ratio) => {
                  if (ratio > 0.5) return '说话时停顿较多'
                  if (ratio > 0.3) return '正常'
                  return '语流连贯'
                }

                const items = [
                  ['平均音量', avgRms.toFixed(3), avgRms < 0.05 ? '偏小声' : avgRms > 0.3 ? '偏大声' : '正常'],
                  ['平均音高', avgPitchMean > 0 ? `${avgPitchMean.toFixed(0)} Hz` : '—', '—'],
                  ['音高波动', avgPitchStd > 0 ? `${avgPitchStd.toFixed(0)} Hz` : '—', interpretPitch(avgPitchStd)],
                  ['沉默占比', `${(avgSilence * 100).toFixed(0)}%`, interpretSilence(avgSilence)],
                  ['平均时长', `${avgDuration.toFixed(1)} 秒`, '—'],
                ]

                return items.map(([label, value, interpretation]) => (
                  <div
                    key={label}
                    style={{
                      backgroundColor: 'white',
                      padding: '8px 10px',
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{ color: 'var(--text-sub)', fontSize: '12px' }}>
                      {label}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '2px' }}>
                      {value}
                    </div>
                    {interpretation !== '—' && (
                      <div
                        style={{
                          color: 'var(--text-sub)',
                          fontSize: '11px',
                          marginTop: '2px',
                        }}
                      >
                        {interpretation}
                      </div>
                    )}
                  </div>
                ))
              })()}
            </div>
            <div
              style={{
                marginTop: '8px',
                fontSize: '12px',
                color: 'var(--text-sub)',
                lineHeight: 1.5,
              }}
            >
              说明：音高单调（&lt; 25Hz）和高停顿比可能与社交沟通模式相关，仅供参考，不作诊断依据。
            </div>
          </section>
        )}

        {/* 报告文本 */}
        {reportText && (
          <section>
            <h3
              style={{
                fontSize: '16px',
                color: 'var(--text-main)',
                marginBottom: '8px',
              }}
            >
              💌 给家长的建议
            </h3>
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                borderRadius: 'var(--radius-base)',
                padding: '14px 16px',
                fontSize: '15px',
                lineHeight: 1.7,
                color: 'var(--text-main)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {reportText}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

export default ParentPage
