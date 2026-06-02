/**
 * useLipSync — 心屿口型同步 Hook（任务 1 升级版）
 *
 * 用法：
 *   const setVrm = useLipSync({ volume, lowBand, midBand, highBand })
 *   // 拿到 VRM 实例后调用 setVrm(vrm)
 *
 * 上层（tts.js）每帧通过 props 传入实时声学指标：
 *   - volume    [0..1]  整体 RMS
 *   - lowBand   [0..1]  0-500Hz 能量占比（开口音 aa / oh）
 *   - midBand   [0..1]  500-2000Hz 能量占比（中性音 ee / ih）
 *   - highBand  [0..1]  2000Hz+ 能量占比（齿音 / 圆唇 ou）
 *
 * 映射策略（启发式，无需 phoneme 模型）：
 *   - aa  ← 大开口：高音量 + 低频主导
 *   - oh  ← 圆唇：中音量 + 低频主导 + 不那么响
 *   - ou  ← 撅嘴：中音量 + 高频偏多（"u" 类）
 *   - ee  ← 扁拉：中高频主导 + 中音量（"i/e" 类）
 *   - ih  ← 小开：低音量但能量集中在中频
 *
 * 每帧 lerp 平滑过渡，避免抖动。VRM 1.0 ExpressionManager 已经做了 morph 写入。
 */

import { useRef, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'

const VISEMES = ['aa', 'ih', 'ou', 'ee', 'oh']
// 全局上限：嘴最大张幅 1.0 = 完全张开
const VISEME_GAIN = 1.0
// 噪音门限：音量低于此值整张嘴闭合（不抖）
const SILENCE_THRESHOLD = 0.025
// 平滑系数：往目标值靠拢的速度（每帧）
const LERP = 0.45
// 音量灵敏度增益：实测中文 TTS 的 RMS 经常只有 0.1-0.3，需要拉一下
const VOLUME_BOOST = 2.4

/**
 * 简化 + 强健的 viseme 选择策略：
 * 1. 不管什么音量，只要超过静音门限，"aa" 永远有基础开口（保证总能看到嘴动）
 * 2. 再根据频段主导方向，叠加 ih / ou / ee / oh 增加丰富度
 * 3. 输出值尽量大，方便实战中看清动作
 */
function pickViseme(volume, low, mid, high) {
  if (volume < SILENCE_THRESHOLD) {
    return { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }
  }

  const v = Math.min(1, volume * VOLUME_BOOST)
  const out = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }

  // 基础开口：永远跟音量走（这是关键）
  out.aa = v * 0.65

  // 根据主导频段叠加辅助 viseme，让嘴型有变化
  if (low > mid && low > high) {
    // 低频主导（"a/o/u" 类元音）：偏大开口 + 圆唇感
    out.aa = v * 0.85
    out.oh = v * 0.35
  } else if (high > mid && high > low) {
    // 高频主导（"i/e/s/sh" 类）：嘴角拉宽
    out.aa = v * 0.30
    out.ee = v * 0.55
    out.ou = v * 0.20
  } else {
    // 中频主导（多数辅音 + 中性元音）：小开口 + 撅嘴
    out.aa = v * 0.55
    out.ih = v * 0.35
  }

  return out
}

function useLipSync({ volume = 0, lowBand = 0, midBand = 0, highBand = 0 } = {}) {
  const vrmRef = useRef(null)
  const currentRef = useRef({ aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 })
  const inputRef = useRef({ volume: 0, lowBand: 0, midBand: 0, highBand: 0 })

  // 每次渲染同步最新输入
  inputRef.current = { volume, lowBand, midBand, highBand }

  const setVrm = useCallback((vrm) => {
    vrmRef.current = vrm
  }, [])

  useFrame((_, delta) => {
    const vrm = vrmRef.current
    if (!vrm || !vrm.expressionManager) return

    const { volume: vol, lowBand: lb, midBand: mb, highBand: hb } = inputRef.current
    const target = pickViseme(vol, lb, mb, hb)
    const current = currentRef.current

    // 平滑过渡 + 写回 VRM expression
    for (const key of VISEMES) {
      current[key] += (target[key] * VISEME_GAIN - current[key]) * LERP
      try {
        vrm.expressionManager.setValue(key, current[key])
      } catch {
        // expression 不存在就跳过（容错）
      }
    }
  })

  return setVrm
}

export default useLipSync
