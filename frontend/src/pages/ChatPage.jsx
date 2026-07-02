import { useState, useEffect, useRef, useContext, useMemo } from 'react'
import XinyuScene from '../three/XinyuScene'
import { speak, cancel as cancelTTS } from '../lib/tts'
import usePushToTalk from '../hooks/usePushToTalk'
import { ChatContext } from '../App'
import { stageFromRoundCount } from '../components/TrainingStepper'
import ScenarioBanner from '../components/ScenarioBanner'
import FaceMetrics from '../components/FaceMetrics'
import PasswordGate from '../components/PasswordGate'
import { getToken } from '../lib/parentAuth'
import { API_BASE } from '../lib/api'
import { getSessionConfig } from '../lib/session'

// 任务 1：根据心屿回复内容推断情绪表情（驱动 VRM expression）
// 极简关键词匹配；命中多个时按优先级 happy > sad > surprised > relaxed
const EMOTION_KEYWORDS = {
  happy: ['开心', '高兴', '太棒', '真好', '喜欢', '哈哈', '好玩', '有趣'],
  sad: ['难过', '伤心', '哭', '不开心', '失望', '心疼'],
  surprised: ['哇', '哦', '真的吗', '不可思议', '惊讶'],
  relaxed: ['没关系', '慢慢来', '不着急', '休息一下', '深呼吸'],
}
function detectEmotionFromReply(text) {
  if (!text) return 'neutral'
  for (const [emo, kws] of Object.entries(EMOTION_KEYWORDS)) {
    for (const k of kws) {
      if (text.includes(k)) return emo
    }
  }
  return 'neutral'
}

// 情绪安全升级：心屿回复中出现这些词代表正在安抚孩子
const COMFORT_KEYWORDS = [
  '没关系',
  '不着急',
  '慢慢来',
  '休息一下',
  '深呼吸',
  '心屿在这里',
  '不用害怕',
  '安全的',
]

// 任务 3：表情按年龄分档
//   低龄 (3-5)：仅 3 个最基础情绪，减少认知负担
//   中龄 (6-9)：5 个常用情绪（默认）
//   高龄 (10+)：5 个常用 + 扩展集（点 ＋ 展开）
const EMOJIS_LOW = [
  { icon: '😊', label: '开心', text: '我很开心' },
  { icon: '😢', label: '难过', text: '我有点难过' },
  { icon: '😴', label: '累', text: '我累了' },
]

const EMOJIS_MID = [
  { icon: '😊', label: '开心', text: '我很开心' },
  { icon: '😢', label: '难过', text: '我有点难过' },
  { icon: '😴', label: '累', text: '我累了' },
  { icon: '😐', label: '一般', text: '感觉一般' },
  { icon: '😡', label: '不开心', text: '我不开心' },
]

const EMOJIS_HIGH_EXTRA = [
  { icon: '😨', label: '紧张', text: '我有点紧张' },
  { icon: '😕', label: '困惑', text: '我有点困惑' },
  { icon: '😌', label: '放松', text: '我感觉放松' },
  { icon: '🤔', label: '在想', text: '我在想事情' },
  { icon: '🥰', label: '被关心', text: '我感到被关心' },
]

// 把年龄字符串/数字归一化到三档
function getAgeBand(age) {
  if (age == null) return 'mid'
  // '10+' 字符串或纯数字
  if (typeof age === 'string') {
    if (age.includes('+')) return 'high'
    const n = parseInt(age, 10)
    if (Number.isNaN(n)) return 'mid'
    age = n
  }
  if (age <= 5) return 'low'
  if (age <= 9) return 'mid'
  return 'high'
}

// 年龄缩放系数（也是 CSS --age-font-scale）
function getFontScale(band) {
  if (band === 'low') return 1.12   // ≈ +2px
  if (band === 'high') return 0.94  // ≈ -1px
  return 1.0
}

function ChatPage({ navigate }) {
  const {
    childInfo,
    messages,
    setMessages,
    clearHistory,
    pushAcousticFeatures,
    currentStage,
    setCurrentStage,
    scenario,
    setScenario,
    currentScene,
    setCurrentScene,
    isOnline,
    settings,
  } = useContext(ChatContext)

  // 整改 A-6：界面动画总开关（家长设置）∪ 系统"减少动态效果"偏好 → 关闭模型浮动/摇头
  const reduceMotion = useMemo(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    return !settings.animations || prefersReduced
  }, [settings.animations])

  const [inputText, setInputText] = useState('')
  const [xinyuState, setXinyuState] = useState('idle')
  // 整改 A-3：是否已点"叫大人"，用于把安抚横幅切换成"等大人来"文案
  const [calledAdult, setCalledAdult] = useState(false)

  // 家长视图开关：默认关闭，孩子视图看不到任何数值
  const [showParentView, setShowParentView] = useState(false)
  // 家长视图密码门：开启前必须通过家长密码（与家长后台评分同一把锁），
  // 防止孩子自己点开看到 MediaPipe 面部指标等分析数据
  const [showParentGate, setShowParentGate] = useState(false)

  // 任务 5（Q5）：准社会依恋护栏 —— 进入 ChatPage 15 分钟后柔和提示去找朋友
  // 每次进入页面重新计时；提示出现一次后这次会话不再弹
  const [showAttachmentNudge, setShowAttachmentNudge] = useState(false)
  // 任务 1：声学状态扩展为 4 路（volume + 3 频段），驱动 VRM 5 个 viseme
  const [audioState, setAudioState] = useState({
    volume: 0, lowBand: 0, midBand: 0, highBand: 0,
  })
  const [xinyuExpression, setXinyuExpression] = useState('neutral')
  const [thinkingDots, setThinkingDots] = useState('')

  // 任务 3 + F1：年龄分档（low/mid/high）
  // 治疗师流：优先读 sessionConfig.ageBand；否则从 childInfo.age 推断
  const ageBand = useMemo(
    () => getSessionConfig()?.ageBand || getAgeBand(childInfo?.age),
    [childInfo?.age],
  )
  // 10+ 岁的扩展表情面板开关
  const [emojiExpanded, setEmojiExpanded] = useState(false)

  // F1：首次挂载时，若 sessionConfig 含场景且本次 session 尚未应用，则自动切入
  useEffect(() => {
    const cfg = getSessionConfig()
    if (!cfg) return
    if (sessionStorage.getItem('xy_session_applied')) return
    sessionStorage.setItem('xy_session_applied', '1')
    if (cfg.scene === 'supermarket') {
      setScenario('supermarket')
      setCurrentScene('enter')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 任务 3：根据 ageBand 设置全局 CSS 变量，离开页面时还原
  useEffect(() => {
    const scale = getFontScale(ageBand)
    document.documentElement.style.setProperty('--age-font-scale', String(scale))
    return () => {
      document.documentElement.style.setProperty('--age-font-scale', '1')
    }
  }, [ageBand])

  // 任务 3：按年龄选表情集
  const emojiList = useMemo(() => {
    if (ageBand === 'low') return EMOJIS_LOW
    if (ageBand === 'high') {
      return emojiExpanded ? [...EMOJIS_MID, ...EMOJIS_HIGH_EXTRA] : EMOJIS_MID
    }
    return EMOJIS_MID
  }, [ageBand, emojiExpanded])

  // TTS 字幕浮层
  const [ttsSubtitle, setTtsSubtitle] = useState('')

  // 历史抽屉
  const [historyOpen, setHistoryOpen] = useState(false)

  // 情绪安抚提示条
  const [comfortHits, setComfortHits] = useState(0)
  const [showComfort, setShowComfort] = useState(false)

  const historyEndRef = useRef(null)
  const chatPanelRef = useRef(null)   // 桌面端右列消息面板容器
  const isThinking = xinyuState === 'thinking'

  // 声学异常实时回调（cry / silence / agitated）
  const handleSafetySignal = (level) => {
    console.debug('[Acoustic] 安全信号:', level)
    if (level === 'cry' || level === 'agitated') {
      // 高紧急度：直接出安抚提示（横幅内含"叫大人"按钮，整改 A-3）
      setShowComfort(true)
    } else if (level === 'silence') {
      // 沉默：在字幕区温和提示，不打断
      setTtsSubtitle('心屿在这里，慢慢来')
      setTimeout(() => setTtsSubtitle((s) => (s === '心屿在这里，慢慢来' ? '' : s)), 3000)
    }
  }

  // 整改 A-3：危机指向真实成人。播一段温和提示音 + 把横幅切到"等大人来"。
  // 提示音用 WebAudio 现场合成，不引入任何音频资源/依赖。
  const callAdult = () => {
    setCalledAdult(true)
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (AudioCtx) {
        const ctx = new AudioCtx()
        const beep = (freq, start, dur) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.value = freq
          gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
          gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.04)
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start(ctx.currentTime + start)
          osc.stop(ctx.currentTime + start + dur)
        }
        // 两声柔和提示音，引起在场大人注意
        beep(660, 0, 0.5)
        beep(880, 0.55, 0.6)
        setTimeout(() => ctx.close().catch(() => {}), 1500)
      }
    } catch (e) {
      console.debug('[ChatPage] 提示音播放失败:', e)
    }
  }

  // STT + 声学（声学监测可在家长设置关闭，整改 A-6）
  const {
    isRecording,
    isTranscribing,
    error: sttError,
    supported: sttSupported,
    permissionDenied: micDenied,
    startRecording,
    stopRecording,
  } = usePushToTalk({
    onTranscript: (text) => sendMessage(text),
    onSafetySignal: settings.acoustic ? handleSafetySignal : undefined,
    onAcousticSummary: settings.acoustic
      ? (features) => pushAcousticFeatures(features)
      : undefined,
    minRecordMs: settings.minRecordMs, // P-5：最短录音时长可调
  })

  const micUnavailable = !sttSupported || micDenied

  // P-5：录音方式——'tap' 点按切换（点一下开始/再点停止）；否则沿用长按。文字输入路径不变。
  const tapMode = settings.recordMode === 'tap'
  const micHandlers = tapMode
    ? {
        onClick: () => {
          if (micUnavailable || isTranscribing || !isOnline) return
          if (isRecording) stopRecording()
          else startRecording()
        },
      }
    : {
        onPointerDown: (e) => {
          e.preventDefault()
          if (!micUnavailable && isOnline) startRecording()
        },
        onPointerUp: () => {
          if (isRecording) stopRecording()
        },
        onPointerLeave: () => {
          if (isRecording) stopRecording()
        },
        onPointerCancel: () => {
          if (isRecording) stopRecording()
        },
      }

  // 录音/识别状态联动
  useEffect(() => {
    if (isRecording) setXinyuState('listening')
    else if (isTranscribing) setXinyuState('thinking')
  }, [isRecording, isTranscribing])

  // STT 错误显示在 TTS 字幕区
  useEffect(() => {
    if (sttError) {
      setTtsSubtitle(sttError)
      setXinyuState('idle')
      const t = setTimeout(() => setTtsSubtitle(''), 4000)
      return () => clearTimeout(t)
    }
  }, [sttError])

  // 思考点动画
  useEffect(() => {
    if (xinyuState !== 'thinking') {
      setThinkingDots('')
      return
    }
    let count = 0
    const id = setInterval(() => {
      count = (count + 1) % 4
      setThinkingDots('.'.repeat(count))
    }, 450)
    return () => clearInterval(id)
  }, [xinyuState])

  // 抽屉打开时自动滚动到最新消息
  useEffect(() => {
    if (historyOpen) {
      setTimeout(() => {
        historyEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      }, 320)
    }
  }, [historyOpen, messages])

  // 桌面端消息面板：新消息到达时自动滚到底部
  useEffect(() => {
    if (chatPanelRef.current) {
      chatPanelRef.current.scrollTop = chatPanelRef.current.scrollHeight
    }
  }, [messages])

  // 离开页面取消 TTS
  useEffect(() => () => cancelTTS(), [])

  // 任务 5 + P-6：会话满 N 分钟弹出依恋护栏提示（一次即止）；N 由家长设置 sessionLimitMin 决定
  useEffect(() => {
    const minutes = settings.sessionLimitMin || 15
    const t = setTimeout(() => setShowAttachmentNudge(true), minutes * 60 * 1000)
    return () => clearTimeout(t)
  }, [settings.sessionLimitMin])

  const sendMessage = async (text) => {
    if (!text.trim() || !isOnline) return

    cancelTTS()
    setTtsSubtitle('')
    setAudioState({ volume: 0, lowBand: 0, midBand: 0, highBand: 0 })
    setXinyuState('thinking')
    setInputText('')

    const userMsg = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)

    // 给后端的 messages 始终在最前注入孩子信息 system message
    const systemMsg = childInfo
      ? {
          role: 'system',
          content: `这个孩子叫${childInfo.name}，${childInfo.age}岁。请用这个名字称呼ta。`,
        }
      : null
    const messagesToSend = systemMsg
      ? [systemMsg, ...newMessages]
      : newMessages

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesToSend,
          // 任务 7：场景模式时把 scenario 标识发给后端
          ...(scenario ? { scenario } : {}),
        }),
      })
      if (!response.ok) throw new Error('Network error')
      const data = await response.json()
      const reply = data.reply || '心屿暂时说不出话来'

      // 训练阶段（自由聊天模式）/ 子场景（场景模式）二选一
      if (scenario) {
        if (data.scene) {
          setCurrentScene(data.scene)
          // 场景到 'end' 时自动退出场景模式
          if (data.scene === 'end') {
            setTimeout(() => {
              setScenario(null)
              setCurrentScene(null)
            }, 3500)
          }
        }
      } else {
        const nextStage =
          data.stage ||
          stageFromRoundCount(newMessages.filter((m) => m.role !== 'system').length + 1)
        setCurrentStage(nextStage)
      }

      // 情绪安全升级：检测连续安抚关键词命中
      const hit = COMFORT_KEYWORDS.some((kw) => reply.includes(kw))
      if (hit) {
        setComfortHits((prev) => {
          const next = prev + 1
          if (next >= 2) setShowComfort(true)
          return next
        })
      } else {
        setComfortHits(0)
      }

      // 任务 1：情绪表情联动 —— 根据回复关键词触发 VRM expression
      setXinyuExpression(detectEmotionFromReply(reply))

      setMessages([...newMessages, { role: 'assistant', content: reply }])
      setTtsSubtitle(reply)

      // 整改 A-6：自动朗读开关关闭时，只显示字幕、不播 TTS
      if (!settings.autoTTS) {
        setXinyuState('idle')
        setTimeout(() => setXinyuExpression('neutral'), 600)
        return
      }

      setXinyuState('speaking')
      await speak(reply, {
        // P-6：语速/音调/音量走家长设置
        rate: settings.ttsRate,
        pitch: settings.ttsPitch,
        volume: settings.ttsVolume,
        // 任务 1：onVolume 现在收到 {volume, lowBand, midBand, highBand}
        onVolume: (s) => {
          if (typeof s === 'number') {
            setAudioState({ volume: s, lowBand: 0.6, midBand: 0.3, highBand: 0.1 })
          } else {
            setAudioState(s)
          }
        },
        onEnd: () => {
          setAudioState({ volume: 0, lowBand: 0, midBand: 0, highBand: 0 })
          setXinyuState('idle')
          setTtsSubtitle('')
          // 说完话淡回 neutral
          setTimeout(() => setXinyuExpression('neutral'), 600)
        },
      })
    } catch (err) {
      console.debug('[ChatPage] 调用后端失败:', err)
      setMessages([...newMessages, { role: 'assistant', content: '心屿暂时说不出话' }])
      setTtsSubtitle('心屿暂时说不出话')
      setAudioState({ volume: 0, lowBand: 0, midBand: 0, highBand: 0 })
      setXinyuState('idle')
    }
  }

  const sendByInput = () => {
    if (!inputText.trim()) return
    sendMessage(inputText)
  }

  // 口型测试：绕开 DeepSeek，直接让心屿朗读一段固定文本，方便验证口型同步
  const testLipSync = async () => {
    cancelTTS()
    const sample =
      '你好呀，今天天气真好。我们一起聊聊好玩的事情，比如你最近看过什么有趣的故事。'
    setTtsSubtitle(sample)
    setXinyuState('speaking')
    setXinyuExpression('happy')
    await speak(sample, {
      // P-6：语速/音调/音量走家长设置
      rate: settings.ttsRate,
      pitch: settings.ttsPitch,
      volume: settings.ttsVolume,
      onVolume: (s) => {
        if (typeof s === 'number') {
          setAudioState({ volume: s, lowBand: 0.6, midBand: 0.3, highBand: 0.1 })
        } else {
          setAudioState(s)
        }
      },
      onEnd: () => {
        setAudioState({ volume: 0, lowBand: 0, midBand: 0, highBand: 0 })
        setXinyuState('idle')
        setTtsSubtitle('')
        setTimeout(() => setXinyuExpression('neutral'), 600)
      },
    })
  }

  // 历史记录里过滤掉 system 消息（system 是发给后端用的，不展示给孩子）
  const visibleMessages = messages.filter((m) => m.role !== 'system')

  // 切换家长视图：关闭随时可；开启必须已通过家长密码（无有效 token 就弹密码门）
  const toggleParentView = () => {
    if (showParentView) {
      setShowParentView(false)
      return
    }
    if (getToken()) {
      setShowParentView(true)
    } else {
      setShowParentGate(true)
    }
  }

  return (
    <div className="page-container bg-training">
      {/* 顶栏：返回 + 历史 心屿 暂停 */}
      <div className="top-bar-new">
        <div
          className="top-back"
          style={{ display: 'flex', gap: '8px' }}
        >
          <button
            className="btn-icon"
            onClick={() => navigate('startup')}
            aria-label="返回首页"
          >
            ←
          </button>
          <button
            className="btn-icon"
            onClick={() => setHistoryOpen(true)}
            aria-label="对话历史"
            style={{
              position: 'relative',
            }}
          >
            📜
            {visibleMessages.length > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  background: 'var(--accent)',
                  color: '#7B4A4A',
                  fontSize: '10px',
                  padding: '1px 5px',
                  borderRadius: '8px',
                  minWidth: '16px',
                  textAlign: 'center',
                  fontWeight: 600,
                }}
              >
                {visibleMessages.length}
              </span>
            )}
          </button>
        </div>
        <div className="top-title">心屿</div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {/* 口型测试按钮：朗读一段固定文本，不依赖 DeepSeek */}
          <button
            className="btn-icon"
            onClick={testLipSync}
            disabled={xinyuState === 'speaking' || xinyuState === 'thinking'}
            title="测试口型同步（不依赖 DeepSeek）"
            aria-label="测试口型"
            style={{ fontSize: '14px', minWidth: 'auto', padding: '6px 10px' }}
          >
            🎙
          </button>
          {/* 家长视图开关：默认关；开启后右下角悬浮卡显示面部 4 指标 */}
          <button
            className="btn-icon"
            onClick={toggleParentView}
            title={showParentView ? '关闭家长视图' : '开启家长视图（需家长密码）'}
            aria-label="家长视图开关"
            aria-pressed={showParentView}
            style={{
              fontSize: '12px',
              minWidth: 'auto',
              padding: '6px 10px',
              background: showParentView ? '#A8D8B9' : undefined,
              color: showParentView ? '#3F6B4F' : undefined,
            }}
          >
            {showParentView ? '👨‍👩‍👧 关' : '👨‍👩‍👧'}
          </button>
          <button
            className="btn-icon btn-pause top-pause"
            onClick={() => navigate('pause')}
            aria-label="暂停"
          >
            ⏸ 暂停
          </button>
        </div>
      </div>

      {/* 主体：移动端竖排，桌面端左右两列 */}
      <div className="chat-body">

        {/* 左列 / 移动端主区：3D 角色 + 场景横幅 + 安抚横幅 */}
        <div className="chat-col-avatar">
          {scenario && (
            <ScenarioBanner
              scenario={scenario}
              currentScene={currentScene}
              onExit={() => {
                setScenario(null)
                setCurrentScene(null)
              }}
            />
          )}

          {showComfort && (
            <div className="comfort-banner" role="dialog" aria-label="温和提示">
              {calledAdult ? (
                <>
                  <div className="comfort-banner-text">
                    我们一起等大人来，好吗？🌿
                  </div>
                  <div className="comfort-banner-actions">
                    <button
                      className="primary"
                      onClick={() => {
                        setShowComfort(false)
                        setComfortHits(0)
                        setCalledAdult(false)
                      }}
                    >
                      好
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="comfort-banner-text">
                    心屿发现你可能需要休息一下。如果不舒服，按下面的按钮叫大人来。🌿
                  </div>
                  <button
                    className="btn-call-adult"
                    onClick={callAdult}
                    aria-label="按这里叫大人来"
                  >
                    🔔 按这里叫大人来
                  </button>
                  <div className="comfort-banner-actions">
                    <button
                      onClick={() => {
                        setShowComfort(false)
                        setComfortHits(0)
                      }}
                    >
                      继续聊天
                    </button>
                    <button
                      className="primary"
                      onClick={() => {
                        setShowComfort(false)
                        setComfortHits(0)
                        navigate('toolbox')
                      }}
                    >
                      去看看
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="avatar-zone" style={{ flex: 1, height: 'auto' }}>
            <div className={`avatar-halo ${isThinking ? 'thinking' : ''}`}>
              <XinyuScene
                state={xinyuState}
                volume={audioState.volume}
                lowBand={audioState.lowBand}
                midBand={audioState.midBand}
                highBand={audioState.highBand}
                expression={xinyuExpression}
                reduceMotion={reduceMotion}
              />
            </div>
            {import.meta.env.DEV && xinyuState === 'speaking' && (
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '12px',
                  background: 'rgba(0,0,0,0.55)',
                  color: '#fff',
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  lineHeight: 1.4,
                  pointerEvents: 'none',
                }}
              >
                <div>vol&nbsp;{audioState.volume.toFixed(2)}</div>
                <div>lo&nbsp;&nbsp;{audioState.lowBand.toFixed(2)}</div>
                <div>mid&nbsp;{audioState.midBand.toFixed(2)}</div>
                <div>hi&nbsp;&nbsp;{audioState.highBand.toFixed(2)}</div>
              </div>
            )}
            <div
              className="subtitle-overlay"
              style={{ opacity: ttsSubtitle || isThinking ? 1 : 0 }}
            >
              {isThinking ? `心屿在想${thinkingDots}` : ttsSubtitle}
            </div>
          </div>
        </div>

        {/* 右列（桌面端）/ 底部（移动端）：消息流 + 输入栏 */}
        <div className="chat-col-panel">

          {/* 桌面端持久消息列表（移动端 display:none，移动端走 drawer） */}
          <div className="chat-msg-panel" ref={chatPanelRef}>
            {visibleMessages.length === 0 ? (
              <div className="chat-msg-empty">和心屿聊点什么吧 🌸</div>
            ) : (
              visibleMessages.map((m, i) => (
                <div
                  key={i}
                  className={`msg-row ${m.role === 'user' ? 'user' : 'xinyu'}`}
                >
                  <div
                    className={`msg-bubble ${m.role === 'user' ? 'user' : 'xinyu'}`}
                  >
                    {m.content}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 输入栏（移动端和桌面端均显示） */}
          <div className="bottom-bar-new">
            <div className="emoji-compact">
              {emojiList.map((item, idx) => (
                <span
                  key={`${item.label}-${idx}`}
                  className="emoji-mini"
                  onClick={() => isOnline && sendMessage(item.text)}
                  role="button"
                  aria-label={`表达：${item.label}`}
                >
                  {item.icon}
                </span>
              ))}
              {ageBand === 'high' && (
                <span
                  className="emoji-mini"
                  onClick={() => setEmojiExpanded((v) => !v)}
                  role="button"
                  aria-label={emojiExpanded ? '收起更多表情' : '更多表情'}
                  title={emojiExpanded ? '收起' : '更多'}
                >
                  {emojiExpanded ? '−' : '＋'}
                </span>
              )}
              <span
                className="emoji-mini"
                onClick={() => navigate('toolbox')}
                role="button"
                aria-label="工具盒"
                title="工具盒"
              >
                🎈
              </span>
            </div>

            <div className="input-row-inline">
              <button
                className={`btn-mic ${isRecording ? 'recording' : ''}`}
                {...micHandlers}
                disabled={micUnavailable || isTranscribing || !isOnline}
                style={{ touchAction: tapMode ? 'manipulation' : 'none' }}
                title={
                  micDenied
                    ? '麦克风权限被拒，请用打字'
                    : !sttSupported
                    ? '浏览器不支持麦克风'
                    : !isOnline
                    ? '网络断开'
                    : tapMode
                    ? isRecording
                      ? '点一下停止'
                      : '点一下说话'
                    : '按住说话'
                }
                aria-label={
                  tapMode ? (isRecording ? '点一下停止' : '点一下说话') : '按住说话'
                }
              >
                {isTranscribing ? '⏳' : '🎤'}
              </button>
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isOnline) sendByInput()
                }}
                placeholder={isOnline ? '输入文字...' : '网络断开'}
                disabled={!isOnline}
                aria-label="输入对话文字"
              />
              <button
                className="btn-send-inline"
                onClick={sendByInput}
                disabled={!inputText.trim() || !isOnline}
                aria-label="发送"
              >
                ➤
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* 历史抽屉（移动端用） */}
      {historyOpen && (
        <>
          <div
            className="history-drawer-backdrop"
            onClick={() => setHistoryOpen(false)}
          />
          <div className="history-drawer" role="dialog" aria-label="对话历史">
            <div className="history-drawer-header">
              <h3>📜 跟心屿聊过的话</h3>
              <button
                className="history-drawer-close"
                onClick={() => setHistoryOpen(false)}
                aria-label="关闭历史"
              >
                ✕
              </button>
            </div>
            <div className="history-drawer-content">
              {visibleMessages.length === 0 ? (
                <div className="history-drawer-empty">
                  {childInfo?.name
                    ? `${childInfo.name}，还没和心屿说过话哦 🌸`
                    : '还没和心屿说过话哦 🌸'}
                </div>
              ) : (
                visibleMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`msg-row ${m.role === 'user' ? 'user' : 'xinyu'}`}
                  >
                    <div
                      className={`msg-bubble ${m.role === 'user' ? 'user' : 'xinyu'}`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))
              )}
              <div ref={historyEndRef} />
            </div>
            {visibleMessages.length > 0 && (
              <div className="history-drawer-footer">
                <button
                  className="btn-clear-history"
                  onClick={() => {
                    if (window.confirm('确定清空所有对话记录吗？此操作不能撤销。')) {
                      clearHistory()
                      setHistoryOpen(false)
                    }
                  }}
                >
                  🗑 清空所有记录
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* 任务 5（Q5）：依恋护栏柔和提示 —— 建议去找真实朋友玩 */}
      {showAttachmentNudge && (
        <div
          className="attachment-nudge"
          role="dialog"
          aria-label="温和提示"
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--bg-card)',
            color: 'var(--text-main)',
            padding: '24px 28px',
            borderRadius: '20px',
            boxShadow: '0 12px 32px rgba(123, 109, 92, 0.18)',
            maxWidth: '300px',
            zIndex: 200,
            textAlign: 'center',
            animation: 'attachmentFadeIn 280ms ease-out',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>🌿</div>
          <p style={{ fontSize: '16px', lineHeight: 1.7, marginBottom: '6px' }}>
            聊了好久啦。
          </p>
          <p style={{ fontSize: '16px', lineHeight: 1.7, marginBottom: '18px' }}>
            也找朋友玩玩吧。
          </p>
          <button
            className="btn-primary"
            onClick={() => setShowAttachmentNudge(false)}
            style={{ width: '100%' }}
          >
            好的
          </button>
        </div>
      )}

      {/* 家长视图密码门：孩子点开关但未授权时弹出，输对家长密码才放行 */}
      {showParentGate && (
        <PasswordGate
          onSuccess={() => {
            setShowParentGate(false)
            setShowParentView(true)
          }}
          onCancel={() => setShowParentGate(false)}
        />
      )}

      {/* 家长视图：仅 visible=true 时启用；P-2 摄像头开启前还有一次性确认（取消即关闭家长视图） */}
      <FaceMetrics visible={showParentView} onCancel={() => setShowParentView(false)} />
    </div>
  )
}

export default ChatPage
