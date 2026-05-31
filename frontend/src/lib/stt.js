const STT_ENDPOINT = 'http://localhost:5000/api/stt'

function pickSupportedMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]
  if (typeof MediaRecorder === 'undefined') return null
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t
    } catch (_) {}
  }
  return null
}

export function isSupported() {
  if (typeof navigator === 'undefined') return false
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false
  if (typeof MediaRecorder === 'undefined') return false
  return true
}

export function createRecorder() {
  let stream = null
  let recorder = null
  let chunks = []
  const mimeType = pickSupportedMimeType()

  const controller = {
    isRecording: false,
    getStream() {
      return stream
    },
    async start() {
      if (this.isRecording) return
      // 关闭 AGC/降噪/回声消除：声学分析需要"原始"音频，否则大喊会被自动压低
      // STT 识别质量也未必更差（腾讯云 ASR 自带降噪）
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          noiseSuppression: false,
          echoCancellation: false,
        },
      })
      chunks = []
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data)
      }
      recorder.start()
      this.isRecording = true
    },
    stop() {
      return new Promise((resolve, reject) => {
        if (!recorder) {
          resolve(new Blob([], { type: 'audio/webm' }))
          return
        }
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType || 'audio/webm' })
          if (stream) {
            stream.getTracks().forEach((t) => t.stop())
            stream = null
          }
          recorder = null
          chunks = []
          this.isRecording = false
          resolve(blob)
        }
        recorder.onerror = (e) => reject(e.error || new Error('recorder error'))
        try {
          recorder.stop()
        } catch (e) {
          reject(e)
        }
      })
    },
  }
  return controller
}

export async function transcribe(blob) {
  if (!blob || blob.size === 0) {
    return { text: '' }
  }
  const formData = new FormData()
  formData.append('audio', blob, 'recording.webm')

  const response = await fetch(STT_ENDPOINT, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new Error(errorBody.error || `STT HTTP ${response.status}`)
  }
  const data = await response.json()
  return { text: (data.text || '').trim() }
}
