"""Service-side authorization and state transitions; never trust client audit flags."""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time
from werkzeug.security import check_password_hash, generate_password_hash
from .audit import canonical, sha, uid, redact
from .store import Store

class Rejected(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def snapshot():
    root = Path(__file__).resolve().parents[2]
    version = os.environ.get('EXPERIMENT_SOFTWARE_COMMIT', '')
    dirty = None
    try:
        version = subprocess.check_output(['git','rev-parse','HEAD'], cwd=root, text=True, stderr=subprocess.DEVNULL).strip()
        dirty = bool(subprocess.check_output(['git','status','--porcelain','--untracked-files=no'], cwd=root, text=True))
    except (OSError, subprocess.CalledProcessError):
        pass
    prompts = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/'backend/prompts').glob('*.txt'))}
    # Actual llm_client constants; identity is intentionally absent from prompt config.
    return {'software_commit': version, 'working_tree_dirty': dirty,
            'llm': {'provider':'deepseek','model':'deepseek-chat','temperature':0.8,'max_tokens':500,
                    'timeout_seconds':25,'automatic_retries':0,'stream':False,
                    'endpoint':'https://api.deepseek.com/chat/completions'},
            'prompts_sha256':prompts, 'chat_history_window':20, 'max_user_chars':500,
            'admission_mode':os.environ.get('EXPERIMENT_HUMAN_VERIFICATION','supervised'),
            'stt':'tencent_asr', 'tts':'tencent_tts_or_browser', 'vrm':'/models/xinyu.vrm'}


class Workflow:
    def __init__(self, app):
        self.app = app
        path = app.config.get('EXPERIMENT_DB') or os.environ.get('EXPERIMENT_DB')
        if not path or path == ':memory:':
            raise ValueError('EXPERIMENT_DB must be an explicit file path')
        self.store = Store(path)

    def reject(self, db, message, status=400, user=None, session=None, batch=None):
        self.store.event(db, 'risk', {'reason':message}, actor=user or 'anonymous', session=session, batch=batch)
        db.commit()  # Preserve rejected-operation evidence without committing any prior mutations.
        raise Rejected(message, status)

    def auth(self, db, authorization, admin=False):
        token = authorization[11:] if authorization.startswith('Experiment ') else ''
        row = db.execute('SELECT users.* FROM auth JOIN users ON auth.user_id=users.id '
                         'WHERE token_hash=? AND expires>? AND enabled=1', (digest(token), time.time())).fetchone()
        if not row:
            self.reject(db,'experiment_auth_required',401)
        if admin and row['role'] != 'admin':
            self.reject(db,'admin_required',403,user=row['id'])
        return dict(row)

    def login(self, data, fingerprint):
        username, password = data.get('username'), data.get('password')
        if not isinstance(username,str) or not isinstance(password,str) or len(password)>256:
            raise Rejected('invalid_credentials',401)
        with self.store.tx() as db:
            if not self.store.rate(db, 'login:'+fingerprint, 10, 600) or not self.store.rate(db,'login-user:'+username,15,600):
                self.reject(db,'login_rate_limit',429)
            row = db.execute('SELECT * FROM users WHERE username=? AND enabled=1',(username,)).fetchone()
            # Perform the same expensive operation for missing users.
            fallback = generate_password_hash('no-such-user-password') if not row else row['password_hash']
            if not check_password_hash(fallback,password):
                self.reject(db,'invalid_credentials',401,user=row['id'] if row else None)
            token = secrets.token_urlsafe(40)
            now = time.time()
            if db.execute('SELECT 1 FROM auth WHERE user_id=? AND expires>? AND fingerprint<>?',
                          (row['id'],now,fingerprint)).fetchone():
                self.store.event(db,'risk',{'reason':'new_login_fingerprint'},actor=row['id'])
            db.execute('INSERT INTO auth VALUES(?,?,?,?,?)',(digest(token),row['id'],now,now+3600,fingerprint))
            self.store.event(db,'login',{'fingerprint_sha256':fingerprint},actor=row['id'])
            return {'token':token,'expires_at':now+3600,'user':{'id':row['id'],'username':username,'role':row['role']}}

    def session(self, db, sid, user, write=False, rater=False):
        row = db.execute('SELECT s.*, c.code, c.category, c.payload AS case_payload, b.state AS batch_state, '
                         'b.kind AS batch_kind, b.config, b.config_hash FROM sessions s JOIN cases c ON c.id=s.case_id '
                         'JOIN batches b ON b.id=s.batch_id WHERE s.id=?',(sid,)).fetchone()
        if not row:
            raise Rejected('session_not_found',404)
        s = dict(row)
        allowed = user['role']=='admin' or s['executor_id']==user['id'] or (rater and user['id'] in json.loads(s['raters']))
        if not allowed or (write and s['executor_id'] != user['id']):
            self.reject(db,'session_access_denied',403,user=user['id'],session=sid,batch=s['batch_id'])
        return s

    def check_active(self, db, s, user):
        if s['batch_state']!='enabled' or s['state'] not in ('ready','in_progress'):
            self.reject(db,'session_not_active',409,user=user['id'],session=s['id'],batch=s['batch_id'])
        if not s['admitted_until'] or s['admitted_until'] < time.time():
            self.reject(db,'admission_expired',403,user=user['id'],session=s['id'],batch=s['batch_id'])
        frozen, actual = json.loads(s['config']), snapshot()
        if frozen != actual:
            self.reject(db,'frozen_configuration_changed',409,user=user['id'],session=s['id'],batch=s['batch_id'])
        if s['batch_kind']=='formal':
            self.formal_gate()

    def formal_gate(self):
        p = Path(self.store.path).resolve()
        mount = Path(os.environ.get('EXPERIMENT_DURABLE_ROOT','/nonexistent')).resolve()
        if self.app.testing or os.environ.get('EXPERIMENT_ENV')!='formal':
            raise Rejected('formal_environment_required',409)
        if os.environ.get('VERCEL') or str(p).startswith(('/tmp/','/var/tmp/','/dev/shm/')):
            raise Rejected('ephemeral_storage_forbidden',409)
        if os.environ.get('EXPERIMENT_STORAGE_ACK')!='persistent-single-host' or not mount.is_dir() or not p.is_relative_to(mount):
            raise Rejected('persistent_volume_confirmation_required',409)
        if os.environ.get('EXPERIMENT_REPLICAS','1')!='1':
            raise Rejected('sqlite_multi_host_not_supported',409)
        if not os.environ.get('DEEPSEEK_API_KEY') or os.environ.get('DEEPSEEK_API_KEY','').startswith('sk-your-'):
            raise Rejected('live_key_not_configured',409)
        conf = snapshot()
        if not re.fullmatch(r'[0-9a-f]{40}',conf['software_commit']) or conf['working_tree_dirty'] is True:
            raise Rejected('clean_frozen_commit_required',409)

    def nonce(self, db, s, user, scope):
        self.check_active(db,s,user)
        if scope not in ('chat','stt','tts','ui'):
            raise Rejected('invalid_nonce_scope')
        if not self.store.rate(db,'nonce:'+user['id'],120,60):
            self.reject(db,'nonce_rate_limit',429,user=user['id'],session=s['id'])
        if db.execute("SELECT 1 FROM turns WHERE session_id=? AND status='running'",(s['id'],)).fetchone():
            self.reject(db,'concurrent_turn',409,user=user['id'],session=s['id'])
        token, now = secrets.token_urlsafe(40), time.time()
        db.execute('INSERT INTO nonces VALUES(?,?,?,?,?,?,?,NULL)',
                   (digest(token),s['id'],user['id'],s['turn_no']+1,scope,now,now+180))
        return {'nonce':token,'turn_no':s['turn_no']+1,'issued_at':now,'expires_at':now+180}

    def consume(self, db, s, user, token, scope, request_id):
        row = db.execute('SELECT * FROM nonces WHERE token_hash=?',(digest(token),)).fetchone()
        if not row or row['session_id']!=s['id'] or row['user_id']!=user['id'] or row['scope']!=scope:
            self.reject(db,'nonce_binding_mismatch',403,user=user['id'],session=s['id'])
        if row['consumed_by']:
            self.reject(db,'nonce_replayed',409,user=user['id'],session=s['id'])
        if row['expires'] < time.time():
            self.reject(db,'nonce_expired',409,user=user['id'],session=s['id'])
        if row['turn_no']!=s['turn_no']+1:
            self.reject(db,'turn_sequence_mismatch',409,user=user['id'],session=s['id'])
        db.execute('UPDATE nonces SET consumed_by=? WHERE token_hash=? AND consumed_by IS NULL',(request_id,digest(token)))

    def reserve(self, user_header, sid, nonce, request_id, data):
        if not isinstance(request_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,80}',request_id):
            raise Rejected('invalid_request_id')
        if not isinstance(data,dict) or set(data)-{'text','modality','scenario'}:
            raise Rejected('only_text_modality_and_scenario_accepted')
        text, modality = data.get('text'),data.get('modality','text')
        if not isinstance(text,str) or not text.strip() or len(text)>500 or modality not in ('text','voice','sticker'):
            raise Rejected('invalid_input')
        scenario=data.get('scenario','supermarket')
        if scenario not in (None,'supermarket'): raise Rejected('invalid_scenario')
        payload={'text':text,'modality':modality,'scenario':scenario}
        if redact(payload)!=payload: raise Rejected('sensitive_credentials_in_input_rejected')
        with self.store.tx() as db:
            user = self.auth(db,user_header)
            s = self.session(db,sid,user,write=True)
            prior = db.execute('SELECT * FROM turns WHERE request_id=?',(request_id,)).fetchone()
            if prior:
                binding=db.execute('SELECT consumed_by FROM nonces WHERE token_hash=?',(digest(nonce),)).fetchone()
                if prior['session_id']!=sid or prior['executor_id']!=user['id'] or prior['body_hash']!=sha(payload) or not binding or binding['consumed_by']!=request_id:
                    self.reject(db,'idempotency_conflict',409,user=user['id'],session=sid)
                if prior['status']=='running':
                    raise Rejected('request_in_progress_do_not_resend_with_new_id',409)
                return s,user,dict(prior),True
            self.check_active(db,s,user)
            if db.execute("SELECT 1 FROM turns WHERE session_id=? AND status='running'",(sid,)).fetchone():
                self.reject(db,'concurrent_turn',409,user=user['id'],session=sid)
            if not self.store.rate(db,'chat:'+user['id'],20,60):
                self.reject(db,'account_rate_limit',429,user=user['id'],session=sid)
            self.consume(db,s,user,nonce,'chat',request_id)
            n=s['turn_no']+1
            t={'id':uid(),'request_id':request_id,'trace_id':uid(),'created':time.time(),'turn_no':n}
            previous=db.execute('SELECT input FROM turns WHERE session_id=? ORDER BY turn_no DESC LIMIT 1',(sid,)).fetchone()
            if previous and json.loads(previous['input'])==payload:
                self.store.event(db,'risk',{'reason':'repeated_input_requires_review'},actor=user['id'],session=sid,batch=s['batch_id'])
            db.execute('INSERT INTO turns(id,request_id,trace_id,batch_id,session_id,executor_id,turn_no,body_hash,input,status,created) '
                       'VALUES(?,?,?,?,?,?,?,?,?,?,?)',(t['id'],request_id,t['trace_id'],s['batch_id'],sid,user['id'],n,sha(payload),canonical(payload),'running',t['created']))
            db.execute("UPDATE sessions SET turn_no=?,state='in_progress' WHERE id=?",(n,sid))
            if s['state']=='ready':
                self.store.event(db,'state_change',{'from':'ready','to':'in_progress','reason':'first_valid_turn'},actor=user['id'],batch=s['batch_id'],session=sid)
            self.store.event(db,'backend_recv',{'request_id':request_id,'trace_id':t['trace_id'],'input':payload,
                                              'expected_call':json.loads(s['case_payload']).get('chat_call_policy','CONDITIONAL'),
                                              'config_sha256':s['config_hash'],'software_commit':json.loads(s['config'])['software_commit']},
                             actor=user['id'],batch=s['batch_id'],session=sid,turn=t['id'])
            return s,user,t,False

    def messages(self, s, current_text):
        profile=json.loads(s['profile'])
        history=[{'role':'system','content':f"这个孩子叫{profile['name']}，{profile['age']}岁。请用这个名字称呼ta。"}]
        with self.store.tx(read=True) as db:
            for t in db.execute("SELECT input,output FROM turns WHERE session_id=? AND status='completed' ORDER BY turn_no",(s['id'],)):
                history += [{'role':'user','content':json.loads(t['input'])['text']},
                            {'role':'assistant','content':json.loads(t['output'])['reply']}]
        return history+[{'role':'user','content':current_text}]

    def complete(self,s,user,t,trace,output,elapsed):
        with self.store.tx() as db:
            self.store.event(db,'business_response',{'output':output,'source':trace.source,'reason':trace.reason,
                             'response_modified':trace.raw_content is not None and trace.raw_content!=output.get('reply')},
                             actor=user['id'],batch=s['batch_id'],session=s['id'],turn=t['id'])
            db.execute("UPDATE turns SET status='completed', source=?, model_called=?, output=?, attempts=?, completed=?, elapsed_ms=?, response_modified=? WHERE id=? AND status='running'",
                       (trace.source,bool(trace.attempts),canonical(output),canonical(trace.attempts),time.time(),elapsed,
                        trace.raw_content is not None and trace.raw_content!=output.get('reply'),t['id']))
