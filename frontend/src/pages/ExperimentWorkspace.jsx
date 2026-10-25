import { useState, useMemo, useEffect } from 'react'
import { ChatContext } from '../App'
import ChatPage from './ChatPage'

// This provider never mounts ordinary App persistence effects or writes normal history.
export default function ExperimentWorkspace({ detail, client, onClose }) {
  const [messages, setMessages] = useState(() => detail.turns.flatMap((t) => {
    const input = JSON.parse(t.input)
    return [{ role: 'user', content: input.text }, ...(t.output ? [{ role: 'assistant', content: JSON.parse(t.output).reply }] : [])]
  }))
  const [currentStage, setCurrentStage] = useState('welcome')
  const [scenario, setScenario] = useState(() => {
    const last = detail.turns.at(-1)
    return last ? JSON.parse(last.input).scenario : 'supermarket'
  })
  const [currentScene, setCurrentScene] = useState(() => {
    const output = detail.turns.at(-1)?.output
    return output ? JSON.parse(output).scene : 'enter'
  })
  const [isOnline, setOnline] = useState(navigator.onLine)
  const [error, setError] = useState('')
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  const adapter = useMemo(() => ({
    ...client,
    setError,
    onModelEvent: (type) => client.emit(type),
  }), [client])
  useEffect(() => {
    client.onEventError(setError)
    client.emit('page_resume', { detail: '实验页面载入；状态来自服务端记录。' })
    return () => client.onEventError(() => {})
  }, [client])
  const value = {
    childInfo: JSON.parse(detail.session.profile), messages, setMessages,
    currentStage, setCurrentStage, scenario, setScenario, currentScene, setCurrentScene,
    isOnline, settings: { autoTTS: true, animations: true, acoustic: true, recordMode: 'tap', minRecordMs: 300,
      ttsRate: 1, ttsPitch: 1, ttsVolume: 1, sessionLimitMin: 15 },
    clearHistory: () => setError('实验原始记录不能清空；返回任务页保留当前会话。'),
    pushAcousticFeatures: () => {},
  }
  return <section className="experiment-workspace">
    <header className="experiment-toolbar">
      <button onClick={async () => { await client.flush(); onClose() }}>返回实验任务</button>
      <span>{detail.session.batch_kind} · {detail.session.code} · {detail.session.id} · 成年人虚拟测试</span>
      {error && <p role="alert">记录异常：{error}。请保留现象并报告管理员。</p>}
    </header>
    <ChatContext.Provider value={value}>
      <ChatPage experiment={adapter} navigate={onClose} />
    </ChatContext.Provider>
  </section>
}
