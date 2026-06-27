import { useContext, useState } from 'react'
import { ChatContext } from '../App'
import PasswordGate from '../components/PasswordGate'
import ScoreRadarChart from '../components/ScoreRadarChart'
import ScoreTrendChart from '../components/ScoreTrendChart'
import GoalTracker from '../components/GoalTracker'
import { authHeader, getToken } from '../lib/parentAuth'
import { API_BASE } from '../lib/api'
import TrainingLogPanel from '../components/TrainingLogPanel'
import ArchiveReportPanel from '../components/ArchiveReportPanel'
import { exportChildData, importChildData } from '../lib/dataTransfer'

// 整改 A-5：纵向评分历史（本地，沿用 xinyu_ 前缀）
const SCORE_HISTORY_KEY = 'xinyu_scoreHistory'
function loadScoreHistory() {
  try {
    const raw = localStorage.getItem(SCORE_HISTORY_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function ParentPage({ navigate }) {
  const {
    childInfo,
    messages,
    acousticHistory = [],
    settings,
    setSettings,
    wipeAllData,
    consent,
  } = useContext(ChatContext)

  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [score, setScore] = useState(null)
  const [reportText, setReportText] = useState('')
  const [error, setError] = useState('')
  const [showLogPanel, setShowLogPanel] = useState(false)
  // 整改 A-5：跨次趋势数据（家长区专用）
  const [scoreHistory, setScoreHistory] = useState(loadScoreHistory)
  // F5：阶段性进度存档报告面板
  const [showArchive, setShowArchive] = useState(false)
  // F6：跨设备迁移——导出化名弹框 + 同意再确认 + 导入结果提示
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportAlias, setExportAlias] = useState('')
  const [exportReaffirm, setExportReaffirm] = useState(false)
  const [transferMsg, setTransferMsg] = useState('')

  const visibleMessages = messages.filter((m) => m.role !== 'system')
  const conversationReady = visibleMessages.length >= 2

  // 整改 A-6：家长设置开关（自动朗读 / 界面动画 / 声学监测）
  const toggleSetting = (key) =>
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))

  // P-6：数值/选项类设置统一改这个
  const updateSetting = (key, value) =>
    setSettings((prev) => ({ ...prev, [key]: value }))

  // P-3：导出本设备数据——把所有 xinyu_* 键打包成 JSON 下载（纯本地，不上传）
  const handleExportData = () => {
    try {
      const dump = {}
      Object.keys(localStorage)
        .filter((k) => k.startsWith('xinyu_'))
        .forEach((k) => {
          try {
            dump[k] = JSON.parse(localStorage.getItem(k))
          } catch {
            dump[k] = localStorage.getItem(k)
          }
        })
      const payload = {
        exportedAt: new Date().toISOString(),
        app: '数智心屿',
        data: dump,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `xinyu-data-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.debug('[ParentPage] 导出失败:', e)
      setError('导出失败，请稍后再试')
    }
  }

  // P-3：永久删除本设备数据——二次确认后清空所有 xinyu_*，回到首次启动态
  const handleWipeData = () => {
    const ok = window.confirm(
      '将永久删除本设备上的全部数据（孩子信息、对话、评分历史、目标、设置等），且无法恢复。\n删除后会回到首次使用状态，需要重新同意并录入。\n\n确定删除吗？',
    )
    if (!ok) return
    const okAgain = window.confirm('再次确认：这一步不能撤销。真的要永久删除吗？')
    if (!okAgain) return
    wipeAllData?.()
  }

  // F6：打开「跨设备迁移」导出弹框（化名空白、需治疗师手填 + 同意再确认）
  const handleOpenExport = () => {
    setExportAlias('')
    setExportReaffirm(false)
    setTransferMsg('')
    setShowExportDialog(true)
  }

  // F6：确认导出——产出最小化 JSON（仅化名 + 训练指标，无真名/对话/录音）
  const handleConfirmExport = () => {
    const alias = exportAlias.trim()
    if (!alias || !exportReaffirm) return
    const res = exportChildData(alias)
    setShowExportDialog(false)
    setTransferMsg(
      res.ok
        ? `已导出「${alias}」的训练数据（${res.count} 次记录）。请通过本地文件手动传递，勿上传网络。`
        : res.error || '导出失败',
    )
  }

  // F6：选择文件导入——校验 + 合并去重写入 xinyu_scoreHistory（删除路径已覆盖）
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许重复选同一文件
    if (!file) return
    setTransferMsg('')
    const res = await importChildData(file)
    if (res.ok) {
      setScoreHistory(loadScoreHistory()) // 刷新趋势数据
      setTransferMsg(`导入完成：新增 ${res.added} 条，跳过重复 ${res.skipped} 条，当前共 ${res.total} 条。`)
    } else {
      setTransferMsg(`⚠️ ${res.error}`)
    }
  }

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

      // 整改 A-5：把本次 {date,total_score,dimensions} 追加进本地历史，喂趋势折线
      try {
        const entry = {
          date: new Date().toISOString(),
          total_score: scoreData.total_score,
          dimensions: scoreData.dimensions,
        }
        const next = [...loadScoreHistory(), entry].slice(-50)
        localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(next))
        setScoreHistory(next)
      } catch (e) {
        console.debug('[ParentPage] 写入评分历史失败:', e)
      }

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
      console.debug('[ParentPage] 生成回顾失败:', err)
      setError('回顾暂时不可用，请稍后再试')
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

        {/* F3：会话复核入口（密码门控内，孩子界面零暴露） */}
        <button
          className="btn-primary"
          onClick={() => navigate('review')}
          style={{ background: 'var(--text-sub)' }}
          aria-label="进入会话复核与标注"
        >
          🗂 会话复核（治疗师标注）
        </button>

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
          {loading ? '⏳ 心屿正在分析...' : '📊 生成本次练习回顾'}
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
                🌟 本次练习回顾
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

            {/* 整改 A-1 / A-4：非临床、非诊断固定标注 */}
            <div
              style={{
                marginTop: '8px',
                padding: '10px 12px',
                backgroundColor: 'var(--bg-card)',
                borderRadius: '10px',
                border: '1px dashed var(--text-sub)',
                fontSize: '12px',
                lineHeight: 1.6,
                color: 'var(--text-sub)',
              }}
            >
              本评分为参考性启发式，非标准化量表，不可用于诊断或分级。
              非诊断、非分级，仅供家长了解今天的参与情况。
            </div>
          </section>
        )}

        {/* 整改 A-5：跨次进步趋势（仅家长区） */}
        {(score || scoreHistory.length > 0) && (
          <section>
            <h3
              style={{
                fontSize: '16px',
                color: 'var(--text-main)',
                marginBottom: '8px',
              }}
            >
              📈 跨次进步趋势
            </h3>
            <ScoreTrendChart history={scoreHistory} />
          </section>
        )}

        {/* F5：阶段性进度存档报告入口（仅家长区，孩子界面零暴露） */}
        {scoreHistory.length > 0 && (
          <button
            className="btn-primary"
            onClick={() => setShowArchive(true)}
            style={{ background: 'var(--soft-feedback)' }}
            aria-label="查看阶段性进度存档报告"
          >
            📑 生成阶段报告
          </button>
        )}

        {/* P-4：IEP 式可追踪目标（复用 score.next_training + scoreHistory，仅家长区） */}
        <GoalTracker score={score} scoreHistory={scoreHistory} />

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

                // P-1：措辞中性化——只描述今天的声音情况，不暗示"模式/障碍/诊断"
                const interpretPitch = (std) => {
                  if (avgPitchMean === 0) return '数据不足'
                  if (std < 25) return '声音比较平稳'
                  if (std > 80) return '声音起伏较大'
                  return '一般'
                }
                const interpretSilence = (ratio) => {
                  if (ratio > 0.5) return '停顿较多'
                  if (ratio > 0.3) return '一般'
                  return '说得比较连贯'
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
              说明：以上只是今天说话的音量和停顿情况，仅供家长了解，不代表任何评估或诊断。
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
            {/* 整改 A-4：报告处同样固定标注非临床 */}
            <div
              style={{
                marginTop: '8px',
                fontSize: '12px',
                color: 'var(--text-sub)',
                lineHeight: 1.6,
              }}
            >
              本回顾为参考性启发式，非标准化量表，不可用于诊断或分级。
            </div>

            {/* F2：一键生成训练记录入口（密码门控内，孩子界面零暴露） */}
            <button
              className="btn-primary"
              onClick={() => setShowLogPanel(true)}
              style={{ marginTop: '12px', width: '100%' }}
              aria-label="生成本次机构训练记录"
            >
              📋 生成训练记录
            </button>
          </section>
        )}

        {/* 整改 A-6：感官设置（仅家长区，存 localStorage 全局生效） */}
        <section>
          <h3
            style={{
              fontSize: '16px',
              color: 'var(--text-main)',
              marginBottom: '8px',
            }}
          >
            ⚙️ 感官设置
          </h3>
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-base)',
              padding: '8px 14px',
            }}
          >
            <SettingRow
              label="自动朗读心屿的话（TTS）"
              hint="关掉后只显示文字，不出声"
              checked={settings.autoTTS}
              onToggle={() => toggleSetting('autoTTS')}
            />
            <SettingRow
              label="界面动画"
              hint="关掉浮动、摇头、淡入等非必要动画"
              checked={settings.animations}
              onToggle={() => toggleSetting('animations')}
            />
            <SettingRow
              label="声学监测"
              hint="关掉哭声/激动等实时声音监测与声学摘要"
              checked={settings.acoustic}
              onToggle={() => toggleSetting('acoustic')}
            />
          </div>
        </section>

        {/* P-5：录音方式 */}
        <section>
          <h3
            style={{
              fontSize: '16px',
              color: 'var(--text-main)',
              marginBottom: '8px',
            }}
          >
            🎤 录音设置
          </h3>
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-base)',
              padding: '8px 14px',
            }}
          >
            <SettingSelect
              label="录音方式"
              hint="长按：按住说话、松手结束；点按：点一下开始、再点停止"
              value={settings.recordMode}
              options={[
                { value: 'hold', label: '长按说话' },
                { value: 'tap', label: '点按切换' },
              ]}
              onChange={(v) => updateSetting('recordMode', v)}
            />
            <SettingSelect
              label="最短录音时长"
              hint="太短的录音会提示重说；手慢的孩子可调长一点"
              value={String(settings.minRecordMs)}
              options={[
                { value: '200', label: '0.2 秒' },
                { value: '300', label: '0.3 秒（默认）' },
                { value: '500', label: '0.5 秒' },
                { value: '800', label: '0.8 秒' },
              ]}
              onChange={(v) => updateSetting('minRecordMs', parseInt(v, 10))}
            />
          </div>
        </section>

        {/* P-6：朗读与时长设置 */}
        <section>
          <h3
            style={{
              fontSize: '16px',
              color: 'var(--text-main)',
              marginBottom: '8px',
            }}
          >
            🔊 朗读与时长设置
          </h3>
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-base)',
              padding: '8px 14px',
            }}
          >
            <SettingRange
              label="朗读语速"
              hint="心屿说话的快慢（1.0 为默认）"
              value={settings.ttsRate}
              min={0.6}
              max={1.4}
              step={0.05}
              onChange={(v) => updateSetting('ttsRate', v)}
              format={(v) => `${v.toFixed(2)}×`}
            />
            <SettingRange
              label="朗读音量"
              hint="心屿声音大小（1.0 为默认）"
              value={settings.ttsVolume}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => updateSetting('ttsVolume', v)}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <SettingRange
              label="朗读音调"
              hint="仅在系统语音兜底时生效（1.0 为默认）"
              value={settings.ttsPitch}
              min={0.6}
              max={1.4}
              step={0.05}
              onChange={(v) => updateSetting('ttsPitch', v)}
              format={(v) => v.toFixed(2)}
            />
            <SettingSelect
              label="单次时长提醒"
              hint="聊了这么久后，温和提示也去找朋友玩"
              value={String(settings.sessionLimitMin)}
              options={[
                { value: '10', label: '10 分钟' },
                { value: '15', label: '15 分钟（默认）' },
                { value: '20', label: '20 分钟' },
                { value: '30', label: '30 分钟' },
              ]}
              onChange={(v) => updateSetting('sessionLimitMin', parseInt(v, 10))}
            />
          </div>
        </section>

        {/* P-3：本设备数据（导出 + 永久删除） */}
        <section>
          <h3
            style={{
              fontSize: '16px',
              color: 'var(--text-main)',
              marginBottom: '8px',
            }}
          >
            📦 本设备数据
          </h3>
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-base)',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <p style={{ fontSize: '13px', color: 'var(--text-sub)', lineHeight: 1.6 }}>
              所有数据只存在这台设备上。社交训练为主、评估为辅，以下数据仅供专业人员参考。
            </p>

            {/* 本机完整备份（含原始数据，仅用于本机恢复） */}
            <button
              className="btn-primary"
              onClick={handleExportData}
              aria-label="本机完整备份"
            >
              💾 本机完整备份（含原始数据）
            </button>
            <p style={{ fontSize: '12px', color: 'var(--text-sub)', lineHeight: 1.5, margin: '-4px 0 4px' }}>
              含孩子信息与对话原文，仅用于本机恢复，<strong>勿传递他人</strong>。
            </p>

            {/* F6：跨设备迁移（最小化，仅化名 + 训练指标） */}
            <button
              className="btn-primary"
              onClick={handleOpenExport}
              style={{ background: 'var(--soft-feedback)' }}
              aria-label="跨设备迁移导出"
            >
              📤 跨设备迁移（已最小化）
            </button>
            <p style={{ fontSize: '12px', color: 'var(--text-sub)', lineHeight: 1.5, margin: '-4px 0 4px' }}>
              仅导出化名与训练指标，<strong>不含真名 / 对话 / 录音</strong>。本地文件手动传递，不上传网络。
            </p>

            {/* F6：导入另一台设备的迁移文件 */}
            <label
              className="btn-primary"
              style={{ background: 'var(--soft-feedback)', textAlign: 'center', cursor: 'pointer', display: 'block' }}
              aria-label="导入儿童训练数据"
            >
              📥 导入迁移文件（合并去重）
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleImportFile}
                style={{ display: 'none' }}
              />
            </label>

            {/* 迁移结果提示 */}
            {transferMsg && (
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--text-main)',
                  background: 'white',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  lineHeight: 1.6,
                }}
              >
                {transferMsg}
              </div>
            )}

            <button
              className="btn-alert"
              onClick={handleWipeData}
              aria-label="永久删除本设备数据"
            >
              🗑 永久删除本设备数据
            </button>
            <p style={{ fontSize: '12px', color: 'var(--text-sub)', lineHeight: 1.5, margin: '-4px 0 0' }}>
              永久删除适用于本机全部数据，<strong>含导入进来的迁移数据</strong>，不可恢复。
            </p>
          </div>
        </section>

        {/* 整改 A-3：危机求助（号码为占位，禁止编造） */}
        <section>
          <h3
            style={{
              fontSize: '16px',
              color: 'var(--text-main)',
              marginBottom: '8px',
            }}
          >
            🆘 危机求助
          </h3>
          <div
            style={{
              backgroundColor: '#FFF3F3',
              border: '1px solid var(--alert-soft)',
              borderRadius: 'var(--radius-base)',
              padding: '14px 16px',
              fontSize: '14px',
              lineHeight: 1.7,
              color: 'var(--text-main)',
            }}
          >
            <p style={{ marginBottom: '8px' }}>
              本产品不是危机干预工具。如果孩子出现持续哭闹、自伤或其他紧急情况，请由在场的成人立即处理，并联系专业机构。
            </p>
            <div style={{ fontSize: '13px', color: 'var(--text-sub)' }}>
              心理援助热线：【填入已核实的本地心理援助热线，勿编造】
              <br />
              紧急求助电话：【填入已核实的当地急救/求助电话，勿编造】
            </div>
          </div>
        </section>
      </div>

      {/* F2：训练记录面板（密码门控内，覆盖层，孩子界面不可达） */}
      {showLogPanel && (
        <TrainingLogPanel
          report={reportText}
          onClose={() => setShowLogPanel(false)}
        />
      )}

      {/* F5：阶段性进度存档报告面板（密码门控内，覆盖层，孩子界面不可达） */}
      {showArchive && (
        <ArchiveReportPanel
          scoreHistory={scoreHistory}
          onClose={() => setShowArchive(false)}
        />
      )}

      {/* F6：跨设备迁移导出弹框——化名空白手填 + 监护人同意再确认（合规第1条触点） */}
      {showExportDialog && (
        <div
          className="modal-overlay"
          style={{ position: 'fixed', inset: 0, zIndex: 200 }}
          role="dialog"
          aria-label="跨设备迁移导出"
        >
          <div className="modal-content" style={{ width: '100%', maxWidth: '360px', textAlign: 'left' }}>
            <h3 style={{ marginBottom: '4px' }}>跨设备迁移 · 导出</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-sub)', lineHeight: 1.6, marginBottom: '14px' }}>
              仅导出化名与训练指标，不含真名 / 对话 / 录音。社交训练为主、评估为辅。
            </p>

            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-sub)', marginBottom: '6px' }} htmlFor="export-alias">
              儿童化名（请勿填真名）
            </label>
            <input
              id="export-alias"
              type="text"
              value={exportAlias}
              onChange={(e) => setExportAlias(e.target.value)}
              maxLength={20}
              placeholder="请输入化名（如：小星）"
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1.5px solid var(--card-border)',
                background: 'white',
                color: 'var(--text-main)',
                fontSize: '15px',
                boxSizing: 'border-box',
                marginBottom: '14px',
              }}
              aria-label="儿童化名"
            />

            <label
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start',
                fontSize: '13px',
                color: 'var(--text-main)',
                lineHeight: 1.5,
                marginBottom: '16px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={exportReaffirm}
                onChange={(e) => setExportReaffirm(e.target.checked)}
                style={{ marginTop: '2px' }}
              />
              <span>我确认已取得监护人知情同意，且本文件仅含化名训练数据，将通过本地文件手动传递。</span>
            </label>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn-primary"
                style={{ flex: 1, background: 'var(--text-sub)', color: 'white' }}
                onClick={() => setShowExportDialog(false)}
              >
                取消
              </button>
              <button
                className="btn-primary"
                style={{ flex: 1, opacity: exportAlias.trim() && exportReaffirm ? 1 : 0.4 }}
                onClick={handleConfirmExport}
                disabled={!exportAlias.trim() || !exportReaffirm}
                aria-label="确认导出迁移文件"
              >
                确认导出
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 整改 A-6：单行开关
function SettingRow({ label, hint, checked, onToggle }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '10px 0',
        borderBottom: '1px solid rgba(168, 155, 138, 0.15)',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', color: 'var(--text-main)' }}>{label}</div>
        {hint && (
          <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '2px' }}>
            {hint}
          </div>
        )}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
        className={`toggle-switch ${checked ? 'on' : 'off'}`}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  )
}

// P-5/P-6：下拉选择型设置行（录音方式 / 最短时长 / 单次时长提醒）
function SettingSelect({ label, hint, value, options, onChange }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '10px 0',
        borderBottom: '1px solid rgba(168, 155, 138, 0.15)',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', color: 'var(--text-main)' }}>{label}</div>
        {hint && (
          <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '2px' }}>
            {hint}
          </div>
        )}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        style={{
          fontSize: '14px',
          padding: '6px 10px',
          borderRadius: '10px',
          border: '1px solid var(--text-sub)',
          backgroundColor: 'white',
          color: 'var(--text-main)',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// P-6：滑块型设置行（语速 / 音调 / 音量）
function SettingRange({ label, hint, value, min, max, step, onChange, format }) {
  return (
    <div
      style={{
        padding: '10px 0',
        borderBottom: '1px solid rgba(168, 155, 138, 0.15)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ fontSize: '14px', color: 'var(--text-main)' }}>{label}</div>
        <div
          style={{
            fontSize: '13px',
            color: 'var(--text-sub)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {format ? format(value) : value}
        </div>
      </div>
      {hint && (
        <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '2px' }}>
          {hint}
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={label}
        style={{ width: '100%', marginTop: '8px', accentColor: 'var(--accent-deep)' }}
      />
    </div>
  )
}

export default ParentPage
