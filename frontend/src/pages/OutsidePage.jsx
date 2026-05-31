function OutsidePage({ navigate }) {
  return (
    <div className="page-container">
      <div className="pure-center">
        <div style={{ fontSize: '100px' }}>🪟</div>
        <h2>看看窗外</h2>
        <p className="subtitle">听听窗外的声音</p>
      </div>
      <button className="btn-primary" onClick={() => navigate('toolbox')}>
        返回工具盒
      </button>
    </div>
  )
}

export default OutsidePage
