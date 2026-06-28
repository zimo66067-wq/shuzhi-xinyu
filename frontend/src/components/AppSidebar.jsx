import { useState, useEffect } from 'react'
import { loadSessions } from '../lib/sessionHistory'

const COLLAPSED_KEY = 'xinyu_sidebar_collapsed'

const NAV_ITEMS = [
  { page: 'startup', icon: '🏠', label: '首页' },
  { page: 'parent',    icon: '👨‍👩‍👧', label: '家长后台' },
  { page: 'therapist', icon: '👩‍⚕️', label: '治疗师入口' },
]

function fmtDate(iso) {
  try {
    const d = new Date(iso)
    const m   = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${m}/${day}`
  } catch {
    return ''
  }
}

export default function AppSidebar({ navigate, currentPage }) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === 'true',
  )
  const [sessions, setSessions] = useState([])

  // 每次切换页面时刷新历史列表（navigate 导致 currentPage 变化）
  useEffect(() => {
    setSessions(loadSessions().slice().reverse().slice(0, 20))
  }, [currentPage])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(COLLAPSED_KEY, String(next))
  }

  const w = collapsed ? 60 : 240

  return (
    <aside
      className="app-sidebar"
      style={{ width: w }}
      aria-label="侧边导航"
    >
      {/* 顶部：品牌名 + 折叠按钮 */}
      <div className="sb-header">
        {!collapsed && <span className="sb-brand">🌊 数智心屿</span>}
        <button
          className="sb-toggle"
          onClick={toggle}
          aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          title={collapsed ? '展开' : '收起'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* 新建对话 */}
      <div className="sb-section">
        <button
          className={`sb-new-chat${collapsed ? ' collapsed' : ''}`}
          onClick={() => navigate('startup')}
          aria-label="新建对话"
          title="新建对话"
        >
          <span className="sb-item-icon">✏️</span>
          {!collapsed && <span className="sb-item-label">新建对话</span>}
        </button>
      </div>

      {/* 主导航 */}
      <nav className="sb-nav" aria-label="主导航">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.page}
            className={`sb-nav-item${currentPage === item.page ? ' active' : ''}`}
            onClick={() => navigate(item.page)}
            aria-label={item.label}
            aria-current={currentPage === item.page ? 'page' : undefined}
            title={collapsed ? item.label : undefined}
          >
            <span className="sb-item-icon">{item.icon}</span>
            {!collapsed && <span className="sb-item-label">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* 历次对话（仅展开时显示） */}
      {!collapsed && (
        <div className="sb-history">
          <div className="sb-section-title">历次对话</div>
          {sessions.length === 0 ? (
            <div className="sb-history-empty">暂无记录</div>
          ) : (
            <div className="sb-history-list">
              {sessions.map((s) => (
                <div key={s.id} className="sb-history-item">
                  <div className="sb-history-meta">
                    {s.childName} · {fmtDate(s.date)} · {s.messageCount} 条
                  </div>
                  <div className="sb-history-preview">{s.preview}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
