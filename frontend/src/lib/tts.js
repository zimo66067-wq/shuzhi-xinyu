import { createEnvelope } from './speechEnvelope'

const TTS_ENDPOINT = 'http://localhost:5000/api/tts'

let preferredVoiceCache = null

let currentAudio = null
let currentAudioCtx = null
let currentRaf = null
let currentEnvelope = null
let currentObjectURL = null

function pickVoice() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null

  const zhVoices = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('zh'))
  if (!zhVoices.length) return null

  const femalePatterns = /yaoyao|huihui|xiaoxiao|xiaoyi|tingting|hanhan|female|woman|girl|女/i
  return zhVoices.find((v) => femalePatterns.test(v.name)) || zhVoices[0]
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  preferredVoiceCache = pickVoice()
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    preferredVoiceCache = pickVoice()
  })
}

export function getPreferredVoice() {
  if (!preferredVoiceCache) preferredVoiceCache = pickVoice()
  return preferredVoiceCache
}

export function isSpeaking() {
  if (currentAudio && !currentAudio.paused) return true
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    return window.speechSynthesis.speaking
  }
  return false
}

export function cancel() {
  if (currentRaf) {
    cancelAnimationFrame(currentRaf)
    currentRaf = null
  }
  if (currentAudio) {
    try {
      currentAudio.pause()
      currentAudio.src = ''
    } catch (_) {}
    currentAudio = null
  }
  if (currentObjectURL) {
    URL.revokeObjectURL(currentObjectURL)
    currentObjectURL = null
  }
  if (currentAudioCtx) {
    try {
      currentAudioCtx.close()
    } catch (_) {}
    currentAudioCtx = null
  }
  if (currentEnvelope) {
    currentEnvelope.stop()
    currentEnvelope = null
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

async function speakWithEdgeTTS(text, { onVolume, onEnd }) {
  const response = await fetch(TTS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!response.ok) throw new Error(`edge-tts HTTP ${response.status}`)

  const blob = await response.blob()
  if (!blob || blob.size < 100) throw new Error('edge-tts 返回空音频')

  const url = URL.createObjectURL(blob)
  currentObjectURL = url

  return new Promise((resolve) => {
    const audio = new Audio(url)
    audio.crossOrigin = 'anonymous'
    currentAudio = audio

    const AudioCtx = window.AudioContext || window.webkitAudioContext
    const audioCtx = new AudioCtx()
    currentAudioCtx = audioCtx

    let source
    try {
      source = audioCtx.createMediaElementSource(audio)
    } catch (e) {
      console.warn('[TTS] AnalyserNode 创建失败，仅播放无口型:', e)
    }

    let analyser = null
    let timeData = null
    if (source) {
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.6
      timeData = new Uint8Array(analyser.fftSize)
      source.connect(analyser)
      source.connect(audioCtx.destination)
    }

    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      if (currentRaf) {
        cancelAnimationFrame(currentRaf)
        currentRaf = null
      }
      onVolume(0)
      try {
        audioCtx.close()
      } catch (_) {}
      if (currentObjectURL === url) {
        URL.revokeObjectURL(url)
        currentObjectURL = null
      }
      currentAudio = null
      currentAudioCtx = null
      onEnd()
      resolve()
    }

    const tick = () => {
      if (!analyser || !timeData || finished) return
      analyser.getByteTimeDomainData(timeData)
      let sumSq = 0
      for (let i = 0; i < timeData.length; i++) {
        const v = (timeData[i] - 128) / 128
        sumSq += v * v
      }
      const rms = Math.sqrt(sumSq / timeData.length)
      const volume = Math.min(1, rms * 3.2)
      onVolume(volume)
      currentRaf = requestAnimationFrame(tick)
    }

    audio.onplay = () => {
      if (analyser) tick()
    }
    audio.onended = finish
    audio.onerror = (e) => {
      console.warn('[TTS] 音频播放失败:', e)
      finish()
    }

    audio.play().catch((err) => {
      console.warn('[TTS] audio.play() 被浏览器拒绝:', err)
      finish()
    })
  })
}

function speakWithWebSpeech(text, { rate, pitch, volume, onVolume, onEnd }) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onEnd()
      resolve()
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = rate
    utterance.pitch = pitch
    utterance.volume = volume

    const voice = getPreferredVoice()
    if (voice) {
      utterance.voice = voice
      utterance.lang = voice.lang
    } else {
      utterance.lang = 'zh-CN'
    }

    const envelope = createEnvelope({ text, rate, onVolume })
    currentEnvelope = envelope

    utterance.onstart = () => envelope.start()
    utterance.onboundary = (event) => {
      if (typeof event.charIndex === 'number') envelope.sync(event.charIndex)
    }

    const finish = (errorEvent) => {
      envelope.stop()
      onVolume(0)
      currentEnvelope = null
      if (errorEvent && errorEvent.error && errorEvent.error !== 'canceled' && errorEvent.error !== 'interrupted') {
        console.warn('[TTS] Web Speech 出错:', errorEvent.error)
      }
      onEnd()
      resolve()
    }

    utterance.onend = () => finish()
    utterance.onerror = (event) => finish(event)

    window.speechSynthesis.speak(utterance)
  })
}

export async function speak(text, options = {}) {
  if (!text) {
    if (typeof options.onEnd === 'function') options.onEnd()
    return
  }

  cancel()

  const {
    rate = 0.85,
    pitch = 1.1,
    volume = 1.0,
    onVolume = () => {},
    onEnd = () => {},
  } = options

  try {
    await speakWithEdgeTTS(text, { onVolume, onEnd })
    return
  } catch (e) {
    console.warn('[TTS] edge-tts 不可用，降级 Web Speech:', e.message)
  }

  await speakWithWebSpeech(text, { rate, pitch, volume, onVolume, onEnd })
}
