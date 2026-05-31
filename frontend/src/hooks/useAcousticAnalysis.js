import { useEffect, useRef, useState } from 'react'
import { createAnalyzer } from '../lib/acoustics'

// 实时安全阈值（已根据 demo 反馈下调，便于复现）
const THRESHOLDS = {
  CRY_RMS: 0.25,            // RMS 瞬时超过这个值 → 怀疑哭/喊（下调自 0.45）
  CRY_HOLD_MS: 200,         // 持续 200ms 才触发
  SILENCE_RMS: 0.015,
  SILENCE_HOLD_MS: 3000,
  AGITATED_PITCH_STD: 50,   // 录音结束时 pitch std > 50Hz → agitated（下调自 80）
  AGITATED_MIN_VALID_RATIO: 0.15, // pitch 有效帧占比（下调自 0.3）
}

// 调试日志：每秒打一次实时峰值，方便用户看自己声音强度
const DEBUG_LOG_INTERVAL_MS = 1000

/**
 * 订阅 MediaStream，实时计算声学特征，并通过 onSafetySignal 派发异常事件。
 * 录音停止（stream 置空或组件卸载）时返回 features summary。
 *
 * @param {{ stream: MediaStream | null, onSafetySignal?: (level: string) => void, onSummary?: (s: object) => void }} props
 */
export default function useAcousticAnalysis({
  stream,
  onSafetySignal,
  onSummary,
} = {}) {
  const [features, setFeatures] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const onSafetyRef = useRef(onSafetySignal)
  const onSummaryRef = useRef(onSummary)
  onSafetyRef.current = onSafetySignal
  onSummaryRef.current = onSummary

  useEffect(() => {
    if (!stream) return

    const analyzer = createAnalyzer(stream)
    let cryStart = null
    let silenceStart = null
    let lastCryFired = 0
    let lastSilenceFired = 0

    // 调试：累积区间内的峰值，每秒输出一次
    let dbgMaxRms = 0
    let dbgPitchCount = 0
    let dbgPitchSum = 0
    let dbgLastLog = performance.now()

    analyzer.onFrame((frame) => {
      const now = performance.now()

      // 累积调试数据
      if (frame.rms > dbgMaxRms) dbgMaxRms = frame.rms
      if (frame.pitch) {
        dbgPitchCount++
        dbgPitchSum += frame.pitch
      }
      if (now - dbgLastLog > DEBUG_LOG_INTERVAL_MS) {
        const avgPitch = dbgPitchCount > 0 ? (dbgPitchSum / dbgPitchCount).toFixed(0) : '--'
        console.debug(
          `[Acoustic] 实时: max_rms=${dbgMaxRms.toFixed(3)} (cry 阈值 ${THRESHOLDS.CRY_RMS}) | avg_pitch=${avgPitch}Hz`,
        )
        dbgMaxRms = 0
        dbgPitchCount = 0
        dbgPitchSum = 0
        dbgLastLog = now
      }

      // 哭/喊：高 RMS 持续
      if (frame.rms > THRESHOLDS.CRY_RMS) {
        if (cryStart === null) cryStart = now
        else if (
          now - cryStart > THRESHOLDS.CRY_HOLD_MS &&
          now - lastCryFired > 4000
        ) {
          lastCryFired = now
          cryStart = null
          console.debug('[Acoustic] 🚨 触发 cry！rms=', frame.rms.toFixed(3))
          onSafetyRef.current?.('cry')
        }
      } else {
        cryStart = null
      }

      // 沉默：低 RMS 持续
      if (frame.rms < THRESHOLDS.SILENCE_RMS) {
        if (silenceStart === null) silenceStart = now
        else if (
          now - silenceStart > THRESHOLDS.SILENCE_HOLD_MS &&
          now - lastSilenceFired > 6000
        ) {
          lastSilenceFired = now
          silenceStart = null
          console.debug('[Acoustic] 🌙 触发 silence')
          onSafetyRef.current?.('silence')
        }
      } else {
        silenceStart = null
      }
    })

    analyzer.start()
    setIsAnalyzing(true)
    setFeatures(null)

    return () => {
      try {
        const summary = analyzer.stop()
        setFeatures(summary)
        setIsAnalyzing(false)
        onSummaryRef.current?.(summary)

        // 调试：录音结束输出 summary 关键值
        console.debug(
          `[Acoustic] 录音结束 summary: pitch_std=${summary.pitch?.std?.toFixed(1) || '--'}Hz (agitated 阈值 ${THRESHOLDS.AGITATED_PITCH_STD}) | validRatio=${(summary.pitch?.validRatio * 100)?.toFixed(0) || 0}% (阈值 ${THRESHOLDS.AGITATED_MIN_VALID_RATIO * 100}%) | duration=${summary.duration?.toFixed(1)}s`,
        )

        // 录音结束后：基于整段 summary 判 agitated
        if (
          summary.pitch &&
          summary.pitch.validRatio > THRESHOLDS.AGITATED_MIN_VALID_RATIO &&
          summary.pitch.std > THRESHOLDS.AGITATED_PITCH_STD
        ) {
          console.debug('[Acoustic] 🌀 触发 agitated')
          onSafetyRef.current?.('agitated')
        }
      } catch (e) {
        console.debug('[useAcousticAnalysis] stop error:', e)
      }
    }
  }, [stream])

  return { features, isAnalyzing }
}
