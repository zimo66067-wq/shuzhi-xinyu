import { useState, useMemo, useCallback } from 'react'
import ScoreRadarChart from './ScoreRadarChart'
import ScoreTrendChart from './ScoreTrendChart'
import { buildArchiveReport, ARCHIVE_PERIODS } from '../lib/archiveReport'
import { downloadMarkdown } from '../lib/trainingLog'

// ── 打印样式：仅保留报告根，隐藏选择器/按钮 ───────────────────────
const PRINT_STYLE = `
@media print {
  body > * { display: none !important; }
  #archive-report-print-root { display: block !important; }
  #archive-report-print-root .no-print { display: none !important; }
  #archive-report-print-root { position: fixed; top: 0; left: 0; width: 100%; }
}
`

const sectionStyle = {
  backgroundColor: 'var(--bg-card)',
  borderRadius: 'var(--radius-base)',
  padding: '12px 14px',
  marginBottom: '14px',
}

function ArchiveReportPanel({ scoreHistory = [], onClose }) {
  const [periodKey, setPeriodKey] = useState('all')

  const period = useMemo(
    () => ARCHIVE_PERIODS.find((p) => p.key === periodKey) || ARCHIVE_PERIODS[0],
    [periodKey],
  )

  // 真实聚合：每次 period 变化重算
  const report = useMemo(
    () => buildArchiveReport(scoreHistory, period),
    [scoreHistory, period],
  )

  const { trend, data, skeletonText } = report
  const hasData = data.count > 0

  const handleExportMd = useCallback(() => {
    const date = new Date().toISOString().slice(0, 10)
    downloadMarkdown(skeletonText, `xinyu-archive-${date}.md`)
  }, [skeletonText])

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  return (
    <>
      <style>{PRINT_STYLE}</style>

      <div
        id="archive-report-print-root"
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
            maxWidth: '560px',
            backgroundColor: 'var(--page-bg, #f7f4ef)',
            borderRadius: '16px',
            padding: '0 0 24px',
            margin: '0 12px',
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
                📑 阶段性进度存档报告
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '2px' }}>
                社交训练为主、评估为辅 · 非诊断
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="关闭阶段报告面板"
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

          <div style={{ padding: '16px 20px 0' }}>
            {/* period 选择器 */}
            <div className="no-print" style={{ marginBottom: '14px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-sub)', marginBottom: '6px', display: 'block' }}>
                统计区间
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {ARCHIVE_PERIODS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPeriodKey(p.key)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '10px',
                      border: `1.5px solid ${periodKey === p.key ? 'var(--accent)' : 'var(--card-border)'}`,
                      background: periodKey === p.key ? 'var(--accent)' : 'var(--card-bg)',
                      color: periodKey === p.key ? 'white' : 'var(--text-main)',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                    aria-pressed={periodKey === p.key}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 报告头 */}
            <div style={{ ...sectionStyle }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)' }}>
                {data.periodLabel} · 共 {data.count} 次练习
              </div>
              {hasData && (
                <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '4px' }}>
                  时间范围：{data.firstDate} ~ {data.lastDate}
                </div>
              )}
            </div>

            {!hasData ? (
              <div
                style={{
                  ...sectionStyle,
                  textAlign: 'center',
                  color: 'var(--text-sub)',
                  fontSize: '14px',
                  lineHeight: 1.7,
                  padding: '24px 16px',
                }}
              >
                本阶段暂无练习数据。<br />
                完成练习并在家长后台生成「练习回顾」后，这里会按真实数据自动汇总。
              </div>
            ) : (
              <>
                {/* 总分概览 */}
                <div style={{ ...sectionStyle }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
                    总分概览（满分 100）
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-main)' }}>
                    <span style={{ background: 'white', padding: '6px 12px', borderRadius: '8px' }}>
                      平均 <strong>{data.avgTotal}</strong>
                    </span>
                    <span style={{ background: 'white', padding: '6px 12px', borderRadius: '8px' }}>
                      首次 {data.firstTotal} → 最近 {data.lastTotal}（
                      {data.totalDelta > 0 ? `上升 ${data.totalDelta}` : data.totalDelta < 0 ? `下降 ${Math.abs(data.totalDelta)}` : '持平'}）
                    </span>
                  </div>
                </div>

                {/* 维度均值雷达 */}
                <div style={{ ...sectionStyle }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                    维度均值雷达
                  </div>
                  <ScoreRadarChart dimensions={data.radarDimensions} />
                </div>

                {/* 趋势折线（复用 ScoreTrendChart） */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
                    跨次趋势
                  </div>
                  <ScoreTrendChart history={trend} />
                </div>

                {/* 真实数据表 */}
                <div style={{ ...sectionStyle }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
                    各维度数据（满分 5）
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ color: 'var(--text-sub)', textAlign: 'left' }}>
                        <th style={{ padding: '4px 6px' }}>维度</th>
                        <th style={{ padding: '4px 6px' }}>平均</th>
                        <th style={{ padding: '4px 6px' }}>首次</th>
                        <th style={{ padding: '4px 6px' }}>最近</th>
                        <th style={{ padding: '4px 6px' }}>变化</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.dims.map((d) => (
                        <tr key={d.name} style={{ color: 'var(--text-main)', borderTop: '1px solid rgba(168,155,138,0.18)' }}>
                          <td style={{ padding: '6px' }}>{d.name}</td>
                          <td style={{ padding: '6px' }}>{d.avg}</td>
                          <td style={{ padding: '6px' }}>{d.first}</td>
                          <td style={{ padding: '6px' }}>{d.last}</td>
                          <td style={{ padding: '6px', color: 'var(--text-sub)' }}>
                            {d.delta > 0 ? `上升 ${d.delta}` : d.delta < 0 ? `下降 ${Math.abs(d.delta)}` : '持平'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 骨架文本预览 */}
                <div style={{ ...sectionStyle }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
                    报告正文
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
                      background: 'rgba(255,255,255,0.6)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                    }}
                  >
                    {skeletonText}
                  </pre>
                </div>
              </>
            )}

            {/* 非临床标注 */}
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-sub)',
                lineHeight: 1.6,
                padding: '10px 12px',
                border: '1px dashed var(--text-sub)',
                borderRadius: '10px',
                marginBottom: '14px',
              }}
            >
              本报告基于本设备已记录的练习数据自动汇总，仅「骨架 + 真实数据」，
              不含临床映射、不替代专业诊断。
            </div>

            {/* 导出按钮 */}
            <div className="no-print" style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn-primary"
                style={{ flex: 1 }}
                onClick={handlePrint}
                aria-label="打印阶段报告为 PDF"
              >
                🖨 打印为 PDF
              </button>
              <button
                className="btn-primary"
                style={{ flex: 1, background: 'var(--text-sub)' }}
                onClick={handleExportMd}
                aria-label="导出阶段报告为 Markdown"
              >
                ⬇️ 导出 .md
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default ArchiveReportPanel
