/**
 * XinyuModel — VRM 版心屿模型（任务 1）
 *
 * 替换前：useGLTF + .glb + 基于 morphTargetInfluences 操作
 * 替换后：GLTFLoader + VRMLoaderPlugin + VRM 1.0 ExpressionManager
 *
 * 功能：
 *  - 加载 VRM 1.0 模型（带 viseme aa/ih/ou/ee/oh + blink + emotion presets）
 *  - 自适应 fit（Box3 居中 + 缩放）
 *  - 自动眨眼（idle 状态下随机间隔）
 *  - 空闲微动（轻微浮动）
 *  - thinking 状态下轻微左右摇头
 *  - 口型同步交给 useLipSync hook（接收 volume + 频段拆分）
 *  - Spring Bones（头发/衣物）自动更新
 *  - 情绪表情（happy / sad / surprised）由 expression 字符串触发
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import * as THREE from 'three'

import useLipSync from '../hooks/useLipSync'

const MODEL_URL = '/models/xinyu.vrm'

// 让 drei 的 useGLTF 走 VRM 解析器
useGLTF.preload(MODEL_URL, false, false, (loader) => {
  loader.register((parser) => new VRMLoaderPlugin(parser))
})

function XinyuModel({
  state = 'idle',
  volume = 0,
  lowBand = 0,
  midBand = 0,
  highBand = 0,
  expression = 'neutral',
}) {
  const groupRef = useRef()
  const vrmRef = useRef(null)
  const [blinkClose, setBlinkClose] = useState(0)
  const [emotionLevel, setEmotionLevel] = useState({})

  // 用 useGLTF 注入 VRMLoaderPlugin
  const gltf = useGLTF(MODEL_URL, false, false, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser))
  })
  const vrm = gltf.userData?.vrm

  // 把 VRM 实例丢给口型同步 hook
  const setLipSyncVrm = useLipSync({
    volume: state === 'speaking' ? volume : 0,
    lowBand: state === 'speaking' ? lowBand : 0,
    midBand: state === 'speaking' ? midBand : 0,
    highBand: state === 'speaking' ? highBand : 0,
  })

  // 初次拿到 VRM：优化几何 + 双臂下垂 + 注册 lip sync
  // 朝向通过下面 JSX 的 group rotation 控制，不在这里改 vrm.scene
  useEffect(() => {
    if (!vrm) return
    vrmRef.current = vrm

    // 修复：useGLTF 缓存的 vrm.scene 可能被早期代码改过旋转。
    // 每次进入这个组件强制清零本体变换，朝向只交给下面的 JSX wrapper 控制。
    vrm.scene.rotation.set(0, 0, 0)
    vrm.scene.position.set(0, 0, 0)
    vrm.scene.scale.set(1, 1, 1)

    try {
      VRMUtils.removeUnnecessaryVertices(vrm.scene)
      VRMUtils.removeUnnecessaryJoints(vrm.scene)
    } catch (e) {
      console.warn('[XinyuModel] VRMUtils optimize 失败（可忽略）', e?.message)
    }

    // 任务 1：把 VRM 默认 T-pose 改成自然站姿（双臂自下垂）
    // VRM humanoid 标准骨骼：upperArm 沿 Z 轴旋转可让胳膊从水平 → 下垂
    // 左臂顺时针 / 右臂逆时针约 75°
    try {
      const humanoid = vrm.humanoid
      if (humanoid?.getNormalizedBoneNode) {
        const leftUpper = humanoid.getNormalizedBoneNode('leftUpperArm')
        const rightUpper = humanoid.getNormalizedBoneNode('rightUpperArm')
        const leftLower = humanoid.getNormalizedBoneNode('leftLowerArm')
        const rightLower = humanoid.getNormalizedBoneNode('rightLowerArm')

        // 大臂下垂（核心）：左 -75°、右 +75°
        if (leftUpper) leftUpper.rotation.z = -1.31  // -75°
        if (rightUpper) rightUpper.rotation.z = 1.31  // +75°

        // 小臂略微内收（避免胳膊和身体穿模）
        if (leftLower) leftLower.rotation.z = -0.1
        if (rightLower) rightLower.rotation.z = 0.1
      }
    } catch (e) {
      console.warn('[XinyuModel] 调整手臂姿态失败:', e?.message)
    }

    setLipSyncVrm(vrm)
  }, [vrm, setLipSyncVrm])

  // 通过 humanoid 头骨节点拿到头部 Y 坐标，让相机能精准对准
  // 默认 VRoid 角色：feet=0, head≈1.4-1.5
  const headY = useMemo(() => {
    if (!vrm?.humanoid) return 1.4
    const headBone = vrm.humanoid.getNormalizedBoneNode?.('head')
    if (headBone) {
      const pos = new THREE.Vector3()
      headBone.getWorldPosition(pos)
      return pos.y || 1.4
    }
    return 1.4
  }, [vrm])

  // 眨眼调度：每 2.5-5s 闭眼 130ms
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

  // 情绪表情：根据 expression prop 渐变到目标 expression
  useEffect(() => {
    // 把所有情绪重置为 0，目标的设为 0.7（不全开，保留克制感）
    const next = { happy: 0, sad: 0, angry: 0, surprised: 0, relaxed: 0 }
    if (expression && next.hasOwnProperty(expression)) {
      next[expression] = 0.7
    } else if (expression === 'neutral') {
      next.relaxed = 0.15 // 中性也给一点点放松感
    }
    setEmotionLevel(next)
  }, [expression])

  useFrame((_, delta) => {
    const vrm = vrmRef.current
    if (!vrm) return

    // 必须每帧调 update 让 spring bone 跟着头部动
    vrm.update(delta)

    // 浮动微动（保持在原位 + 微微上下浮 0.02 米）
    if (groupRef.current) {
      const t = performance.now() * 0.001
      groupRef.current.position.y = Math.sin(t * 0.8) * 0.02
      groupRef.current.rotation.z =
        state === 'thinking' ? Math.sin(t * 0.7) * 0.04 : 0
    }

    // 眨眼写回
    const exp = vrm.expressionManager
    if (!exp) return
    try {
      exp.setValue('blink', blinkClose)
    } catch {}

    // 情绪表情（渐变到目标值）
    for (const key of Object.keys(emotionLevel)) {
      try {
        const target = emotionLevel[key]
        const current = exp.getValue(key) ?? 0
        const next = current + (target - current) * 0.06
        exp.setValue(key, next)
      } catch {}
    }

    // 让 VRM 同时把 morph 写到底层 mesh
    try {
      exp.update()
    } catch {}
  })

  if (!vrm) return null

  // 外层 group：浮动微动（由 useFrame 控制 position/rotation.z）
  // 内层 group：朝向修正（VRoid Studio VRM 1.0 实测朝 +Z，旋转 180° 转向相机）
  return (
    <group ref={groupRef}>
      <group rotation={[0, Math.PI, 0]}>
        <primitive object={vrm.scene} />
      </group>
    </group>
  )
}

export default XinyuModel
