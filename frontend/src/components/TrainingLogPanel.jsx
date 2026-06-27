import { useState, useContext, useMemo, useCallback } from 'react'
import { ChatContext } from '../App'
import { buildLog, downloadMarkdown } from '../lib/trainingLog'
import { authHeader } from '../lib/parentAuth'
import { API_BASE } from '../lib/api'

// ── 打印专用样式：隐藏面板外所有内容，只保留预览正文 ──────────────────
const PRINT_STYLE = `
@media print {
  body > * { display: none !important; }
  #training-log-print-root { display: block !important; }
  #training-log-print-root .no-print { display: none !important; }
  #training-log-print-root { position: fixed; top: 0; left: 0; width: 100%; }
}
`

// ── 公共样式 ───────────────────────────────────────────────────────
const sectionStyle = {
  backgroundColor: 'var(--bg-card)',
  borderRadius: 'var(--radius-base)',
  padding: '14px 16px',
  marginBottom: '14px',
}
const labelStyle = {
  display: 'block',
  fontSize: '13px',
  color: 'var(--text-sub)',
  marginBottom: '6px',
}
const textareaStyle = {
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
}
const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1.5px solid var(--card-border)',
  background: 'white',
  color: 'var(--text-main)',
  fontSize: '14px',
  boxSizing: 'border-box',
}

// ── 单个教师填写字段行 ─────────────────────────────────────────────
function Field({ id, label, value, onChange, multiline = false, placeholder = '（请填写）', maxLength = 500 }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          style={textareaStyle}
          aria-label={label}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          style={inputStyle}
          aria-label={label}
        />
      )}
    </div>
  )
}

// ── 主面板 ─────────────────────────────────────────────────────────
function TrainingLogPanel({ report = '', onClose }) {
  const { childInfo } = useContext(ChatContext)

  // 教师填写字段
  const [observation,  setObservation]  = useState('')
  const [intervention, setIntervention] = useState('')
  const [nextStep,     setNextStep]     = useState('')
  const [teacherName,  setTeacherName]  = useState('')
  const [duration,     setDuration]     = useState('')

  // 更正式排版状态
  const [formalLog,    setFormalLog]    = useState('')
  const [formalLoading, setFormalLoading] = useState(false)
  const [formalError,   setFormalError]   = useState('')

  // 实时汇总 fields 对象（传给 buildLog）
  const fields = useMemo(() => ({
    childAlias:   childInfo?.name || '',
    date:         new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }),
    duration,
    observation,
    intervention,
    nextStep,
    teacherName,
  }), [childInfo, duration, observation, intervention, nextStep, teacherName])

  // 实时预览 markdown（本地 buildLog，始终可用）
  const previewMarkdown = useMemo(() => buildLog(report, fields), [report, fields])

  // 最终展示内容：如果已有 formalLog 就用它，否则用本地 markdown
  const displayMarkdown = formalLog || previewMarkdown

  // 导出 .md
  const handleExport = useCallback(() => {
    downloadMarkdown(displayMarkdown)
  }, [displayMarkdown])

  // 打印为 PDF
  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  // 调用后端生成更正式排版
  const handleFormalLayout = useCallback(async () => {
    setFormalLoading(true)
    setFormalError('')
    try {
      const res = await fetch(`${API_BASE}/api/format_log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(),
        },
        body: JSON.stringify({
          ai_summary: report || '',
          fields: {
            childAlias:   childInfo?.name || '',
            date:         fields.date,
            duration:     duration || '',
            observation,
            intervention,
            nextStep,
            teacherName,
          },
        }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      if (!data.log) throw new Error('empty response')
      setFormalLog(data.log)
    } catch (e) {
      console.debug('[TrainingLogPanel] format_log 失败，回退本地:', e)
      setFormalError('服务暂不可用，已退回本地格式')
      setTimeout(() => setFormalError(''), 3000)
    } finally {
      setFormalLoading(false)
    }
  }, [report, fields, childInfo, duration, observation, intervention, nextStep, teacherName])

  return (
    <>
      {/* 打印样式注入 */}
      <style>{PRINT_STYLE}</style>

      {/* 整个面板挂 id 供 @media print 识别 */}
      <div
        id="training-log-print-root"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          backgroundColor: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          overflowY: 'auto',
          padding: '16px 0 32px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '520px',
            backgroundColor: 'var(--page-bg, #f7f4ef)',
            borderRadius: '16px',
            padding: '0 0 24px',
            margin: '0 12px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* 顶栏 */}
          <div
            className="no-print"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px 12px',
              borderBottom: '1px solid var(--card-border)',
            }}
          >
            <div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>
                📋 机构训练记录
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '2px' }}>
                仅供专业人员使用 · 非诊断工具
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="关闭训练记录面板"
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '22px',
                cursor: 'pointer',
                color: 'var(--text-sub)',
                lineHeight: 1,
                padding: '4px',
              }}
            >
              ×
            </button>
          </div>

          <div style={{ padding: '16px 20px 0', flex: 1 }}>

            {/* AI 摘要（只读） */}
            <div style={sectionStyle}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
                AI 训练摘要（只读）
              </div>
              <div
                style={{
                  fontSize: '13px',
                  lineHeight: 1.7,
                  color: report ? 'var(--text-main)' : 'var(--text-sub)',
                  whiteSpace: 'pre-wrap',
                  fontStyle: report ? 'normal' : 'italic',
                }}
              >
                {report || '本次未生成 AI 摘要，教师可在下方「课堂观察」中手填。'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-sub)', marginTop: '8px' }}>
                本摘要非标准化评估，不可用于诊断。
              </div>
            </div>

            {/* 教师填写区 */}
            <div className="no-print" style={{ ...sectionStyle, marginBottom: '0' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '12px' }}>
                教师填写
              </div>
              <Field
                id="log-duration"
                label="训练时长（分钟）"
                value={duration}
                onChange={setDuration}
                placeholder="例：20"
                maxLength={10}
              />
              <Field
                id="log-observation"
                label="课堂观察"
                value={observation}
                onChange={setObservation}
                multiline
                maxLength={500}
              />
              <Field
                id="log-intervention"
                label="干预策略"
                value={intervention}
                onChange={setIntervention}
                multiline
                maxLength={500}
              />
              <Field
                id="log-nextstep"
                label="下一步建议"
                value={nextStep}
                onChange={setNextStep}
                multiline
                maxLength={500}
              />
              <Field
                id="log-teacher"
                label="教师签名"
                value={teacherName}
                onChange={setTeacherName}
                placeholder="请输入姓名"
                maxLength={20}
              />
            </div>

            {/* 实时预览 */}
            <div style={{ ...sectionStyle, marginTop: '14px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
                  记录预览
                </div>
                {formalLog && (
                  <span style={{ fontSize: '11px', color: 'var(--accent)', background: 'rgba(95,159,130,0.1)', padding: '2px 8px', borderRadius: '8px' }}>
                    已使用正式排版
                  </span>
                )}
              </div>
              <pre
                style={{
                  fontSize: '12px',
                  lineHeight: 1.7,
                  color: 'var(--text-main)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: 0,
                  fontFamily: 'inherit',
                  maxHeight: '240px',
                  overflowY: 'auto',
                  background: 'rgba(255,255,255,0.6)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                }}
              >
                {displayMarkdown}
              </pre>
              {formalLog && (
                <button
                  onClick={() => setFormalLog('')}
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
                >
                  切回本地格式
                </button>
              )}
            </div>

            {/* 错误提示 */}
            {formalError && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: '#FFF3F3',
                  border: '1px solid var(--alert-soft)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: 'var(--text-main)',
                  marginBottom: '14px',
                }}
              >
                ⚠️ {formalError}
              </div>
            )}

            {/* 操作按钮行 */}
            <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="btn-primary"
                  style={{ flex: 1 }}
                  onClick={handleExport}
                  aria-label="导出训练记录为 Markdown 文件"
                >
                  ⬇️ 导出 .md
                </button>
                <button
                  className="btn-primary"
                  style={{ flex: 1 }}
                  onClick={handlePrint}
                  aria-label="打印训练记录为 PDF"
                >
                  🖨 打印为 PDF
                </button>
              </div>
              <button
                className="btn-primary"
                style={{
                  opacity: formalLoading ? 0.5 : 1,
                  background: 'var(--accent-deep)',
                  fontSize: '14px',
                }}
                onClick={handleFormalLayout}
                disabled={formalLoading}
                aria-label="调用 AI 生成更正式的排版"
              >
                {formalLoading ? '⏳ 正在生成正式排版…' : '✨ 生成更正式排版（AI）'}
              </button>
              <p style={{ fontSize: '11px', color: 'var(--text-sub)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
                「生成正式排版」调用后端 AI 整理已填内容；不可用时自动回退本地格式，功能不中断。
              </p>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}

export default TrainingLogPanel
