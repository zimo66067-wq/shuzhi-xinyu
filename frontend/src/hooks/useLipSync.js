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
// 全局上限，避免嘴张得过夸张（卡通脸要克制）
const VISEME_GAIN = 0.85
// 噪音门限：音量小于此值整张嘴闭合（不抖）
const SILENCE_THRESHOLD = 0.04
// 平滑系数（越大越跟手，越小越柔）
const LERP = 0.35

function pickViseme(volume, low, mid, high) {
  // 静音时返回全零
  if (volume < SILENCE_THRESHOLD) return { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }

  const v = Math.min(1, volume * 1.4) // 拉伸到 [0,1]
  const out = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }

  // 大开口（aa）：音量大 + 低频主导
  if (v > 0.6 && low > mid && low > high) {
    out.aa = v * 0.95
  }
  // 圆唇（oh）：中等音量 + 低频
  else if (v > 0.3 && low >= mid) {
    out.oh = v * 0.7
    out.aa = v * 0.15 // 混一点 aa 避免太静态
  }
  // 撅嘴（ou）：中等音量 + 高频偏多
  else if (high > mid && v > 0.25) {
    out.ou = v * 0.65
  }
  // 扁拉（ee）：中音量 + 中高频主导
  else if (mid > low && mid >= high) {
    out.ee = v * 0.55
    out.ih = v * 0.25
  }
  // 小开（ih）：其它情况兜底
  else {
    out.ih = v * 0.6
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
