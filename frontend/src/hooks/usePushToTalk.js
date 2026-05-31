import { useCallback, useEffect, useRef, useState } from 'react'
import { createRecorder, transcribe, isSupported } from '../lib/stt'
import useAcousticAnalysis from './useAcousticAnalysis'

/**
 * 长按说话 hook，集成声学分析（实时安全 + 录音结束特征 summary）
 *
 * 参数：
 *   onTranscript(text)        — STT 返回文本时回调
 *   onSafetySignal(level)     — 声学异常实时回调：'cry' | 'silence' | 'agitated'
 *   onAcousticSummary(features) — 录音结束时声学特征 summary 回调
 */
function usePushToTalk({
  onTranscript,
  onSafetySignal,
  onAcousticSummary,
} = {}) {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState(null)
  const [permissionDenied, setPermissionDenied] = useState(false)

  // 把 MediaStream 暴露给声学分析 hook
  const [analyzingStream, setAnalyzingStream] = useState(null)

  const recorderRef = useRef(null)
  const startTimeRef = useRef(0)
  const supported = isSupported()

  // 把声学分析挂到当前录音流上；录音停止（setAnalyzingStream(null)）触发 cleanup
  useAcousticAnalysis({
    stream: analyzingStream,
    onSafetySignal,
    onSummary: onAcousticSummary,
  })

  useEffect(() => {
    return () => {
      const rec = recorderRef.current
      if (rec && rec.isRecording) {
        rec.stop().catch(() => {})
      }
      setAnalyzingStream(null)
    }
  }, [])

  const startRecording = useCallback(async () => {
    if (!supported) {
      setError('浏览器不支持麦克风录音')
      return
    }
    if (permissionDenied) {
      setError('麦克风权限被拒，请用打字')
      return
    }
    if (isRecording || isTranscribing) return

    setError(null)
    try {
      const rec = createRecorder()
      recorderRef.current = rec
      await rec.start()
      startTimeRef.current = Date.now()
      // 录音启动成功后，把 stream 暴露给声学分析
      setAnalyzingStream(rec.getStream())
      setIsRecording(true)
    } catch (e) {
      if (e && e.name === 'NotAllowedError') {
        setError('麦克风权限被拒，请用打字')
        setPermissionDenied(true)
      } else if (e && e.name === 'NotFoundError') {
        setError('未找到麦克风设备')
      } else {
        setError('录音启动失败: ' + (e?.message || e))
      }
      recorderRef.current = null
      setAnalyzingStream(null)
      setIsRecording(false)
    }
  }, [supported, isRecording, isTranscribing, permissionDenied])

  const stopRecording = useCallback(async () => {
    const rec = recorderRef.current
    if (!rec || !rec.isRecording) return

    const elapsed = Date.now() - startTimeRef.current

    try {
      const blob = await rec.stop()
      setIsRecording(false)
      recorderRef.current = null
      // 触发声学分析 hook 的 cleanup → 得到 summary，通过 onAcousticSummary 回传
      setAnalyzingStream(null)

      if (elapsed < 300) {
        setError('按得太短了，再试一次')
        return
      }
      if (!blob || blob.size < 1000) {
        setError('没录到声音')
        return
      }

      setIsTranscribing(true)
      try {
        const { text } = await transcribe(blob)
        if (!text) {
          setError('心屿没听清，再说一次')
        } else if (typeof onTranscript === 'function') {
          onTranscript(text)
        }
      } catch (e) {
        setError('识别失败: ' + (e?.message || e))
      } finally {
        setIsTranscribing(false)
      }
    } catch (e) {
      setIsRecording(false)
      recorderRef.current = null
      setAnalyzingStream(null)
      setError('停止录音失败')
    }
  }, [onTranscript])

  return {
    isRecording,
    isTranscribing,
    error,
    supported,
    permissionDenied,
    startRecording,
    stopRecording,
  }
}

export default usePushToTalk
