"""Experiment API and wrappers around the EXISTING chat/STT/TTS endpoints."""
from functools import wraps
import io
import json
import os
from pathlib import Path
import re
import time
import csv
import zipfile
import hashlib
import requests
from flask import Blueprint, jsonify, request, g, send_file
from werkzeug.security import generate_password_hash
from . import audit
from .workflow import Workflow, Rejected, digest, snapshot

PREFIX='/api/experiment'


def install(app, limiter=None):
    enabled=app.config.get('EXPERIMENT_ENABLED',os.environ.get('EXPERIMENT_ENABLED')=='1')
    if not enabled:
        return
    w=Workflow(app)
    app.extensions['experiment']=w
    bp=Blueprint('experiment',__name__,url_prefix=PREFIX)

    def body():
        data=request.get_json(silent=True)
        if not isinstance(data,dict): raise Rejected('json_object_required')
        return data

    def actor(db,admin=False):
        return w.auth(db,request.headers.get('Authorization',''),admin)

    def event(db,kind,data,u,s=None,b=None):
        return w.store.event(db,kind,data,actor=u['id'],batch=b or (s['batch_id'] if s else None),session=s['id'] if s else None)

    @bp.errorhandler(Rejected)
    def denied(e): return jsonify(error=e.message),e.status

    @app.errorhandler(audit.AuditWriteError)
    def audit_failure(e): return jsonify(error='audit_storage_failed_experiment_blocked'),503

    @bp.after_request
    def no_cache(response):
        response.headers['Cache-Control']='no-store'
        return response

    @bp.get('/config')
    def public_config():
        return jsonify(verification_mode=os.environ.get('EXPERIMENT_HUMAN_VERIFICATION','supervised'),
                       turnstile_site_key=os.environ.get('TURNSTILE_SITE_KEY') or None,
                       human_proof='risk_reduction_only')

    @bp.post('/login')
    def login():
        fp=digest(request.remote_addr+'|'+request.headers.get('User-Agent',''))
        return jsonify(w.login(body(),fp))

    @bp.get('/me')
    def me():
        with w.store.tx() as db:
            u=actor(db)
            return jsonify(user={k:u[k] for k in ('id','username','role')})

    @bp.post('/logout')
    def logout():
        with w.store.tx() as db:
            u=actor(db)
            db.execute('DELETE FROM auth WHERE token_hash=?',(digest(request.headers.get('Authorization','')[11:]),))
            event(db,'logout',{},u)
        return jsonify(ok=True)

    @bp.route('/users',methods=['GET','POST'])
    def users():
        with w.store.tx() as db:
            u=actor(db,True)
            if request.method=='GET':
                return jsonify(users=[dict(r) for r in db.execute('SELECT id,username,role,enabled FROM users')])
            d=body()
            name,pwd,role=d.get('username'),d.get('password'),d.get('role','executor')
            if not isinstance(name,str) or not re.fullmatch(r'[A-Za-z0-9_.-]{3,60}',name) or not isinstance(pwd,str) or not 12<=len(pwd)<=128 or role not in ('admin','executor'):
                raise Rejected('username_or_password_or_role_invalid')
            if db.execute('SELECT 1 FROM users WHERE username=?',(name,)).fetchone(): raise Rejected('username_exists',409)
            ident=audit.uid()
            db.execute('INSERT INTO users(id,username,password_hash,role) VALUES(?,?,?,?)',(ident,name,generate_password_hash(pwd),role))
            event(db,'user_created',{'id':ident,'username':name,'role':role},u)
            return jsonify(id=ident),201

    @bp.patch('/users/<ident>')
    def manage_user(ident):
        d=body()
        with w.store.tx() as db:
            u=actor(db,True)
            if ident==u['id']: raise Rejected('cannot_disable_or_reset_self',409)
            if not db.execute('SELECT 1 FROM users WHERE id=?',(ident,)).fetchone(): raise Rejected('user_not_found',404)
            reason=d.get('reason','')
            if not isinstance(reason,str) or not reason.strip(): raise Rejected('reason_required')
            if 'enabled' in d:
                if type(d['enabled']) is not bool: raise Rejected('enabled_boolean_required')
                db.execute('UPDATE users SET enabled=? WHERE id=?',(d['enabled'],ident))
            if 'password' in d:
                if not isinstance(d['password'],str) or not 12<=len(d['password'])<=128: raise Rejected('password_too_short')
                db.execute('UPDATE users SET password_hash=? WHERE id=?',(generate_password_hash(d['password']),ident))
            db.execute('DELETE FROM auth WHERE user_id=?',(ident,))
            event(db,'user_updated',{'id':ident,'reason':reason,'enabled':d.get('enabled'),'password_reset':'password' in d},u)
        return jsonify(ok=True)

    @bp.route('/batches',methods=['GET','POST'])
    def batches():
        with w.store.tx() as db:
            u=actor(db,True)
            if request.method=='GET': return jsonify(batches=[dict(r) for r in db.execute('SELECT * FROM batches ORDER BY created DESC')])
            d=body(); kind=d.get('kind','pilot')
            if kind not in ('formal','pilot','automated') or not isinstance(d.get('name'),str) or not 1<=len(d['name'])<=100: raise Rejected('invalid_batch')
            if kind=='automated' and not app.testing: raise Rejected('automated_batch_only_in_test_app',409)
            if app.testing and kind=='formal': raise Rejected('tests_cannot_create_formal_records',409)
            if os.environ.get('EXPERIMENT_ENV')=='formal' and kind!='formal': raise Rejected('nonformal_records_forbidden_in_formal_environment',409)
            if kind=='formal': w.formal_gate()
            conf=snapshot(); ident=audit.uid()
            db.execute('INSERT INTO batches VALUES(?,?,?,?,?,?,?,?)',(ident,d['name'],kind,'draft',audit.canonical(conf),audit.sha(conf),0,time.time()))
            event(db,'batch_created',{'id':ident,'kind':kind,'config':conf,'config_sha256':audit.sha(conf)},u,b=ident)
            return jsonify(id=ident,config=conf),201

    @bp.get('/case-template')
    def template():
        with w.store.tx() as db: actor(db,True)
        return jsonify(json.loads((Path(__file__).parent/'cases_r2.json').read_text()))

    @bp.post('/batches/<bid>/cases')
    def import_cases(bid):
        d=body()
        with w.store.tx() as db:
            u=actor(db,True)
            b=db.execute('SELECT * FROM batches WHERE id=?',(bid,)).fetchone()
            if not b: raise Rejected('batch_not_found',404)
            if b['state']!='draft' or db.execute('SELECT 1 FROM cases WHERE batch_id=?',(bid,)).fetchone(): raise Rejected('cases_already_frozen',409)
            records=d.get('cases')
            if not isinstance(records,list) or len(records)!=40: raise Rejected('exactly_40_confirmed_cases_required')
            codes={f'{a}{i:02d}' for a in 'ABCD' for i in range(1,11)}
            if {c.get('code') for c in records if isinstance(c,dict)}!=codes: raise Rejected('case_codes_must_be_A01_to_D10')
            if d.get('confirmed') is not True: raise Rejected('protocol_confirmation_required')
            records=sorted([{**c,'status':'planned'} for c in records],key=lambda c:c['code'])
            for c in records:
                if c.get('category')!=c['code'][0] or not all(c.get(k) for k in ('target','preconditions','steps','expected','scoring','call_requirement')): raise Rejected('incomplete_case')
                if c.get('chat_call_policy','CONDITIONAL') not in ('MUST_CALL','CONDITIONAL','NO_CALL_EXPECTED'): raise Rejected('invalid_call_policy')
                if not isinstance(c['steps'],list) or not all(isinstance(x,str) for x in c['steps']): raise Rejected('steps_required')
            for c in records:
                db.execute('INSERT INTO cases VALUES(?,?,?,?,?)',(audit.uid(),bid,c['code'],c['category'],audit.canonical({**c,'status':'planned'})))
            db.execute('UPDATE batches SET confirmed=1 WHERE id=?',(bid,))
            event(db,'protocol_confirmed',{'cases_sha256':audit.sha(records),'case_count':40,'source_sha256':d.get('source_sha256')},u,b=bid)
        return jsonify(ok=True)

    @bp.post('/batches/<bid>/assign')
    def assign(bid):
        d=body()
        with w.store.tx() as db:
            u=actor(db,True)
            b=db.execute('SELECT * FROM batches WHERE id=?',(bid,)).fetchone()
            if not b or b['state']!='draft': raise Rejected('draft_batch_required',409)
            if db.execute('SELECT 1 FROM sessions WHERE batch_id=?',(bid,)).fetchone(): raise Rejected('already_assigned',409)
            executors,raters=d.get('executors'),d.get('raters')
            if not isinstance(executors,list) or len(executors)!=2 or len(set(executors))!=2 or not isinstance(raters,list) or len(raters)!=2 or len(set(raters))!=2 or set(executors)&set(raters): raise Rejected('two_testers_and_two_distinct_independent_raters_required')
            for ident in executors+raters:
                if not db.execute("SELECT 1 FROM users WHERE id=? AND role='executor' AND enabled=1",(ident,)).fetchone(): raise Rejected('enabled_executor_accounts_required')
            cases=db.execute('SELECT * FROM cases WHERE batch_id=? ORDER BY code',(bid,)).fetchall()
            if len(cases)!=40: raise Rejected('confirmed_40_cases_required')
            for i,c in enumerate(cases):
                sid=audit.uid(); tester=executors[i%2]
                db.execute('INSERT INTO sessions(id,batch_id,case_id,executor_id,profile,raters) VALUES(?,?,?,?,?,?)',
                           (sid,bid,c['id'],tester,audit.canonical({'name':'虚拟测试者','age':7}),audit.canonical(raters)))
                event(db,'state_change',{'from':None,'to':'assigned','reason':'balanced_case_assignment','executor_id':tester,'raters':raters},u,s={'id':sid,'batch_id':bid})
        return jsonify(ok=True,count=40)

    @bp.patch('/batches/<bid>')
    def batch_state(bid):
        d=body()
        with w.store.tx() as db:
            u=actor(db,True); b=db.execute('SELECT * FROM batches WHERE id=?',(bid,)).fetchone()
            if not b: raise Rejected('batch_not_found',404)
            target=d.get('state')
            if not d.get('reason') or target not in ('enabled','stopped'): raise Rejected('state_and_reason_required')
            if target=='enabled':
                if b['state']!='draft': raise Rejected('stopped_batches_cannot_restart_create_new_batch',409)
                if not b['confirmed'] or db.execute('SELECT count(*) FROM sessions WHERE batch_id=?',(bid,)).fetchone()[0]!=40: raise Rejected('complete_assignment_required',409)
                if json.loads(b['config'])!=snapshot(): raise Rejected('configuration_changed_create_new_batch',409)
                if b['kind']=='formal':
                    w.formal_gate()
                    if not isinstance(d.get('freeze_evidence'),dict) or not re.fullmatch('[0-9a-f]{64}',d['freeze_evidence'].get('sha256','')) or not d['freeze_evidence'].get('reference'): raise Rejected('signed_freeze_evidence_required')
            db.execute('UPDATE batches SET state=? WHERE id=?',(target,bid))
            event(db,'batch_state',{'from':b['state'],'to':target,'reason':d['reason'],'freeze_evidence':d.get('freeze_evidence')},u,b=bid)
        return jsonify(ok=True)

    @bp.get('/sessions')
    def sessions():
        with w.store.tx() as db:
            u=actor(db)
            rows=db.execute('SELECT s.*,c.code,c.category,b.name AS batch_name,b.kind AS batch_kind FROM sessions s JOIN cases c ON c.id=s.case_id JOIN batches b ON b.id=s.batch_id ORDER BY b.created DESC,c.code').fetchall()
            visible=[dict(s) for s in rows if u['role']=='admin' or s['executor_id']==u['id'] or u['id'] in json.loads(s['raters'])]
            return jsonify(sessions=visible)

    @bp.get('/sessions/<sid>')
    def details(sid):
        with w.store.tx() as db:
            u=actor(db); s=w.session(db,sid,u,rater=True)
            turns=[dict(r) for r in db.execute('SELECT * FROM turns WHERE session_id=? ORDER BY turn_no',(sid,))]
            ratings=[dict(r) for r in db.execute('SELECT * FROM ratings WHERE session_id=?',(sid,))]
            # A submitted first rating remains private until both independent ratings exist.
            ratings=[r for r in ratings if len(ratings)==2 or r['rater_id']==u['id']]
            observations=[dict(r) for r in db.execute('SELECT * FROM observations WHERE session_id=?',(sid,))]
            if u['role']!='admin':
                for t in turns: t.pop('attempts',None)
                if s['executor_id']!=u['id']: observations=[]
            return jsonify(session=s,turns=turns,observations=observations,ratings=ratings,
                           decisions=[dict(r) for r in db.execute('SELECT * FROM decisions WHERE session_id=?',(sid,))],
                           events=[dict(r) for r in db.execute('SELECT * FROM events WHERE session_id=? ORDER BY seq',(sid,))] if u['role']=='admin' else [])

    @bp.post('/sessions/<sid>/admit')
    def admit(sid):
        d=body(); mode=os.environ.get('EXPERIMENT_HUMAN_VERIFICATION','supervised')
        with w.store.tx() as db:
            u=actor(db); s=w.session(db,sid,u)
            if s['batch_state']!='enabled' or s['state'] not in ('assigned','ready','in_progress'): raise Rejected('session_not_admissible',409)
            if mode=='supervised':
                if u['role']!='admin' or not isinstance(d.get('reason'),str) or len(d['reason'].strip())<10: raise Rejected('administrator_supervision_reason_required',403)
                evidence={'mode':mode,'reason':d['reason'],'claim':'supervisor_attestation_not_human_proof'}
            elif mode=='turnstile':
                if s['executor_id']!=u['id']: raise Rejected('executor_verification_required',403)
                secret=os.environ.get('TURNSTILE_SECRET_KEY'); hostnames=os.environ.get('TURNSTILE_HOSTNAMES','').split(',')
                token=d.get('turnstile_token')
                if not secret or not any(hostnames) or not isinstance(token,str) or not 1<=len(token)<=2048: raise Rejected('verification_not_configured_or_missing',503)
                if not w.store.rate(db,'verification:'+u['id'],10,600): w.reject(db,'verification_rate_limit',429,user=u['id'],session=sid)
                try:
                    verification=requests.post('https://challenges.cloudflare.com/turnstile/v0/siteverify',data={'secret':secret,'response':token},timeout=8)
                    verification.raise_for_status()
                    result=verification.json()
                except (requests.RequestException,ValueError):
                    w.reject(db,'verification_unavailable',503,user=u['id'],session=sid)
                if not isinstance(result,dict) or result.get('success') is not True or result.get('hostname') not in hostnames or result.get('action')!='experiment_admit': w.reject(db,'verification_failed',403,user=u['id'],session=sid)
                evidence={'mode':mode,'hostname':result.get('hostname'),'action':result.get('action'),'challenge_ts':result.get('challenge_ts'),'claim':'challenge_passed_not_human_proof'}
            else: raise Rejected('verification_mode_invalid',503)
            state='ready' if s['state']=='assigned' else s['state']
            db.execute('UPDATE sessions SET admitted_until=?,state=? WHERE id=?',(time.time()+3600,state,sid))
            event(db,'admission',evidence,u,s)
            if state!=s['state']: event(db,'state_change',{'from':s['state'],'to':state,'reason':'admission_granted'},u,s)
        return jsonify(ok=True)

    @bp.post('/sessions/<sid>/nonce')
    def nonce(sid):
        with w.store.tx() as db:
            u=actor(db); s=w.session(db,sid,u,write=True)
            return jsonify(w.nonce(db,s,u,body().get('scope','chat')))

    @bp.post('/sessions/<sid>/observations')
    def observe(sid):
        d=body()
        if set(d)-{'note','evidence','deviation','manual_declaration'} or not isinstance(d.get('note',''),str) or len(d.get('note',''))>4000: raise Rejected('invalid_manual_observation')
        for ref in d.get('evidence',[]):
            if not isinstance(ref,dict) or not re.fullmatch('[0-9a-f]{64}',ref.get('sha256','')) or not isinstance(ref.get('reference'),str): raise Rejected('evidence_reference_and_sha256_required')
        if audit.redact(d)!=d: raise Rejected('sensitive_data_not_allowed')
        with w.store.tx() as db:
            u=actor(db); s=w.session(db,sid,u,write=True)
            w.check_active(db,s,u)
            ident=audit.uid(); now=time.time()
            db.execute('INSERT INTO observations VALUES(?,?,?,?,?)',(ident,sid,u['id'],now,audit.canonical(d)))
            event(db,'manual_observation',{'observation_id':ident,'payload':d},u,s)
        return jsonify(id=ident),201

    @bp.post('/sessions/<sid>/ui-events')
    def ui_event(sid):
        d=body()
        allowed={'ui_render','frontend_error','stt_start','stt_text','tts_start','tts_end','tts_cancel','tts_browser_fallback','tts_error','vrm_loaded','vrm_error','sticker_selected','page_resume','scenario_change'}
        if d.get('type') not in allowed or set(d)-{'type','turn_id','text','detail'} or len(audit.canonical(d))>6000 or audit.redact(d)!=d: raise Rejected('invalid_ui_event')
        with w.store.tx() as db:
            u=actor(db); s=w.session(db,sid,u,write=True)
            w.check_active(db,s,u)
            if not w.store.rate(db,'ui:'+u['id'],120,60): w.reject(db,'ui_event_rate_limit',429,user=u['id'],session=sid)
            w.consume(db,s,u,request.headers.get('X-Experiment-Nonce',''),'ui',audit.uid())
            tid=d.get('turn_id')
            if tid and not db.execute('SELECT 1 FROM turns WHERE id=? AND session_id=?',(tid,sid)).fetchone(): raise Rejected('turn_not_in_session',403)
            if d['type']=='ui_render':
                t=db.execute('SELECT * FROM turns WHERE id=? AND session_id=?',(tid,sid)).fetchone()
                if not t or not t['output'] or d.get('text')!=json.loads(t['output'])['reply']: raise Rejected('ui_reply_mismatch',409)
            w.store.event(db,d['type'],{'client_reported':True,**d},actor=u['id'],batch=s['batch_id'],session=sid,turn=tid)
        return jsonify(ok=True)

    @bp.post('/sessions/<sid>/interrupt')
    def interrupt(sid):
        d=body()
        with w.store.tx() as db:
            u=actor(db,True); s=w.session(db,sid,u)
            t=db.execute("SELECT * FROM turns WHERE session_id=? AND status='running'",(sid,)).fetchone()
            # Never steal an actively running upstream request. Worker timeout is 60s.
            if not t or time.time()-t['created']<120 or not d.get('reason'): raise Rejected('stale_request_and_reason_required',409)
            sends=[json.loads(r['data']) for r in db.execute("SELECT data FROM events WHERE turn_id=? AND kind='provider_send'",(t['id'],))]
            output={'reply':'本轮执行中断，原始证据已保留，请管理员复核。'}
            w.store.event(db,'interrupted',{'reason':d['reason'],'upstream_outcome':'unknown_do_not_auto_retry'},actor=u['id'],batch=s['batch_id'],session=sid,turn=t['id'])
            w.store.event(db,'business_response',{'output':output,'source':'unknown','reason':'worker_interrupted'},actor=u['id'],batch=s['batch_id'],session=sid,turn=t['id'])
            db.execute("UPDATE turns SET status='interrupted',source='unknown',model_called=?,output=?,attempts=?,completed=?,elapsed_ms=?,response_modified=0 WHERE id=?",
                       (bool(sends),audit.canonical(output),audit.canonical(sends),time.time(),(time.time()-t['created'])*1000,t['id']))
        return jsonify(ok=True)

    @bp.post('/sessions/<sid>/submit')
    def submit(sid):
        with w.store.tx() as db:
            u=actor(db); s=w.session(db,sid,u,write=True); w.check_active(db,s,u)
            if s['state']!='in_progress' or db.execute("SELECT 1 FROM turns WHERE session_id=? AND status='running'",(sid,)).fetchone(): raise Rejected('finished_execution_required',409)
            obs=[json.loads(r['payload']) for r in db.execute('SELECT payload FROM observations WHERE session_id=?',(sid,))]
            if not any(o.get('manual_declaration') is True and o.get('evidence') for o in obs): raise Rejected('recording_evidence_and_manual_attestation_required',409)
            db.execute("UPDATE sessions SET state='submitted',admitted_until=NULL WHERE id=?",(sid,))
            event(db,'state_change',{'from':s['state'],'to':'submitted','reason':'executor_submitted'},u,s)
        return jsonify(ok=True)

    @bp.post('/sessions/<sid>/invalidate')
    def invalidate(sid):
        d=body()
        with w.store.tx() as db:
            u=actor(db,True); s=w.session(db,sid,u)
            if not isinstance(d.get('reason'),str) or not d['reason'].strip(): raise Rejected('reason_required')
            db.execute("UPDATE sessions SET state='invalid',admitted_until=NULL WHERE id=?",(sid,))
            event(db,'state_change',{'from':s['state'],'to':'invalid','reason':d['reason']},u,s)
        return jsonify(ok=True)

    @bp.post('/sessions/<sid>/ratings')
    def rate(sid):
        d=body(); dims={'T','R','U','S','E'}
        if audit.redact(d)!=d: raise Rejected('sensitive_data_not_allowed')
        if set(d)-{'scores','basis','evidence_refs','evaluation','metrics'} or not isinstance(d.get('scores'),dict) or set(d['scores'])!=dims or any(v is not None and (type(v) is not int or v not in (0,1,2)) for v in d['scores'].values()) or not d.get('basis') or not d.get('evidence_refs') or d.get('evaluation') not in ('evaluable','insufficient_evidence','not_implemented','not_executed'): raise Rejected('complete_independent_rating_required')
        validate_metrics(d.get('metrics',{}))
        with w.store.tx() as db:
            u=actor(db); s=w.session(db,sid,u,rater=True)
            if u['id'] not in json.loads(s['raters']) or s['state']!='submitted': raise Rejected('assigned_independent_rater_required',403)
            if db.execute('SELECT 1 FROM ratings WHERE session_id=? AND rater_id=?',(sid,u['id'])).fetchone(): raise Rejected('rating_already_submitted_immutable',409)
            ident=audit.uid()
            db.execute('INSERT INTO ratings VALUES(?,?,?,?,?)',(ident,sid,u['id'],time.time(),audit.canonical(d)))
            event(db,'rating_submitted',{'rating_id':ident,'payload_sha256':audit.sha(d)},u,s)
        return jsonify(ok=True)

    @bp.post('/sessions/<sid>/review')
    def review(sid):
        d=body(); validate_metrics(d.get('metrics',{}))
        if set(d)-{'reason','evidence_refs','scores','metrics'} or audit.redact(d)!=d: raise Rejected('invalid_review_fields')
        if not isinstance(d.get('reason'),str) or not d['reason'].strip() or not d.get('evidence_refs'): raise Rejected('review_basis_required')
        scores=d.get('scores')
        if not isinstance(scores,dict) or set(scores)!={'T','R','U','S','E'} or any(v is not None and (type(v) is not int or v not in (0,1,2)) for v in scores.values()): raise Rejected('final_scores_required')
        with w.store.tx() as db:
            u=actor(db,True); s=w.session(db,sid,u)
            if s['state']!='submitted' or db.execute('SELECT count(*) FROM ratings WHERE session_id=?',(sid,)).fetchone()[0]!=2: raise Rejected('two_submitted_ratings_required',409)
            ident=audit.uid()
            db.execute('INSERT INTO decisions VALUES(?,?,?,?,?)',(ident,sid,u['id'],time.time(),audit.canonical(d)))
            db.execute("UPDATE sessions SET state='reviewed' WHERE id=?",(sid,))
            event(db,'state_change',{'from':'submitted','to':'reviewed','reason':d['reason'],'decision_id':ident},u,s)
        return jsonify(ok=True)

    @bp.post('/risks/<eid>/review')
    def review_risk(eid):
        d=body()
        with w.store.tx() as db:
            u=actor(db,True)
            if not d.get('reason') or not db.execute("SELECT 1 FROM events WHERE id=? AND kind='risk'",(eid,)).fetchone(): raise Rejected('risk_and_review_reason_required')
            event(db,'risk_review',{'event_id':eid,'reason':d['reason']},u)
        return jsonify(ok=True)

    @bp.get('/risks')
    def all_risks():
        with w.store.tx() as db:
            actor(db,True)
            return jsonify(risks=[dict(r) for r in db.execute("SELECT * FROM events WHERE kind IN ('risk','risk_review') ORDER BY seq DESC LIMIT 1000")])

    @bp.get('/batches/<bid>/verify')
    def verify(bid):
        with w.store.tx() as db:
            actor(db,True)
            return jsonify(w.store.verify(db,bid))

    @bp.get('/batches/<bid>/summary')
    def summary(bid):
        with w.store.tx() as db:
            actor(db,True)
            return jsonify(summarize(db,bid))

    @bp.get('/batches/<bid>/export')
    def export(bid):
        with w.store.tx() as db:
            u=actor(db,True)
            if not db.execute('SELECT 1 FROM batches WHERE id=?',(bid,)).fetchone(): raise Rejected('batch_not_found',404)
            event(db,'export',{'batch_id':bid},u,b=bid)
        return export_zip(w,bid)

    if limiter is not None: limiter.exempt(bp)
    app.register_blueprint(bp)
    # Both HTTP routes execute the SAME registered application function.
    original=app.view_functions['api_chat']
    @wraps(original)
    def chat_route():
        if not experiment_request(): return original()
        try:
            sid=request.headers.get('X-Experiment-Session','')
            s,u,t,replay=w.reserve(request.headers.get('Authorization',''),sid,request.headers.get('X-Experiment-Nonce',''),request.headers.get('Idempotency-Key',''),body())
            if replay: result=json.loads(t['output'])
            else:
                from ai_service import chat
                trace=audit.Trace(w.store.emit(actor=u['id'],batch=s['batch_id'],session=sid,turn=t['id']),
                                  mode='LIVE' if s['batch_kind']!='automated' and not app.testing else 'MOCK')
                start=time.monotonic()
                with audit.tracing(trace):
                    result=chat(w.messages(s,body()['text']),scenario=body().get('scenario','supermarket'))
                result=audit.redact(result)
                w.complete(s,u,t,trace,result,round((time.monotonic()-start)*1000,3))
            result={**result,'_experiment':{'experiment_id':s['batch_id'],'session_id':sid,'turn_id':t['id'],
                    'request_id':t['request_id'],'trace_id':t['trace_id'],'turn_no':t['turn_no'],'idempotent_replay':replay}}
            response=jsonify(result); response.headers['Cache-Control']='no-store'; return response
        except Rejected as e: return jsonify(error=e.message),e.status
    app.view_functions['api_chat']=chat_route

    # STT/TTS maintain original codecs, providers and fallbacks. Their evidence is NOT LLM evidence.
    for name,scope in [('api_stt','stt'),('api_tts','tts')]:
        app.view_functions[name]=media_wrapper(w,app.view_functions[name],scope)

def experiment_request():
    return bool(request.headers.get('X-Experiment-Session') or request.headers.get('Authorization','').startswith('Experiment ') or request.headers.get('X-Experiment-Nonce'))


METRICS={'task_completion','key_steps','state_change','stt_success','tts_success','vrm_feedback','error_recovery'}

def validate_metrics(metrics):
    if not isinstance(metrics,dict) or set(metrics)-METRICS: raise Rejected('unknown_metric')
    for value in metrics.values():
        if value is None: continue
        if not isinstance(value,dict) or set(value)!={'numerator','denominator'} or any(type(value[k]) is not int for k in value) or not 0<=value['numerator']<=value['denominator']: raise Rejected('invalid_metric_denominator')


def media_wrapper(w,fn,scope):
    @wraps(fn)
    def wrapped():
        if not experiment_request(): return fn()
        try:
            sid=request.headers.get('X-Experiment-Session','')
            with w.store.tx() as db:
                u=w.auth(db,request.headers.get('Authorization','')); s=w.session(db,sid,u,write=True); w.check_active(db,s,u)
                if not w.store.rate(db,scope+':'+u['id'],30,60): w.reject(db,'media_rate_limit',429,user=u['id'],session=sid)
                rid=audit.uid()
                w.consume(db,s,u,request.headers.get('X-Experiment-Nonce',''),scope,rid)
                w.store.event(db,scope+'_request',{'service':'tencent','request_id':rid,'associated_turn_no':s['turn_no'],
                    'text':(request.get_json(silent=True) or {}).get('text') if scope=='tts' else None},
                    actor=u['id'],batch=s['batch_id'],session=sid)
            start=time.monotonic(); response=w.app.make_response(fn())
            # Binary audio stays out of the DB; response hash indexes actual bytes.
            if response.direct_passthrough: response.direct_passthrough=False
            raw=response.get_data()
            with w.store.tx() as db:
                w.store.event(db,scope+'_result',{'request_id':rid,'http_status':response.status_code,
                     'response_sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),
                     'text':response.get_json(silent=True),'elapsed_ms':round((time.monotonic()-start)*1000,3),
                     'proof_scope':'business_service_response_not_provider_receipt'},actor=u['id'],batch=s['batch_id'],session=sid)
            response.headers['Cache-Control']='no-store'; return response
        except Rejected as e: return jsonify(error=e.message),e.status
    return wrapped


def summarize(db,bid):
    sessions=[dict(r) for r in db.execute('SELECT * FROM sessions WHERE batch_id=?',(bid,))]
    turns=[dict(r) for r in db.execute('SELECT * FROM turns WHERE batch_id=?',(bid,))]
    attempts=[a for t in turns for a in json.loads(t['attempts'] or '[]')]
    live=[a for a in attempts if a['mode']=='LIVE']
    successes=sum(a['status']=='success' for a in live)
    metrics={}
    for name in METRICS:
        values=[]
        for s in sessions:
            if s['state']!='reviewed': continue
            row=db.execute('SELECT payload FROM decisions WHERE session_id=? ORDER BY created DESC LIMIT 1',(s['id'],)).fetchone()
            val=json.loads(row['payload']).get('metrics',{}).get(name) if row else None
            if val is not None: values.append(val)
        numerator=sum(v['numerator'] for v in values); denominator=sum(v['denominator'] for v in values)
        metrics[name]={'numerator':numerator,'denominator':denominator,'rate':numerator/denominator if denominator else None,
                       'status':'reviewed_human_evidence' if denominator else 'unable_to_evaluate',
                       'formula':'sum(adjudicated_numerator)/sum(adjudicated_applicable_denominator)'}
    agreement={'equal':0,'applicable':0,'disagreements':[]}
    must_call={'executed':0,'upstream_success':0,'with_server_and_ui_evidence':0,'with_recording_index_and_attestation':0}
    for t in turns:
        ev=[dict(r) for r in db.execute('SELECT kind,data FROM events WHERE turn_id=?',(t['id'],))]
        entry=next((json.loads(r['data']) for r in ev if r['kind']=='backend_recv'),{})
        if entry.get('expected_call')!='MUST_CALL': continue
        must_call['executed']+=1
        if t['source']!='deepseek_api': continue
        must_call['upstream_success']+=1
        if not {'provider_send','provider_result','business_response','ui_render'}.issubset({r['kind'] for r in ev}): continue
        must_call['with_server_and_ui_evidence']+=1
        observations=[json.loads(r['payload']) for r in db.execute('SELECT payload FROM observations WHERE session_id=?',(t['session_id'],))]
        if any(o.get('manual_declaration') is True and o.get('evidence') for o in observations): must_call['with_recording_index_and_attestation']+=1
    for s in sessions:
        ratings=[json.loads(r['payload']) for r in db.execute('SELECT payload FROM ratings WHERE session_id=?',(s['id'],))]
        if len(ratings)!=2: continue
        for dim in ('T','R','U','S','E'):
            a,b=ratings[0]['scores'][dim],ratings[1]['scores'][dim]
            if a is None or b is None: continue
            agreement['applicable']+=1
            if a==b: agreement['equal']+=1
            else: agreement['disagreements'].append({'session_id':s['id'],'dimension':dim,'scores':[a,b]})
    return {'planned_sessions':len(sessions),'executed_sessions':sum(s['turn_no']>0 for s in sessions),
            'session_states':{state:sum(s['state']==state for s in sessions) for state in ('assigned','ready','in_progress','submitted','reviewed','invalid')},
            'turns':len(turns),'upstream_attempts':len(attempts),'live_attempts':len(live),'live_successes':successes,
            'live_errors':sum(a['status']=='error' for a in live),'model_call_success_rate':successes/len(live) if live else None,
            'sources':{source:sum(t['source']==source for t in turns) for source in ('deepseek_api','local_intercept','local_fallback','cache','mock','api_error','unknown')},
            'invalid_turns':sum(t['session_id'] in {s['id'] for s in sessions if s['state']=='invalid'} for t in turns),
            'metrics':metrics,'rater_agreement':agreement,
            'must_call':must_call,
            'must_call_server_evidence_rate':must_call['with_server_and_ui_evidence']/must_call['executed'] if must_call['executed'] else None,
            'must_call_evidence_note':'Server/UI/index counts are evidence availability, not independent authentication; CONDITIONAL turns need manual review. Invalid sessions remain in raw counts and are reported separately.'}


def export_zip(w,bid):
    with w.store.tx(read=True) as db:
        data={}
        for table in ('batches','cases','sessions','turns'):
            key='id' if table=='batches' else 'batch_id'
            data[table]=[dict(r) for r in db.execute(f'SELECT * FROM {table} WHERE {key}=?',(bid,))]
        data['events']=[dict(r) for r in db.execute('SELECT * FROM events ORDER BY seq')]
        # Include the global chain (other batches too) only in an ADMIN restricted archive.
        # No auth tokens, nonce values, password hashes or users table are exported.
        for table in ('observations','decisions'):
            data[table]=[dict(r) for r in db.execute(f'SELECT x.* FROM {table} x JOIN sessions s ON x.session_id=s.id WHERE s.batch_id=?',(bid,))]
        data['ratings']=[dict(r) for r in db.execute('SELECT r.* FROM ratings r JOIN sessions s ON s.id=r.session_id WHERE s.batch_id=? AND (SELECT count(*) FROM ratings z WHERE z.session_id=s.id)=2',(bid,))]
        data['summary']=summarize(db,bid); data['integrity']=w.store.verify(db,bid)
    files={}
    for name,rows in data.items():
        files[name+'.json']=json.dumps(rows,ensure_ascii=False,indent=2).encode()
        if isinstance(rows,list):
            files[name+'.jsonl']=(''.join(audit.canonical(row)+'\n' for row in rows)).encode()
            if rows and name!='events':
                output=io.StringIO(); writer=csv.DictWriter(output,fieldnames=list(rows[0])); writer.writeheader()
                for row in rows:
                    # Guard spreadsheet formulas in free-form fields.
                    writer.writerow({k:("'"+str(v) if str(v).lstrip().startswith(('=','+','-','@')) else v) for k,v in row.items()})
                files[name+'.csv']=('\ufeff'+output.getvalue()).encode()
    files['README.txt']=('管理员受控导出；含完整system提示和原始文本，请勿公开。事件链包含全部批次以验证连续性。\n'
        '未提交的独立评分不导出。哈希只证明本次快照的内部一致性，不证明真人或提供商独立认证。\n'
        '正式、试运行、自动测试的kind不可混合统计。视频为外部证据索引，需另行核对文件。\n').encode()
    files['manifest.json']=json.dumps({name:hashlib.sha256(blob).hexdigest() for name,blob in files.items()},indent=2).encode()
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        for name,blob in files.items(): z.writestr(name,blob)
    out.seek(0)
    return send_file(out,mimetype='application/zip',download_name=f'experiment-{bid}.zip',as_attachment=True,max_age=0)
