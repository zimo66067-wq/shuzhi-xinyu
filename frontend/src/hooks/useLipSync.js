import { useRef, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'

function useLipSync(volume) {
  const meshRef = useRef(null)
  const volumeRef = useRef(0)

  volumeRef.current = volume ?? 0

  const setMesh = useCallback((mesh) => {
    meshRef.current = mesh
  }, [])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return

    const dict = mesh.morphTargetDictionary
    const inf = mesh.morphTargetInfluences
    const v = volumeRef.current

    const mouthOpenIdx =
      dict.mouthOpen ??
      dict.jawOpen ??
      dict.viseme_aa ??
      dict.A ??
      dict.mouthA

    if (mouthOpenIdx !== undefined) {
      const target = v * 0.6
      const current = inf[mouthOpenIdx]
      inf[mouthOpenIdx] = current + (target - current) * 0.4
    }
  })

  return setMesh
}

export default useLipSync
