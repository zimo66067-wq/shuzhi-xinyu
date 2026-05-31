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

  // 声学历史：每次录音结束 push 一条 features
  const [acousticHistory, setAcousticHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('xinyu_acousticHistory')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

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
  }

  const pushAcousticFeatures = (features) => {
    if (!features) return
    setAcousticHistory((prev) => [
      ...prev.slice(-49),
      { timestamp: Date.now(), ...features },
    ])
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
        isOnline,
      }}
    >
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
