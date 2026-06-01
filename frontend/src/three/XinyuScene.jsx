import { Suspense, Component } from 'react'
import { Canvas } from '@react-three/fiber'
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
      camera={{ position: [0, 1.5, 0.9], fov: 28 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
      frameloop="always"
      style={{ width: '100%', height: '100%', borderRadius: '50%' }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 2, 3]} intensity={0.9} />
      <directionalLight position={[-2, 1, 1]} intensity={0.35} />

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
