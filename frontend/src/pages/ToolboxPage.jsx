function ToolboxPage({ navigate }) {
  return (
    <div className="page-container">
      <div style={{ padding: '24px 0', flex: 1 }}>
        <div className="toolbox-card" onClick={() => navigate('breathe')}>
          <div className="card-icon">🌬️</div>
          <h2>一起深呼吸</h2>
          <p className="subtitle">跟着圆圈一起呼吸</p>
        </div>

        <div className="toolbox-card" onClick={() => navigate('outside')}>
          <div className="card-icon">🪟</div>
          <h2>看看窗外</h2>
          <p className="subtitle">放空一会儿</p>
        </div>

        <div className="toolbox-card" onClick={() => navigate('rest')}>
          <div className="card-icon">✋</div>
          <h2>我需要休息</h2>
          <p className="subtitle">心屿等你回来</p>
        </div>
      </div>

      <div style={{ paddingBottom: '24px' }}>
        <button className="btn-primary" onClick={() => navigate('chat')}>
          回去和心屿继续聊天
        </button>
      </div>
    </div>
  )
}

export default ToolboxPage
