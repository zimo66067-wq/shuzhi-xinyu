import { useState, useEffect, useRef, useContext, useMemo } from 'react'
import XinyuScene from '../three/XinyuScene'
import { speak, cancel as cancelTTS } from '../lib/tts'
import usePushToTalk from '../hooks/usePushToTalk'
import { ChatContext } from '../App'
import TrainingStepper, { stageFromRoundCount } from '../components/TrainingStepper'
import ScenarioBanner from '../components/ScenarioBanner'

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
  } = useContext(ChatContext)

  const [inputText, setInputText] = useState('')
  const [xinyuState, setXinyuState] = useState('idle')
  // 任务 1：声学状态扩展为 4 路（volume + 3 频段），驱动 VRM 5 个 viseme
  const [audioState, setAudioState] = useState({
    volume: 0, lowBand: 0, midBand: 0, highBand: 0,
  })
  const [xinyuExpression, setXinyuExpression] = useState('neutral')
  const [thinkingDots, setThinkingDots] = useState('')

  // 任务 3：年龄分档（low/mid/high）
  const ageBand = useMemo(() => getAgeBand(childInfo?.age), [childInfo?.age])
  // 10+ 岁的扩展表情面板开关
  const [emojiExpanded, setEmojiExpanded] = useState(false)

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
  const isThinking = xinyuState === 'thinking'

  // 声学异常实时回调（cry / silence / agitated）
  const handleSafetySignal = (level) => {
    console.debug('[Acoustic] 安全信号:', level)
    if (level === 'cry' || level === 'agitated') {
      // 高紧急度：直接出安抚提示
      setShowComfort(true)
    } else if (level === 'silence') {
      // 沉默：在字幕区温和提示，不打断
      setTtsSubtitle('心屿在这里，慢慢来')
      setTimeout(() => setTtsSubtitle((s) => (s === '心屿在这里，慢慢来' ? '' : s)), 3000)
    }
  }

  // STT + 声学
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
    onSafetySignal: handleSafetySignal,
    onAcousticSummary: (features) => pushAcousticFeatures(features),
  })

  const micUnavailable = !sttSupported || micDenied

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

  // 离开页面取消 TTS
  useEffect(() => () => cancelTTS(), [])

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
      const response = await fetch('/api/chat', {
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
      setXinyuState('speaking')
      await speak(reply, {
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
          <button
            className="btn-icon btn-pause top-pause"
            onClick={() => navigate('pause')}
            aria-label="暂停"
          >
            ⏸ 暂停
          </button>
        </div>
      </div>

      {/* 场景模式 → 场景横幅；自由聊天 → 5 阶段进度条 */}
      {scenario ? (
        <ScenarioBanner
          scenario={scenario}
          currentScene={currentScene}
          onExit={() => {
            setScenario(null)
            setCurrentScene(null)
          }}
        />
      ) : (
        <TrainingStepper currentStage={currentStage} />
      )}

      {/* 安抚提示条 */}
      {showComfort && (
        <div className="comfort-banner" role="dialog" aria-label="温和提示">
          <div className="comfort-banner-text">
            心屿发现你可能需要休息一下，要去看看小工具吗？🌿
          </div>
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
        </div>
      )}

      {/* 中央 3D 区域（扩展占满中部，原 chat-history 改为侧边栏） */}
      <div className="avatar-zone" style={{ flex: 1, height: 'auto' }}>
        <div className={`avatar-halo ${isThinking ? 'thinking' : ''}`}>
          <XinyuScene
            state={xinyuState}
            volume={audioState.volume}
            lowBand={audioState.lowBand}
            midBand={audioState.midBand}
            highBand={audioState.highBand}
            expression={xinyuExpression}
          />
        </div>

        {/* dev 模式：右上角浮动条显示实时口型输入（生产构建会被 esbuild drop console 顺带剔除） */}
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

      {/* 历史抽屉 */}
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

      {/* 底部并列输入栏 */}
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
          {/* 10+ 岁：扩展表情入口 */}
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
            onPointerDown={(e) => {
              e.preventDefault()
              if (!micUnavailable && isOnline) startRecording()
            }}
            onPointerUp={() => {
              if (isRecording) stopRecording()
            }}
            onPointerLeave={() => {
              if (isRecording) stopRecording()
            }}
            onPointerCancel={() => {
              if (isRecording) stopRecording()
            }}
            disabled={micUnavailable || isTranscribing || !isOnline}
            style={{ touchAction: 'none' }}
            title={
              micDenied
                ? '麦克风权限被拒，请用打字'
                : !sttSupported
                ? '浏览器不支持麦克风'
                : !isOnline
                ? '网络断开'
                : '按住说话'
            }
            aria-label="按住说话"
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
  )
}

export default ChatPage
