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
 * 相机控制器：确保相机在 VRM 头部高度的前方，并明确看向头部。
 * Three.js Canvas 给的相机虽然能设 position，但不会自动 lookAt 模型；
 * 必须用 useEffect 显式调一次 lookAt。
 *
 * VRoid VRM 通常 feet=0、head≈1.4-1.5。
 * 相机距离 0.65 单位（拍胸口以上的肖像感）。
 */
function CameraRig() {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(0, 1.4, 0.65)
    camera.lookAt(0, 1.38, 0)
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
      camera={{ position: [0, 1.4, 0.65], fov: 32, near: 0.05, far: 100 }}
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
