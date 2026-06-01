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
      {/* 三点布光：略温暖前光 + 头顶柔光 + 反差补光 */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[1.5, 2.5, 2]} intensity={1.05} color="#FFF0E0" />
      <directionalLight position={[-2, 1.2, 1]} intensity={0.35} color="#E6F2FF" />

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
