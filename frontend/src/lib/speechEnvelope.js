export function createEnvelope({ text, rate = 1, onVolume }) {
  const charDuration = 130 / rate
  const totalDuration = text.length * charDuration

  let startTime = null
  let rafId = null
  let stopped = false

  const safeOnVolume = typeof onVolume === 'function' ? onVolume : () => {}

  function tick() {
    if (stopped) return
    if (startTime === null) startTime = performance.now()
    const elapsed = performance.now() - startTime

    if (elapsed >= totalDuration) {
      safeOnVolume(0)
      return
    }

    const charPos = Math.min(elapsed / charDuration, text.length - 0.001)
    const charProgress = charPos - Math.floor(charPos)

    const baseWave = Math.sin(charProgress * Math.PI)
    const amplitude = 0.65 + Math.sin(charPos * 1.7) * 0.25
    const noise = (Math.random() - 0.5) * 0.08

    const volume = Math.max(0, Math.min(1, baseWave * amplitude + noise))
    safeOnVolume(volume)

    rafId = requestAnimationFrame(tick)
  }

  return {
    start() {
      startTime = null
      stopped = false
      tick()
    },
    sync(charIndex) {
      if (typeof charIndex === 'number' && charIndex >= 0) {
        startTime = performance.now() - charIndex * charDuration
      }
    },
    stop() {
      stopped = true
      if (rafId) cancelAnimationFrame(rafId)
      safeOnVolume(0)
    },
  }
}
