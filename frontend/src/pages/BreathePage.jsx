function BreathePage({ navigate }) {
  return (
    <div className="page-container">
      <div className="pure-center">
        <div className="breathe-circle"></div>
        <h2 style={{ marginTop: '64px' }}>深呼吸</h2>
        <p className="subtitle">跟着圆圈的节奏</p>
      </div>
      <button className="btn-primary" onClick={() => navigate('toolbox')}>
        返回工具盒
      </button>
    </div>
  )
}

export default BreathePage
