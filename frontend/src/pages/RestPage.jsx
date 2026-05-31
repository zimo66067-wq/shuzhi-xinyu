function RestPage({ navigate }) {
  return (
    <div className="page-container">
      <div className="pure-center">
        <div className="startup-circle"></div>
        <h2>我在这里等你</h2>
      </div>
      <button className="btn-primary" onClick={() => navigate('toolbox')}>
        返回工具盒
      </button>
    </div>
  )
}

export default RestPage
