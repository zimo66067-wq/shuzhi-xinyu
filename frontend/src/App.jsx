import { useState, useEffect, createContext } from 'react'
import StartupPage from './pages/StartupPage'
import ChatPage from './pages/ChatPage'
import ToolboxPage from './pages/ToolboxPage'
import PausePage from './pages/PausePage'
import BreathePage from './pages/BreathePage'
import OutsidePage from './pages/OutsidePage'
import RestPage from './pages/RestPage'
import ParentPage from './pages/ParentPage'

// 全局对话上下文：孩子信息 + 完整 messages + 网络状态
export const ChatContext = createContext(null)

function App() {
  const [currentPage, setCurrentPage] = useState(() => {
    // 任务 4b：URL 直达支持（不引 react-router，仅在启动时读 pathname）
    // /parent → 家长后台；其它路径走 localStorage 上次的页面或 startup
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.replace(/\/$/, '')
      if (path === '/parent') return 'parent'
    }
    return localStorage.getItem('xinyu_currentPage') || 'startup'
  })

  const [childInfo, setChildInfo] = useState(() => {
    try {
      const saved = localStorage.getItem('xinyu_childInfo')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('xinyu_messages')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // 训练阶段：后端 /api/chat 返回的 stage，前端按轮数推断兜底
  const [currentStage, setCurrentStage] = useState('welcome')

  // 任务 7：场景模式（null = 默认自由聊天；'supermarket' = 超市练习）
  const [scenario, setScenario] = useState(null)
  const [currentScene, setCurrentScene] = useState(null)

  // 声学历史：每次录音结束 push 一条 features
  const [acousticHistory, setAcousticHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('xinyu_acousticHistory')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // 整改 A-2：监护人知情同意。首次使用前必须取得；{agreed, timestamp}
  const [consent, setConsent] = useState(() => {
    try {
      const saved = localStorage.getItem('xinyu_consent')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  useEffect(() => {
    if (consent) localStorage.setItem('xinyu_consent', JSON.stringify(consent))
  }, [consent])
  const agreeConsent = () => setConsent({ agreed: true, timestamp: Date.now() })

  // 整改 A-6 + P-5/P-6：家长可配置项（单一 xinyu_settings，勿另起并行 store）
  //  - autoTTS/animations/acoustic：感官开关（A-6）
  //  - recordMode：录音方式 'hold'(长按) | 'tap'(点按切换)；minRecordMs：最短录音时长（P-5）
  //  - ttsRate/ttsPitch/ttsVolume：朗读语速/音调/音量（P-6，默认 1.0 = 不改现状）
  //  - sessionLimitMin：单次会话时长提醒分钟数（P-6）
  const DEFAULT_SETTINGS = {
    autoTTS: true,
    animations: true,
    acoustic: true,
    recordMode: 'hold',
    minRecordMs: 300,
    ttsRate: 1.0,
    ttsPitch: 1.0,
    ttsVolume: 1.0,
    sessionLimitMin: 15,
  }
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('xinyu_settings')
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('xinyu_settings', JSON.stringify(settings))
    } catch (e) {
      console.debug('[App] settings 写入 localStorage 失败:', e)
    }
  }, [settings])

  // 持久化 childInfo
  useEffect(() => {
    if (childInfo) {
      localStorage.setItem('xinyu_childInfo', JSON.stringify(childInfo))
    } else {
      localStorage.removeItem('xinyu_childInfo')
    }
  }, [childInfo])

  // 持久化 messages
  useEffect(() => {
    try {
      localStorage.setItem('xinyu_messages', JSON.stringify(messages))
    } catch (e) {
      console.debug('[App] messages 写入 localStorage 失败:', e)
    }
  }, [messages])

  // 持久化 acousticHistory（只保留最近 50 条，避免无限增长）
  useEffect(() => {
    try {
      const sliced = acousticHistory.slice(-50)
      localStorage.setItem('xinyu_acousticHistory', JSON.stringify(sliced))
    } catch (e) {
      console.debug('[App] acousticHistory 写入 localStorage 失败:', e)
    }
  }, [acousticHistory])

  const clearHistory = () => {
    setMessages([])
    setAcousticHistory([])
    setCurrentStage('welcome')
    setScenario(null)
    setCurrentScene(null)
  }

  const pushAcousticFeatures = (features) => {
    if (!features) return
    setAcousticHistory((prev) => [
      ...prev.slice(-49),
      { timestamp: Date.now(), ...features },
    ])
  }

  // P-3：永久删除本设备所有数据（清空全部 xinyu_* 键），回到首次启动态
  // 清掉后跳回根路径并刷新：localStorage 已空 → 重新出现知情同意 + 录入
  const wipeAllData = () => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('xinyu_'))
        .forEach((k) => localStorage.removeItem(k))
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith('xinyu_'))
        .forEach((k) => sessionStorage.removeItem(k))
    } catch (e) {
      console.debug('[App] 清空本设备数据失败:', e)
    }
    window.location.href = '/'
  }

  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [showRecovered, setShowRecovered] = useState(false)

  const navigate = (page) => {
    setCurrentPage(page)
    localStorage.setItem('xinyu_currentPage', page)
  }

  // 防止直接刷新到 chat 但 childInfo 已丢失：回退到 startup
  useEffect(() => {
    if (currentPage === 'chat' && !childInfo) {
      setCurrentPage('startup')
      localStorage.setItem('xinyu_currentPage', 'startup')
    }
  }, [currentPage, childInfo])

  // 全局网络监听
  useEffect(() => {
    const handleOffline = () => setIsOnline(false)
    const handleOnline = () => {
      setIsOnline(true)
      setShowRecovered(true)
      setTimeout(() => setShowRecovered(false), 2000)
    }
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  const renderPage = () => {
    switch (currentPage) {
      case 'startup':
        return <StartupPage navigate={navigate} />
      case 'chat':
        return <ChatPage navigate={navigate} />
      case 'toolbox':
        return <ToolboxPage navigate={navigate} />
      case 'pause':
        return <PausePage navigate={navigate} />
      case 'breathe':
        return <BreathePage navigate={navigate} />
      case 'outside':
        return <OutsidePage navigate={navigate} />
      case 'rest':
        return <RestPage navigate={navigate} />
      case 'parent':
        return <ParentPage navigate={navigate} />
      default:
        return <StartupPage navigate={navigate} />
    }
  }

  return (
    <ChatContext.Provider
      value={{
        childInfo,
        setChildInfo,
        messages,
        setMessages,
        clearHistory,
        acousticHistory,
        pushAcousticFeatures,
        currentStage,
        setCurrentStage,
        scenario,
        setScenario,
        currentScene,
        setCurrentScene,
        isOnline,
        consent,
        agreeConsent,
        settings,
        setSettings,
        wipeAllData,
      }}
    >
      <div
        className={settings.animations ? undefined : 'reduce-motion'}
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        {!isOnline && (
          <div className="offline-banner">网络断开了，心屿等你回来 🌙</div>
        )}
        {isOnline && showRecovered && (
          <div className="offline-banner recovered">网络恢复啦！</div>
        )}
        {renderPage()}
      </div>
    </ChatContext.Provider>
  )
}

export default App
