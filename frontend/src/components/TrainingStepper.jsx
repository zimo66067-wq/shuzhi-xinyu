// 训练阶段进度条 - 5 步横向 Stepper
// 由后端 /api/chat 返回的 stage 字段驱动；前端按轮数兜底
// 静态展示，无动画推进（ASD 友好）

const STAGES = [
  { key: 'welcome', label: '欢迎' },
  { key: 'free_chat', label: '自由对话' },
  { key: 'emotion_guide', label: '情绪引导' },
  { key: 'scenario_test', label: '场景测试' },
  { key: 'ending', label: '结束' },
]

/**
 * 备用：当后端没返回 stage 时按对话轮数推断
 *   0-2 轮: welcome
 *   3-5 轮: free_chat
 *   6-9 轮: emotion_guide
 *  10-13 轮: scenario_test
 *  14+ 轮: ending
 */
export function stageFromRoundCount(visibleMessageCount) {
  if (visibleMessageCount < 3) return 'welcome'
  if (visibleMessageCount < 6) return 'free_chat'
  if (visibleMessageCount < 10) return 'emotion_guide'
  if (visibleMessageCount < 14) return 'scenario_test'
  return 'ending'
}

function TrainingStepper({ currentStage }) {
  const currentIdx = STAGES.findIndex((s) => s.key === currentStage)
  const safeIdx = currentIdx < 0 ? 0 : currentIdx

  return (
    <div className="training-stepper" aria-label={`训练阶段：${STAGES[safeIdx].label}`}>
      {STAGES.map((stage, idx) => {
        let status = 'future'
        if (idx < safeIdx) status = 'past'
        else if (idx === safeIdx) status = 'current'

        return (
          <div key={stage.key} className="stepper-cell">
            <div className={`stepper-dot ${status}`}>
              {status === 'past' ? '✓' : idx + 1}
            </div>
            <div className={`stepper-label ${status}`}>{stage.label}</div>
            {idx < STAGES.length - 1 && (
              <div className={`stepper-line ${idx < safeIdx ? 'past' : 'future'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default TrainingStepper
