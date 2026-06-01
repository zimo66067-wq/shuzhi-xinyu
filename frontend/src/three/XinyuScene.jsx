import { Suspense, Component, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import XinyuModel from './XinyuModel'

function XinyuFallback() {
  return (
    <mesh>
      <sphereGeometry args={[0.7, 48, 48]} />
      <meshStandardMaterial
        color="#FFE0CC"
        emissive="#FFD4D4"
        emissiveIntensity={0.25}
        roughness={0.6}
      />
    </mesh>
  )
}

class ModelErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error) {
    console.warn('[XinyuScene] 模型加载失败，使用占位光晕:', error?.message || error)
  }
  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

/**
 * 相机控制器：把相机摆在 VRM 头部前方 1.3 米，看向略低于头顶的位置，
 * 框住"头 + 肩 + 一点点胸"的肖像感。
 *
 * VRoid VRM 默认 feet=0、head≈1.4-1.5；相机 Y=1.35 接近眼睛高度，
 * 距离 1.3 配合 FOV 28°，画面里头+肩比例舒服。
 */
function CameraRig() {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(0, 1.35, 1.3)
    camera.lookAt(0, 1.32, 0)
    camera.updateProjectionMatrix()
  }, [camera])
  return null
}

function XinyuScene({
  state = 'idle',
  volume = 0,
  lowBand = 0,
  midBand = 0,
  highBand = 0,
  expression = 'neutral',
}) {
  return (
    <Canvas
      camera={{ position: [0, 1.35, 1.3], fov: 28, near: 0.05, far: 100 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
      frameloop="always"
      style={{ width: '100%', height: '100%', borderRadius: '50%' }}
    >
      <CameraRig />
      {/* 加强面部布光：环境光提亮 + 正前方主光 + 侧补光 + 头顶辅助 */}
      <ambientLight intensity={0.85} />
      {/* 主光：相机正前方略偏右上，温暖色温，专打脸部 */}
      <directionalLight position={[0.5, 1.8, 2.5]} intensity={1.4} color="#FFF6E8" />
      {/* 侧补光：左侧柔和冷色，让脸部立体 */}
      <directionalLight position={[-1.8, 1.4, 1.5]} intensity={0.6} color="#E6F2FF" />
      {/* 顶光：头发轮廓 */}
      <directionalLight position={[0, 3, 0.5]} intensity={0.4} color="#FFFFFF" />
      {/* 正面贴脸补光：消除"额头下半张脸偏暗"的卡通脸通病 */}
      <pointLight position={[0, 1.45, 1.0]} intensity={0.4} color="#FFFAF0" distance={3} />

      <ModelErrorBoundary fallback={<XinyuFallback />}>
        <Suspense fallback={<XinyuFallback />}>
          <XinyuModel
            state={state}
            volume={volume}
            lowBand={lowBand}
            midBand={midBand}
            highBand={highBand}
            expression={expression}
          />
        </Suspense>
      </ModelErrorBoundary>
    </Canvas>
  )
}

export default XinyuScene
