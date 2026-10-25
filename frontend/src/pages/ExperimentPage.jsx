import { useEffect, useMemo, useState, useRef } from 'react'
import { API_BASE } from '../lib/api'
import { experimentClient, readExperimentAuth, saveExperimentAuth } from '../lib/experiment'
import ExperimentWorkspace from './ExperimentWorkspace'
import './experiment.css'

const parse = (value, fallback = {}) => { try { return JSON.parse(value) } catch { return fallback } }
const pretty = (value) => JSON.stringify(value, null, 2)
const scoreBlank = { T: null, R: null, U: null, S: null, E: null }

function TurnstileAdmission({ client, sid, onDone, run }) {
  const root = useRef(null)
  const [config, setConfig] = useState(null)
  useEffect(() => { client.call('/config').then(setConfig) }, [client])
  useEffect(() => {
    if (!config || config.verification_mode !== 'turnstile' || !config.turnstile_site_key) return
    let disposed = false, widget
    const mount = () => {
      if (disposed || !window.turnstile || !root.current) return
      widget = window.turnstile.render(root.current, { sitekey: config.turnstile_site_key, action: 'experiment_admit',
        callback: (token) => run(async () => { await client.call(`/sessions/${sid}/admit`, 'POST', { turnstile_token: token }); onDone() }) })
    }
    if (window.turnstile) mount()
    else {
      const script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true; script.onload = mount; document.head.appendChild(script)
    }
    return () => { disposed = true; if (widget !== undefined && window.turnstile) window.turnstile.remove(widget) }
  }, [client, config, sid])
  return config?.verification_mode === 'turnstile' ? <div><p>完成准入验证后可开始；服务不可用时请联系管理员。</p><div ref={root} /></div>
    : <p>由管理员观察现场操作后授予本会话准入。</p>
}

function ScoreForm({ onSubmit, review = false }) {
  const [scores, setScores] = useState(scoreBlank)
  const [basis, setBasis] = useState('')
  const [evidence, setEvidence] = useState('')
  const [evaluation, setEvaluation] = useState('insufficient_evidence')
  const [metrics, setMetrics] = useState('{}')
  const [error, setError] = useState('')
  return <form onSubmit={(event) => { event.preventDefault(); try { onSubmit({ scores,
    ...(review ? { reason: basis } : { basis, evaluation }), evidence_refs: evidence.split('\n').filter(Boolean), metrics: JSON.parse(metrics) }); setError('') } catch { setError('指标 JSON 格式错误，请检查后提交。') } }}>
    <h3>{review ? '分歧复核与最终评分' : '独立评分'}</h3>
    {error && <p role="alert">{error}</p>}
    <p>依据 T/R/U/S/E 的 0—2 分锚点；不可评价保留空值。提交后不可覆盖。</p>
    <div className="experiment-row">{Object.keys(scoreBlank).map((dim) => <label key={dim}>{dim}<select aria-label={`${review ? '最终' : '独立'}${dim}评分`} value={scores[dim] ?? ''}
      onChange={(e) => setScores({ ...scores, [dim]: e.target.value === '' ? null : Number(e.target.value) })}>
      <option value="">不可评价</option>{[0, 1, 2].map((x) => <option key={x} value={x}>{x}</option>)}</select></label>)}</div>
    {!review && <label>评价状态<select value={evaluation} onChange={(e) => setEvaluation(e.target.value)}>
      <option value="evaluable">可评价</option><option value="insufficient_evidence">证据不足</option><option value="not_implemented">功能未实现</option><option value="not_executed">未执行</option></select></label>}
    <label>依据与分歧说明<textarea required value={basis} onChange={(e) => setBasis(e.target.value)} /></label>
    <label>证据 ID 或录屏索引 每行一项<textarea required value={evidence} onChange={(e) => setEvidence(e.target.value)} /></label>
    <label>适用指标 JSON 每项含 numerator 与 denominator<textarea value={metrics} onChange={(e) => setMetrics(e.target.value)} /></label>
    <p>支持 task_completion、key_steps、state_change、stt_success、tts_success、vrm_feedback、error_recovery；未采集的项目留空。</p>
    <button type="submit">{review ? '提交复核结果' : '封存本人的独立评分'}</button>
  </form>
}

export default function ExperimentPage() {
  const [auth, setAuth] = useState(readExperimentAuth)
  const client = useMemo(() => auth ? experimentClient(auth) : null, [auth])
  const [sessions, setSessions] = useState([]), [batches, setBatches] = useState([]), [users, setUsers] = useState([])
  const [selected, setSelected] = useState(null), [workspace, setWorkspace] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const [batchId, setBatchId] = useState(''), [auditResult, setAuditResult] = useState(null)
  const [note, setNote] = useState(''), [reference, setReference] = useState(''), [fileHash, setFileHash] = useState('')
  const [manual, setManual] = useState(false), [reason, setReason] = useState('')
  const [testerA, setTesterA] = useState(''), [testerB, setTesterB] = useState(''), [raterA, setRaterA] = useState(''), [raterB, setRaterB] = useState('')
  const admin = auth?.user.role === 'admin'
  const sessionClient = useMemo(() => auth && selected ? experimentClient(auth, selected.session.id) : null, [auth, selected?.session.id])
  const refresh = async () => {
    if (!client) return
    const me = await client.call('/me')
    if (me.user.id !== auth.user.id) throw new Error('身份已变更，请重新登录')
    setSessions((await client.call('/sessions')).sessions)
    if (admin) {
      const [batchResult, userResult] = await Promise.all([client.call('/batches'), client.call('/users')])
      setBatches(batchResult.batches); setUsers(userResult.users)
    }
    if (selected) setSelected(await client.call(`/sessions/${selected.session.id}`))
  }
  const run = async (task, refreshAfter = true) => { setError(''); setNotice(''); setBusy(true); try { await task(); setNotice('操作已记录'); if (refreshAfter) await refresh() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  useEffect(() => { if (client) { refresh().catch((e) => setError(e.message)) } }, [client])
  const choose = (sid) => run(async () => { setSelected(await client.call(`/sessions/${sid}`)); setWorkspace(false); setNote(''); setReference(''); setFileHash('') }, false)

  if (!auth) return <main className="experiment-shell"><h1>数智心屿科研实验</h1>
    <p>第二轮人工工程测试。仅使用成年人模拟内容；测试会话、模型调用与人工评分分别留存。</p>
    <form onSubmit={async (e) => { e.preventDefault(); const data = new FormData(e.currentTarget); setError(''); try {
      const response = await fetch(`${API_BASE}/api/experiment/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(data)), cache: 'no-store' })
      const result = await response.json(); if (!response.ok) throw new Error(result.error || '登录失败')
      saveExperimentAuth(result); setAuth(result)
    } catch (err) { setError(err.message) } }}>
      <label>实验账号<input name="username" autoComplete="username" required /></label>
      <label>密码<input name="password" type="password" autoComplete="current-password" required /></label>
      <button type="submit">登录实验模式</button>
    </form>{error && <p role="alert">{error}</p>}<a href="/">普通训练入口</a></main>

  if (workspace && selected) return <ExperimentWorkspace detail={selected} client={sessionClient} onClose={() => { setWorkspace(false); refresh().catch((e) => setError(e.message)) }} />
  const selectedCase = selected ? parse(selected.session.case_payload) : null
  const canExecute = selected?.session.executor_id === auth.user.id
  const canRate = selected && parse(selected.session.raters, []).includes(auth.user.id)
  const batch = batches.find((b) => b.id === batchId)
  const userOptions = users.filter((u) => u.enabled && u.role === 'executor').map((u) => <option key={u.id} value={u.id}>{u.username}</option>)
  return <main className="experiment-shell" aria-busy={busy}>
    <header><h1>数智心屿科研实验</h1><p>{auth.user.username} · {admin ? '实验管理员' : '执行与评分账号'}</p>
      <div className="experiment-row"><button onClick={() => run(refresh)} disabled={busy}>刷新记录</button>
        <button onClick={async () => { try { await client.call('/logout', 'POST', {}) } catch { /* expired sessions still clear local credentials */ } finally { saveExperimentAuth(null); setAuth(null); setSelected(null) } }}>退出实验账号</button></div></header>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <p>验证码和服务端日志均不能单独证明真人或提供商独立认证。自动测试、试运行与正式批次分开统计。</p>
    {admin && <section><h2>批次与账号</h2>
      <form className="experiment-row" onSubmit={(e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)); run(async () => { const b = await client.call('/batches', 'POST', d); setBatchId(b.id) }) }}>
        <label>新批次名称<input name="name" required /></label><label>性质<select name="kind"><option value="pilot">试运行</option><option value="formal">正式人工实验</option></select></label><button disabled={busy}>创建批次</button></form>
      <form className="experiment-row" onSubmit={(e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)); run(() => client.call('/users', 'POST', d)); e.currentTarget.reset() }}>
        <label>新账号<input name="username" required /></label><label>初始密码<input name="password" type="password" minLength={12} required /></label><label>角色<select name="role"><option value="executor">执行员或评分者</option><option value="admin">管理员</option></select></label><button disabled={busy}>创建账号</button></form>
      <details><summary>账号停用与密码重置</summary>{users.filter((u) => u.id !== auth.user.id).map((u) => <form key={u.id} className="experiment-row" onSubmit={(e) => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); run(() => client.call(`/users/${u.id}`, 'PATCH', data)); e.currentTarget.reset() }}>
        <span>{u.username} · {u.enabled ? '启用' : '停用'}</span><input name="password" type="password" minLength={12} placeholder="新密码" required /><input name="reason" aria-label="账号变更原因" placeholder="原因" required /><button>重置密码</button>
        <button type="button" onClick={() => run(() => client.call(`/users/${u.id}`, 'PATCH', { enabled: !u.enabled, reason: '管理员在账号管理界面切换启停' }))}>{u.enabled ? '停用' : '启用'}</button></form>)}</details>
      <label>当前批次<select value={batchId} onChange={(e) => { setBatchId(e.target.value); setAuditResult(null) }}><option value="">请选择</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.kind} · {b.state}</option>)}</select></label>
      {batch && <><details><summary>冻结配置</summary><pre>{pretty(parse(batch.config))}</pre></details>
        <div className="experiment-row"><button disabled={busy || batch.state !== 'draft'} onClick={() => run(async () => { const template = await client.call('/case-template'); await client.call(`/batches/${batchId}/cases`, 'POST', { ...template, confirmed: true }) })}>确认并导入方案的 40 个用例</button>
          <label>导入自定义已确认方案 JSON<input type="file" accept=".json" onChange={(e) => { const file = e.target.files?.[0]; if (file) run(async () => client.call(`/batches/${batchId}/cases`, 'POST', { ...JSON.parse(await file.text()), confirmed: true })) }} /></label></div>
        <div className="experiment-row">{[['测试者甲', testerA, setTesterA], ['测试者乙', testerB, setTesterB], ['评分者甲', raterA, setRaterA], ['评分者乙', raterB, setRaterB]].map(([label, value, setter]) => <label key={label}>{label}<select value={value} onChange={(e) => setter(e.target.value)}><option value="">选择独立账号</option>{userOptions}</select></label>)}
          <button disabled={busy} onClick={() => run(() => client.call(`/batches/${batchId}/assign`, 'POST', { executors: [testerA, testerB], raters: [raterA, raterB] }))}>交错分配 40 个会话</button></div>
        <label>启停或准入原因<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <label>正式批次签署冻结单归档索引<input value={reference} onChange={(e) => setReference(e.target.value)} /></label><label>冻结单 SHA256<input value={fileHash} onChange={(e) => setFileHash(e.target.value)} /></label>
        <div className="experiment-row"><button disabled={busy} onClick={() => run(() => client.call(`/batches/${batchId}`, 'PATCH', { state: 'enabled', reason, freeze_evidence: { reference, sha256: fileHash } }))}>启用批次</button>
          <button disabled={busy} onClick={() => run(() => client.call(`/batches/${batchId}`, 'PATCH', { state: 'stopped', reason }))}>停止批次</button>
          <button disabled={busy} onClick={() => run(async () => setAuditResult(await client.call(`/batches/${batchId}/summary`)))}>统计与分歧</button>
          <button disabled={busy} onClick={() => run(async () => setAuditResult(await client.call(`/batches/${batchId}/verify`)))}>核验完整性</button>
          <button disabled={busy} onClick={() => run(async () => setAuditResult(await client.call('/risks')))}>异常登录与自动化风险</button>
          <button disabled={busy} onClick={() => run(() => client.download(batchId))}>导出受控证据包</button></div>
        {auditResult && <pre>{pretty(auditResult)}</pre>}
        {auditResult?.risks?.filter((ev) => ev.kind === 'risk').map((ev) => <div key={ev.id}><span>{ev.id} · {parse(ev.data).reason}</span><button onClick={() => run(() => client.call(`/risks/${ev.id}/review`, 'POST', { reason }))}>按当前原因追加复核</button></div>)}</>}
    </section>}
    <section><h2>会话进度</h2><p>可见 {sessions.filter((s) => !batchId || s.batch_id === batchId).length} 个会话；实际轮次及调用次数在批次统计中单列。</p>
      <div className="experiment-table"><table><thead><tr><th>批次</th><th>用例</th><th>执行员</th><th>状态</th><th>轮次</th><th>操作</th></tr></thead><tbody>
        {sessions.filter((s) => !batchId || s.batch_id === batchId).map((s) => <tr key={s.id}><td>{s.batch_name} · {s.batch_kind}</td><td>{s.code}</td><td>{users.find((u) => u.id === s.executor_id)?.username || s.executor_id.slice(0, 8)}</td><td>{s.state}</td><td>{s.turn_no}</td><td><button disabled={busy} onClick={() => choose(s.id)}>查看会话</button></td></tr>)}</tbody></table></div>
    </section>
    {selected && <section><h2>{selected.session.code} 会话记录</h2><p>{selected.session.id}</p>
      <h3>目标与操作方案</h3><p>{selectedCase.target}</p><p>{selectedCase.preconditions}</p><ol>{selectedCase.steps?.map((step, i) => <li key={i}>{step}</li>)}</ol><p>预期：{selectedCase.expected}</p><p>调用要求：{selectedCase.call_requirement}</p>
      {admin && <div className="experiment-row"><input aria-label="监督或作废原因" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="监督情况、异常或作废原因" />
        <button disabled={busy} onClick={() => run(() => client.call(`/sessions/${selected.session.id}/admit`, 'POST', { reason }))}>现场监督后授予准入</button>
        <button disabled={busy} onClick={() => run(() => client.call(`/sessions/${selected.session.id}/invalidate`, 'POST', { reason }))}>作废并保留原始记录</button>
        <button disabled={busy} onClick={() => run(() => client.call(`/sessions/${selected.session.id}/interrupt`, 'POST', { reason }))}>封存超时中断轮次</button></div>}
      {canExecute && <><TurnstileAdmission client={sessionClient} sid={selected.session.id} onDone={refresh} run={run} />
        <button disabled={busy || !['ready', 'in_progress'].includes(selected.session.state)} onClick={() => setWorkspace(true)}>进入真实平台执行本会话</button>
        <form onSubmit={(e) => { e.preventDefault(); run(() => client.call(`/sessions/${selected.session.id}/observations`, 'POST', { note, evidence: [{ reference, sha256: fileHash }], manual_declaration: manual })) }}>
          <h3>现场观察与证据归档</h3><label>真实观察<textarea value={note} onChange={(e) => setNote(e.target.value)} required /></label>
          <label>连续录屏归档索引<input value={reference} onChange={(e) => setReference(e.target.value)} required /></label><label>录屏 SHA256<input value={fileHash} onChange={(e) => setFileHash(e.target.value)} pattern="[0-9a-f]{64}" required /></label>
          <label>从本地文件计算哈希 不上传录屏<input type="file" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer()); setFileHash(Array.from(new Uint8Array(hash), (x) => x.toString(16).padStart(2, '0')).join('')); setReference(file.name) }} /></label>
          <label className="experiment-check"><input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} required />本人以成年人虚拟角色人工执行，未使用脚本或 AI 代测</label><button disabled={busy}>追加现场记录</button></form>
        <button disabled={busy || selected.session.state !== 'in_progress'} onClick={() => run(() => client.call(`/sessions/${selected.session.id}/submit`, 'POST', {}))}>封存并提交会话</button></>}
      <h3>交互记录</h3>{selected.turns.map((t) => <article key={t.id}><p>第 {t.turn_no} 轮 · {t.source || t.status} · {t.trace_id}</p><p>输入：{parse(t.input).text}</p><p>业务回复：{parse(t.output).reply || '尚无结果'}</p>
        {admin && <details><summary>服务端审计字段与尝试</summary><pre>{pretty(t)}</pre></details>}</article>)}
      {canRate && selected.session.state === 'submitted' && !selected.ratings.some((r) => r.rater_id === auth.user.id) && <ScoreForm key={selected.session.id} onSubmit={(d) => run(() => client.call(`/sessions/${selected.session.id}/ratings`, 'POST', d))} />}
      <details><summary>已开放的独立评分与复核记录</summary><pre>{pretty({ ratings: selected.ratings, decisions: selected.decisions })}</pre></details>
      {admin && selected.session.state === 'submitted' && selected.ratings.length === 2 && <ScoreForm review key={`review:${selected.session.id}`} onSubmit={(d) => run(() => client.call(`/sessions/${selected.session.id}/review`, 'POST', d))} />}
      {admin && <><h3>逻辑路径与原始证据索引</h3><p>provider_send 为实际请求载荷，provider_result 为上游原始响应，business_response 为业务回复，ui_render 为页面回显申报。事件以 SHA256 串联。</p>{selected.events.map((ev) => <details key={ev.id}><summary>{ev.kind} · {ev.id} · {new Date(ev.utc_time * 1000).toISOString()}</summary><pre>{pretty({ ...ev, data: parse(ev.data) })}</pre>{ev.kind === 'risk' && <button onClick={() => run(() => client.call(`/risks/${ev.id}/review`, 'POST', { reason }))}>按当前原因追加风险复核</button>}</details>)}</>}
    </section>}
  </main>
}
