import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

/**
 * ScoreTrendChart — 纵向进步趋势（整改 A-5）
 *
 * 仅在密码门控的家长区渲染（约束 5：不得出现在 ChatPage 等儿童可见处）。
 * 数据来自 localStorage 的历史评分，结构：[{ date, total_score, dimensions }]
 *  - 上图：近 N 次「总分」折线（0-100）
 *  - 下图：5 个维度折线（0-5）
 *
 * 只读已有字段，不改后端契约。数据不足时给友好占位、绝不报错。
 */

const DIMENSIONS = ['主动发起', '话题维持', '情绪识别', '礼貌用语', '参与度']
const DIM_COLORS = ['#FF9999', '#A8D8B9', '#F4C77B', '#9AC0E8', '#C9A8E0']
const MAX_POINTS = 10

function fmtDate(iso) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return `${d.getMonth() + 1}/${d.getDate()}`
  } catch {
    return ''
  }
}

function ScoreTrendChart({ history }) {
  const list = Array.isArray(history) ? history.slice(-MAX_POINTS) : []

  if (list.length < 2) {
    return (
      <div
        style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-base)',
          padding: '20px 16px',
          textAlign: 'center',
          color: 'var(--text-sub)',
          fontSize: '13px',
          lineHeight: 1.6,
        }}
      >
        再完成 {2 - list.length} 次练习回顾，这里就会出现「跨次进步趋势」折线啦 🌱
      </div>
    )
  }

  const totalData = list.map((h, i) => ({
    label: fmtDate(h.date) || `第${i + 1}次`,
    total: typeof h.total_score === 'number' ? h.total_score : 0,
  }))

  const dimData = list.map((h, i) => {
    const row = { label: fmtDate(h.date) || `第${i + 1}次` }
    DIMENSIONS.forEach((dim) => {
      row[dim] = h.dimensions?.[dim]?.score ?? 0
    })
    return row
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div
        style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-base)',
          padding: '12px',
        }}
      >
        <div style={{ fontSize: '13px', color: 'var(--text-sub)', marginBottom: '6px' }}>
          总分趋势（近 {totalData.length} 次）
        </div>
        <div style={{ width: '100%', height: 180 }}>
          <ResponsiveContainer>
            <LineChart data={totalData} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="#E8D9C8" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: '#A89B8A', fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#A89B8A', fontSize: 11 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="total"
                name="总分"
                stroke="#FF9999"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div
        style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-base)',
          padding: '12px',
        }}
      >
        <div style={{ fontSize: '13px', color: 'var(--text-sub)', marginBottom: '6px' }}>
          5 个维度趋势（0-5）
        </div>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={dimData} margin={{ top: 8, right: 12, bottom: 0, left: -24 }}>
              <CartesianGrid stroke="#E8D9C8" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: '#A89B8A', fontSize: 11 }} />
              <YAxis domain={[0, 5]} tickCount={6} tick={{ fill: '#A89B8A', fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {DIMENSIONS.map((dim, i) => (
                <Line
                  key={dim}
                  type="monotone"
                  dataKey={dim}
                  stroke={DIM_COLORS[i]}
                  strokeWidth={1.5}
                  dot={{ r: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

export default ScoreTrendChart
