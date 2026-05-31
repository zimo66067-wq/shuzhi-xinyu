// 声学特征提取：基于 Web Audio AnalyserNode + 帧级 RMS/ZCR/pitch
// pitch 检测用自相关法（autocorrelation），简单稳定
// 输出 frame 流 + 录音结束时的 summary

const ANALYSIS_INTERVAL_MS = 80 // 每 ~80ms 计算一帧（≈12.5 fps，省 CPU）

/**
 * 自相关 pitch 检测，返回 Hz；找不到返回 -1
 * buf: Float32Array 时域数据
 */
function detectPitch(buf, sampleRate) {
  const SIZE = buf.length
  let rms = 0
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / SIZE)
  if (rms < 0.01) return -1 // 太安静

  // 裁掉前后接近 0 的部分
  let r1 = 0
  let r2 = SIZE - 1
  const thres = 0.2
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) {
      r1 = i
      break
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) {
      r2 = SIZE - i
      break
    }
  }
  const trimmed = buf.subarray(r1, r2)
  const N = trimmed.length
  if (N < 64) return -1

  // 自相关
  const c = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N - i; j++) {
      c[i] = c[i] + trimmed[j] * trimmed[j + i]
    }
  }

  // 找第一个峰
  let d = 0
  while (d < N - 1 && c[d] > c[d + 1]) d++
  let maxVal = -1
  let maxPos = -1
  for (let i = d; i < N; i++) {
    if (c[i] > maxVal) {
      maxVal = c[i]
      maxPos = i
    }
  }
  if (maxPos <= 0) return -1
  const pitch = sampleRate / maxPos
  if (pitch < 60 || pitch > 600) return -1 // 人声合理范围
  return pitch
}

/**
 * 创建一个声学分析器，订阅 MediaStream。
 *
 * @param {MediaStream} stream
 * @returns {{
 *   start: () => void,
 *   stop: () => AcousticFeatures,
 *   onFrame: (cb: (frame) => void) => void,
 * }}
 */
export function createAnalyzer(stream) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  const audioCtx = new AudioCtx()
  const source = audioCtx.createMediaStreamSource(stream)
  const analyser = audioCtx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.3
  source.connect(analyser)
  // 不连 destination，避免把麦克风的声音回放出来

  const timeData = new Float32Array(analyser.fftSize)
  const freqData = new Uint8Array(analyser.frequencyBinCount)

  const frames = []
  const listeners = []
  let intervalId = null
  let startTime = null
  let stopped = false

  function tick() {
    if (stopped) return
    analyser.getFloatTimeDomainData(timeData)

    // RMS
    let sumSq = 0
    let zeroCrossings = 0
    for (let i = 0; i < timeData.length; i++) {
      sumSq += timeData[i] * timeData[i]
      if (i > 0 && Math.sign(timeData[i]) !== Math.sign(timeData[i - 1])) {
        zeroCrossings++
      }
    }
    const rms = Math.sqrt(sumSq / timeData.length)
    const zcr = zeroCrossings / timeData.length

    // Pitch
    const pitch = detectPitch(timeData, audioCtx.sampleRate)

    // Spectral centroid
    analyser.getByteFrequencyData(freqData)
    let weightedSum = 0
    let magnitudeSum = 0
    for (let i = 0; i < freqData.length; i++) {
      weightedSum += i * freqData[i]
      magnitudeSum += freqData[i]
    }
    const centroid =
      magnitudeSum > 0
        ? ((weightedSum / magnitudeSum) * (audioCtx.sampleRate / 2)) /
          freqData.length
        : 0

    const frame = {
      t: performance.now() - startTime,
      rms,
      zcr,
      pitch: pitch > 0 ? pitch : null,
      centroid,
    }
    frames.push(frame)
    listeners.forEach((cb) => {
      try {
        cb(frame)
      } catch (e) {
        console.debug('[acoustics] listener error:', e)
      }
    })
  }

  function summarize() {
    if (frames.length === 0) {
      return {
        duration: 0,
        rms: { mean: 0, std: 0, min: 0, max: 0 },
        pitch: { mean: 0, std: 0, range: 0, validRatio: 0 },
        zcr: { mean: 0, std: 0 },
        silence_ratio: 1,
        energy_variance: 0,
      }
    }

    const rmsValues = frames.map((f) => f.rms)
    const zcrValues = frames.map((f) => f.zcr)
    const validPitches = frames.map((f) => f.pitch).filter((p) => p !== null)

    const mean = (arr) =>
      arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length
    const std = (arr) => {
      if (arr.length === 0) return 0
      const m = mean(arr)
      return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)))
    }

    const SILENCE_THRESHOLD = 0.02
    const silenceFrames = rmsValues.filter((v) => v < SILENCE_THRESHOLD).length

    return {
      duration: (frames[frames.length - 1].t - frames[0].t) / 1000,
      rms: {
        mean: mean(rmsValues),
        std: std(rmsValues),
        min: Math.min(...rmsValues),
        max: Math.max(...rmsValues),
      },
      pitch:
        validPitches.length > 0
          ? {
              mean: mean(validPitches),
              std: std(validPitches),
              range: Math.max(...validPitches) - Math.min(...validPitches),
              validRatio: validPitches.length / frames.length,
            }
          : { mean: 0, std: 0, range: 0, validRatio: 0 },
      zcr: {
        mean: mean(zcrValues),
        std: std(zcrValues),
      },
      silence_ratio: silenceFrames / frames.length,
      energy_variance: std(rmsValues),
    }
  }

  return {
    start() {
      if (intervalId) return
      startTime = performance.now()
      stopped = false
      // 用 setInterval 而不是 RAF：帧率稳定，省 CPU
      intervalId = setInterval(tick, ANALYSIS_INTERVAL_MS)
    },
    stop() {
      stopped = true
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
      const summary = summarize()
      try {
        source.disconnect()
        analyser.disconnect()
        audioCtx.close()
      } catch (_) {}
      return summary
    },
    onFrame(cb) {
      if (typeof cb === 'function') listeners.push(cb)
    },
  }
}
