import { useRef, useEffect, useState, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import useLipSync from '../hooks/useLipSync'

const MODEL_URL = '/models/xinyu.glb'

function XinyuModel({ state = 'idle', volume = 0 }) {
  const groupRef = useRef()
  const faceMeshRef = useRef(null)
  const [blinkClose, setBlinkClose] = useState(0)

  const { gl } = useThree()
  const ktx2Loader = useMemo(() => {
    const loader = new KTX2Loader()
    loader.setTranscoderPath('/basis/')
    loader.detectSupport(gl)
    return loader
  }, [gl])

  // 参数 2: Draco（设 false，国内访问 gstatic 慢；facecap.glb 也不用 Draco）
  // 参数 3: MeshOpt（设 true，facecap.glb 用了 meshopt 几何压缩）
  // 参数 4: extendLoader（注入 KTX2Loader 处理 basis 纹理压缩）
  const { scene } = useGLTF(MODEL_URL, false, true, (loader) => {
    loader.setKTX2Loader(ktx2Loader)
  })

  const setLipSyncMesh = useLipSync(state === 'speaking' ? volume : 0)

  // 自适应：根据模型 bounding box 自动居中和缩放，兼容头部/全身两种模型
  const { fitScale, fitOffset } = useMemo(() => {
    if (!scene) return { fitScale: 1, fitOffset: [0, 0, 0] }
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const targetSize = 1.0   // 留余量，避免相机视野截断
    const scale = targetSize / maxDim
    console.log('[XinyuModel] 模型尺寸:', size, '中心:', center, '应用 scale=', scale)
    return {
      fitScale: scale,
      fitOffset: [-center.x * scale, -center.y * scale, -center.z * scale],
    }
  }, [scene])

  useEffect(() => {
    let faceMesh = null
    scene.traverse((obj) => {
      if (obj.morphTargetInfluences && obj.morphTargetDictionary && !faceMesh) {
        faceMesh = obj
      }
    })
    faceMeshRef.current = faceMesh
    if (faceMesh) setLipSyncMesh(faceMesh)
  }, [scene, setLipSyncMesh])

  useEffect(() => {
    let openTimer
    let closeTimer
    const scheduleBlink = () => {
      const wait = 2500 + Math.random() * 2500
      openTimer = setTimeout(() => {
        setBlinkClose(1)
        closeTimer = setTimeout(() => {
          setBlinkClose(0)
          scheduleBlink()
        }, 130)
      }, wait)
    }
    scheduleBlink()
    return () => {
      clearTimeout(openTimer)
      clearTimeout(closeTimer)
    }
  }, [])

  useFrame(() => {
    if (!groupRef.current) return
    const t = performance.now() * 0.001

    groupRef.current.position.y = Math.sin(t * 0.8) * 0.03

    if (state === 'thinking') {
      groupRef.current.rotation.z = Math.sin(t * 0.6) * 0.06
    } else {
      groupRef.current.rotation.z = 0
    }

    const mesh = faceMeshRef.current
    if (!mesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return
    const dict = mesh.morphTargetDictionary
    const inf = mesh.morphTargetInfluences

    const eyeBlinkL = dict.eyeBlinkLeft ?? dict.eyeBlink_L
    const eyeBlinkR = dict.eyeBlinkRight ?? dict.eyeBlink_R
    if (eyeBlinkL !== undefined) inf[eyeBlinkL] = blinkClose
    if (eyeBlinkR !== undefined) inf[eyeBlinkR] = blinkClose

    const mouthSmile = dict.mouthSmile ?? dict.mouthSmileLeft
    if (mouthSmile !== undefined) {
      const target = state === 'listening' ? 0.4 : 0.15
      inf[mouthSmile] += (target - inf[mouthSmile]) * 0.05
    }
  })

  return (
    <group ref={groupRef}>
      <group position={fitOffset} scale={fitScale}>
        <primitive object={scene} />
      </group>
    </group>
  )
}

export default XinyuModel
