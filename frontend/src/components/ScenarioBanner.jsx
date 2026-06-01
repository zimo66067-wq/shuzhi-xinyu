/**
 * 场景模式横幅 + 子场景进度（任务 7）
 *
 * 只在 scenario 不为 null 时显示。
 * - 顶部一条简洁的横幅说明"正在练习：超市购物"
 * - 下面横向 5 个圆点，对应 5 个子场景，按 currentScene 高亮
 *
 * 退出按钮触发 onExit 回调（回到自由聊天模式）
 */

const SUPERMARKET_SCENES = [
  { key: 'enter', label: '打招呼' },
  { key: 'find', label: '找面包' },
  { key: 'ask_price', label: '问价钱' },
  { key: 'pay', label: '付钱' },
  { key: 'leave', label: '说再见' },
]

const SCENARIO_META = {
  supermarket: {
    title: '正在练习：超市购物',
    icon: '🛒',
    scenes: SUPERMARKET_SCENES,
  },
}

function ScenarioBanner({ scenario, currentScene, onExit }) {
  const meta = SCENARIO_META[scenario]
  if (!meta) return null

  const currentIdx = meta.scenes.findIndex((s) => s.key === currentScene)

  return (
    <div className="scenario-banner" role="region" aria-label={meta.title}>
      <div className="scenario-banner-row">
        <span className="scenario-icon" aria-hidden="true">
          {meta.icon}
        </span>
        <span className="scenario-title">{meta.title}</span>
        <button
          className="scenario-exit"
          onClick={onExit}
          aria-label="退出场景练习"
        >
          退出
        </button>
      </div>
      <div className="scenario-scenes">
        {meta.scenes.map((s, i) => {
          let status = 'future'
          if (currentIdx >= 0 && i < currentIdx) status = 'past'
          else if (i === currentIdx) status = 'current'
          return (
            <div key={s.key} className={`scene-cell ${status}`}>
              <div className={`scene-dot ${status}`} />
              <div className="scene-label">{s.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ScenarioBanner
