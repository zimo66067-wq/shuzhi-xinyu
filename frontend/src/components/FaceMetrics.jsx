/**
 * FaceMetrics — MediaPipe 家长视图组件
 *
 * 设计目标：
 *  - 仅在 visible=true 时启动摄像头 + MediaPipe；visible=false 立即释放资源
 *  - 4 指标实时显示：微笑度 / 皱眉度 / 张嘴度 / 正脸朝向（百分比 0-100）
 *  - 仅家长视图可见，孩子视图（visible=false）零干扰
 *  - 资源全部本地托管：/mediapipe/wasm + /mediapipe/face_landmarker.task
 *  - 无任何外网请求
 *
 * Props:
 *  - visible: boolean — 控制启停的总开关
 *
 * 异常处理：
 *  - 摄像头权限拒 → 面板显示"未授权摄像头"，不崩
 *  - 无人脸 → 4 指标显示 "--"
 *  - 模型加载失败 → 面板显示"模型加载失败"
 */

import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision'

const WASM_PATH = '/mediapipe/wasm'
const MODEL_PATH = '/mediapipe/face_landmarker.task'

// 正脸阈值：|yaw|<15° 且 |pitch|<15° 视为正脸
const FRONTAL_YAW_DEG = 15
const FRONTAL_PITCH_DEG = 15

/**
 * 从 ARKit 52 blendshape 列表里按名字取值（0-1）
 * categories: [{ categoryName, score }, ...]
 */
function pickBlend(categories, name) {
  if (!categories) return 0
  const it = categories.find((c) => c.categoryName === name)
  return it ? it.score : 0
}

/**
 * 从列主序 4×4 矩阵抽 yaw / pitch（角度，单位度）
 * data 是长度 16 的 Float32Array / number[]
 *
 * Three.js / MediaPipe 的列主序约定：
 *   [m00 m10 m20 m30 m01 m11 m21 m31 m02 m12 m22 m32 m03 m13 m23 m33]
 * 旋转矩阵的 yaw/pitch（绕 Y / X）：
 *   yaw   = atan2(m02, m22)   // 头部左右转
 *   pitch = asin(-m12)        // 头部上下抬
 *
 * 抽取失败时返回 null。
 */
function extractYawPitch(matrixData) {
  try {
    if (!matrixData || matrixData.length < 16) return null
    // 列主序索引：m_ij = data[j*4 + i]
    const m02 = matrixData[2 * 4 + 0] // col=2, row=0
    const m22 = matrixData[2 * 4 + 2] // col=2, row=2
    const m12 = matrixData[2 * 4 + 1] // col=2, row=1
    const yaw = (Math.atan2(m02, m22) * 180) / Math.PI
    const pitch = (Math.asin(Math.max(-1, Math.min(1, -m12))) * 180) / Math.PI
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return null
    return { yaw, pitch }
  } catch {
    return null
  }
}

/**
 * 降级方案：用鼻尖 landmark 的 x 偏移判正脸
 * MediaPipe FaceLandmarker 返回 478 个点，鼻尖近似为 index 1
 * 偏移比例 < 0.08（约 8% 画面宽度）视为正脸
 */
function frontalFromNose(landmarks) {
  if (!landmarks || landmarks.length < 2) return null
  const nose = landmarks[1]
  if (!nose || typeof nose.x !== 'number') return null
  const deviation = Math.abs(nose.x - 0.5) // x 归一化到 [0,1]
  return deviation < 0.08
}

const SILENT_METRICS = {
  smile: null,
  frown: null,
  jaw: null,
  frontal: null, // true / false / null（未检测到）
}

const pct = (v) => (v == null ? '--' : `${Math.round(v * 100)}`)

function FaceMetrics({ visible }) {
  const videoRef = useRef(null)
  const landmarkerRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const lastVideoTimeRef = useRef(-1)

  const [metrics, setMetrics] = useState(SILENT_METRICS)
  const [error, setError] = useState('') // '' | 'permission' | 'model' | 'camera'
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!visible) {
      // 关闭：清理一切
      cleanup()
      setMetrics(SILENT_METRICS)
      setError('')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    const start = async () => {
      // 1) 加载 MediaPipe 模型
      let landmarker
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
        landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: MODEL_PATH,
            delegate: 'GPU', // 失败时 MediaPipe 自动 fallback CPU
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        })
        if (cancelled) {
          landmarker.close()
          return
        }
        landmarkerRef.current = landmarker
      } catch (e) {
        if (cancelled) return
        console.error('[FaceMetrics] 模型加载失败:', e)
        setError('model')
        setLoading(false)
        return
      }

      // 2) 申请摄像头
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
      } catch (e) {
        if (cancelled) return
        console.error('[FaceMetrics] 摄像头授权失败:', e)
        if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
          setError('permission')
        } else {
          setError('camera')
        }
        setLoading(false)
        // landmarker 已开就关掉
        if (landmarkerRef.current) {
          try { landmarkerRef.current.close() } catch {}
          landmarkerRef.current = null
        }
        return
      }

      // 3) 接到隐藏 video
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await new Promise((resolve) => {
        if (video.readyState >= 2) resolve()
        else video.onloadeddata = () => resolve()
      })
      try {
        await video.play()
      } catch (e) {
        console.error('[FaceMetrics] video.play 失败:', e)
      }
      if (cancelled) return

      setLoading(false)

      // 4) rAF 循环
      const tick = () => {
        if (cancelled) return
        const lm = landmarkerRef.current
        const v = videoRef.current
        if (!lm || !v || v.readyState < 2) {
          rafRef.current = requestAnimationFrame(tick)
          return
        }
        // 跳过同一帧避免 MediaPipe 内部报错
        const t = v.currentTime
        if (t === lastVideoTimeRef.current) {
          rafRef.current = requestAnimationFrame(tick)
          return
        }
        lastVideoTimeRef.current = t

        try {
          const result = lm.detectForVideo(v, performance.now())
          const blendshapes = result.faceBlendshapes?.[0]?.categories
          const matrix = result.facialTransformationMatrixes?.[0]?.data
          const landmarks = result.faceLandmarks?.[0]

          if (!blendshapes || blendshapes.length === 0) {
            // 没人脸
            setMetrics(SILENT_METRICS)
          } else {
            const smile =
              (pickBlend(blendshapes, 'mouthSmileLeft') +
                pickBlend(blendshapes, 'mouthSmileRight')) /
              2
            const frown =
              (pickBlend(blendshapes, 'browDownLeft') +
                pickBlend(blendshapes, 'browDownRight')) /
              2
            const jaw = pickBlend(blendshapes, 'jawOpen')

            // 正脸：优先用矩阵 yaw/pitch；不行降级鼻尖位置
            let frontal = null
            const yp = extractYawPitch(matrix)
            if (yp) {
              frontal =
                Math.abs(yp.yaw) < FRONTAL_YAW_DEG &&
                Math.abs(yp.pitch) < FRONTAL_PITCH_DEG
            } else {
              const noseFront = frontalFromNose(landmarks)
              if (noseFront != null) frontal = noseFront
            }

            setMetrics({ smile, frown, jaw, frontal })
          }
        } catch (e) {
          console.error('[FaceMetrics] detectForVideo 失败:', e)
          // 不中断循环，等下一帧
        }

        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    start()

    return () => {
      cancelled = true
      cleanup()
    }
    // visible 变化时跑一次完整 effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  function cleanup() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try { t.stop() } catch {}
      })
      streamRef.current = null
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause()
        videoRef.current.srcObject = null
      } catch {}
    }
    if (landmarkerRef.current) {
      try { landmarkerRef.current.close() } catch {}
      landmarkerRef.current = null
    }
    lastVideoTimeRef.current = -1
  }

  if (!visible) return null

  // 状态文案
  let statusText = null
  if (error === 'permission') statusText = '未授权摄像头'
  else if (error === 'camera') statusText = '摄像头不可用'
  else if (error === 'model') statusText = '模型加载失败'
  else if (loading) statusText = '正在准备...'

  const frontalLabel =
    metrics.frontal == null ? '--' : metrics.frontal ? '正脸 ✓' : '偏移'

  return (
    <>
      {/* 隐藏的 video，仅作 MediaPipe 输入源 */}
      <video
        ref={videoRef}
        playsInline
        muted
        style={{
          position: 'fixed',
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
          left: 0,
          top: 0,
        }}
        aria-hidden="true"
      />

      {/* 家长悬浮卡片 — 右下角，不挤压布局 */}
      <div
        style={{
          position: 'fixed',
          right: '16px',
          bottom: '88px',
          width: '180px',
          background: '#F7FAFC',
          color: '#7B6D5C',
          borderRadius: '12px',
          padding: '12px 14px',
          boxShadow: '0 6px 20px rgba(123, 109, 92, 0.18)',
          fontSize: '13px',
          lineHeight: 1.6,
          zIndex: 50,
          pointerEvents: 'none', // 不挡操作
        }}
        role="region"
        aria-label="家长视图：面部指标"
      >
        <div
          style={{
            fontWeight: 600,
            marginBottom: '6px',
            fontSize: '12px',
            color: '#A89B8A',
            letterSpacing: '0.5px',
          }}
        >
          👨‍👩‍👧 家长视图
        </div>

        {statusText ? (
          <div style={{ color: '#A89B8A', fontSize: '12px', padding: '4px 0' }}>
            {statusText}
          </div>
        ) : (
          <>
            <Row label="微笑度" value={pct(metrics.smile)} />
            <Row label="皱眉度" value={pct(metrics.frown)} />
            <Row label="张嘴度" value={pct(metrics.jaw)} />
            <Row label="正脸朝向" value={frontalLabel} />
          </>
        )}
      </div>
    </>
  )
}

function Row({ label, value }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '2px 0',
      }}
    >
      <span style={{ color: '#A89B8A' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
        {value}
      </span>
    </div>
  )
}

export default FaceMetrics
