import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'

// 5 维度顺序固定，与后端 /api/score 一致
const DIMENSIONS = [
  '主动发起',
  '话题维持',
  '情绪识别',
  '礼貌用语',
  '参与度',
]

function ScoreRadarChart({ dimensions }) {
  if (!dimensions) return null

  const data = DIMENSIONS.map((dim) => ({
    dimension: dim,
    score: dimensions[dim]?.score ?? 0,
    max: 5,
  }))

  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="75%">
          <PolarGrid stroke="#E8D9C8" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: '#7B6D5C', fontSize: 13 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 5]}
            tickCount={6}
            tick={{ fill: '#A89B8A', fontSize: 10 }}
          />
          <Radar
            name="本次练习"
            dataKey="score"
            stroke="#FFD4D4"
            fill="#FFD4D4"
            fillOpacity={0.55}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default ScoreRadarChart
