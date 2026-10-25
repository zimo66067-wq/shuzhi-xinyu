"""SQLite on ONE persistent host. Transactions serialize reservations and hash chains."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import sqlite3
import time
from .audit import canonical, sha, uid, redact

SCHEMA = '''
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','executor')), enabled INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS auth (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 created REAL NOT NULL, expires REAL NOT NULL, fingerprint TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS batches (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('formal','pilot','automated')),
 state TEXT NOT NULL DEFAULT 'draft', config TEXT NOT NULL, config_hash TEXT NOT NULL,
 confirmed INTEGER NOT NULL DEFAULT 0, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS cases (
 id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES batches(id), code TEXT NOT NULL,
 category TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(batch_id,code));
CREATE TABLE IF NOT EXISTS sessions (
 id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES batches(id), case_id TEXT NOT NULL REFERENCES cases(id),
 executor_id TEXT NOT NULL REFERENCES users(id), state TEXT NOT NULL DEFAULT 'assigned',
 turn_no INTEGER NOT NULL DEFAULT 0, admitted_until REAL, profile TEXT NOT NULL,
 raters TEXT NOT NULL, UNIQUE(batch_id,case_id));
CREATE TABLE IF NOT EXISTS nonces (
 token_hash TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), user_id TEXT NOT NULL,
 turn_no INTEGER NOT NULL, scope TEXT NOT NULL, issued REAL NOT NULL, expires REAL NOT NULL,
 consumed_by TEXT);
CREATE TABLE IF NOT EXISTS turns (
 id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, trace_id TEXT UNIQUE NOT NULL,
 batch_id TEXT NOT NULL REFERENCES batches(id), session_id TEXT NOT NULL REFERENCES sessions(id),
 executor_id TEXT NOT NULL, turn_no INTEGER NOT NULL, body_hash TEXT NOT NULL, input TEXT NOT NULL,
 status TEXT NOT NULL, source TEXT, model_called INTEGER, output TEXT, attempts TEXT,
 created REAL NOT NULL, completed REAL, elapsed_ms REAL, response_modified INTEGER,
 UNIQUE(session_id,turn_no));
CREATE UNIQUE INDEX IF NOT EXISTS one_running_turn ON turns(session_id) WHERE status='running';
CREATE TABLE IF NOT EXISTS events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, batch_id TEXT, session_id TEXT,
 turn_id TEXT, actor_id TEXT NOT NULL, kind TEXT NOT NULL, utc_time REAL NOT NULL,
 data TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS observations (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), actor_id TEXT NOT NULL,
 created REAL NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ratings (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), rater_id TEXT NOT NULL REFERENCES users(id),
 created REAL NOT NULL, payload TEXT NOT NULL, UNIQUE(session_id,rater_id));
CREATE TABLE IF NOT EXISTS decisions (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), actor_id TEXT NOT NULL,
 created REAL NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS limits (id TEXT PRIMARY KEY, started REAL NOT NULL, count INTEGER NOT NULL);
'''
APPEND_ONLY = ('events', 'observations', 'ratings', 'decisions', 'cases')


class Store:
    def __init__(self, path):
        self.path = str(Path(path).resolve())
        Path(self.path).parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self.connect() as db:
            db.executescript(SCHEMA)
            for table in APPEND_ONLY:
                for op in ('UPDATE', 'DELETE'):
                    db.execute(f"CREATE TRIGGER IF NOT EXISTS immutable_{table}_{op} BEFORE {op} ON {table} "
                               "BEGIN SELECT RAISE(ABORT, 'append only'); END")
            db.executescript('''
CREATE TRIGGER IF NOT EXISTS complete_turn_immutable BEFORE UPDATE ON turns
 WHEN OLD.status != 'running' BEGIN SELECT RAISE(ABORT, 'completed turn immutable'); END;
CREATE TRIGGER IF NOT EXISTS turn_no_delete BEFORE DELETE ON turns
 BEGIN SELECT RAISE(ABORT, 'append only'); END;
''')
        os.chmod(self.path, 0o600)

    def connect(self):
        db = sqlite3.connect(self.path, timeout=15, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('PRAGMA busy_timeout=15000')
        return db

    @contextmanager
    def tx(self, read=False):
        db = self.connect()
        try:
            db.execute('BEGIN' if read else 'BEGIN IMMEDIATE')
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def event(self, db, kind, data, actor='system', batch=None, session=None, turn=None):
        prev = db.execute('SELECT hash FROM events ORDER BY seq DESC LIMIT 1').fetchone()
        item = dict(id=uid(), batch_id=batch, session_id=session, turn_id=turn,
                    actor_id=actor, kind=kind, utc_time=time.time(), data=redact(data),
                    prev_hash=prev['hash'] if prev else '0' * 64)
        digest = sha(item)
        db.execute('INSERT INTO events(id,batch_id,session_id,turn_id,actor_id,kind,utc_time,data,prev_hash,hash) '
                   'VALUES(?,?,?,?,?,?,?,?,?,?)',
                   (item['id'], batch, session, turn, actor, kind, item['utc_time'], canonical(item['data']), item['prev_hash'], digest))
        return {'event_id': item['id'], 'sha256': sha(item['data']), 'chain_hash': digest}

    def emit(self, **ids):
        def write(kind, data):
            with self.tx() as db:
                return self.event(db, kind, data, **ids)
        return write

    def rate(self, db, identity, maximum, seconds):
        now = time.time()
        row = db.execute('SELECT * FROM limits WHERE id=?', (identity,)).fetchone()
        if not row or now - row['started'] >= seconds:
            db.execute('INSERT OR REPLACE INTO limits VALUES(?,?,1)', (identity, now))
            return True
        if row['count'] >= maximum:
            return False
        db.execute('UPDATE limits SET count=count+1 WHERE id=?', (identity,))
        return True

    def verify(self, db, batch=None):
        errors, prev, total = [], '0' * 64, 0
        for row in db.execute('SELECT * FROM events ORDER BY seq'):
            item = dict(row)
            item.pop('seq')
            digest = item.pop('hash')
            item['data'] = json.loads(item['data'])
            if item['prev_hash'] != prev or sha(item) != digest:
                errors.append({'event_id': item['id'], 'error': 'hash_chain_mismatch'})
            prev, total = digest, total + 1
        turns = db.execute('SELECT * FROM turns' + (' WHERE batch_id=?' if batch else ''), (batch,) if batch else ()).fetchall()
        for turn in turns:
            ev = [dict(r) for r in db.execute('SELECT * FROM events WHERE turn_id=?', (turn['id'],))]
            types = [e['kind'] for e in ev]
            data = [json.loads(e['data']) for e in ev if e['kind'] == 'provider_result']
            sends = [json.loads(e['data']) for e in ev if e['kind'] == 'provider_send']
            def err(reason): errors.append({'turn_id': turn['id'], 'error': reason})
            if turn['status'] == 'running': err('incomplete_turn_requires_review')
            if not {'backend_recv', 'business_response'}.issubset(types): err('missing_business_evidence')
            if turn['source'] == 'deepseek_api' and not any(d['status']=='success' for d in data): err('success_without_upstream_result')
            if turn['source'] == 'deepseek_api' and not any(d['mode']=='LIVE' for d in sends): err('success_without_live_send')
            if turn['source'] == 'local_intercept' and sends: err('intercept_with_upstream_send')
            if bool(turn['model_called']) != bool(sends): err('model_called_mismatch')
            if turn['completed'] and (turn['completed'] < turn['created'] or turn['elapsed_ms'] < 0): err('invalid_time')
            if len({x['attempt_id'] for x in sends}) != len(sends): err('duplicate_attempt_id')
            if len(sends) != len(data): err('incomplete_upstream_attempt')
            if {x['attempt_id'] for x in sends}!={x['attempt_id'] for x in data}: err('attempt_pairing_mismatch')
            if turn['attempts']:
                saved=json.loads(turn['attempts'])
                if len(saved)!=len(sends): err('attempt_summary_count_mismatch')
                for item in saved:
                    for refkey,kind in (('request_evidence','provider_send'),('response_evidence','provider_result')):
                        ref=item.get(refkey)
                        evidence=next((e for e in ev if ref and e['id']==ref.get('event_id') and e['kind']==kind),None)
                        if not evidence or sha(json.loads(evidence['data']))!=ref.get('sha256'): err('broken_evidence_reference')
            batch_row = db.execute('SELECT * FROM batches WHERE id=?', (turn['batch_id'],)).fetchone()
            config = json.loads(batch_row['config'])
            for send in sends:
                p = send['payload']
                if any(p.get(k) != config['llm'][k] for k in ('model', 'temperature', 'max_tokens')): err('config_mismatch')
            for result in data:
                if result['status']=='success' and not (result.get('http_status') and 200<=result['http_status']<300): err('success_with_invalid_http_status')
                if result.get('elapsed_ms') is not None and result['elapsed_ms']<0: err('invalid_attempt_elapsed_time')
                if result.get('model_returned') and result['model_returned']!=config['llm']['model']: err('returned_model_differs_requires_review')
                if result.get('ended_at') and not any(x['attempt_id']==result['attempt_id'] and x['started_at']<=result['ended_at'] for x in sends): err('attempt_time_mismatch')
            if turn['status'] != 'running':
                finals = [json.loads(e['data']) for e in ev if e['kind']=='business_response']
                if len(finals)!=1 or finals[0].get('output')!=json.loads(turn['output']): err('business_output_mismatch')
                acks = [json.loads(e['data']) for e in ev if e['kind']=='ui_render']
                if not acks: err('missing_ui_render_ack')
        batches=db.execute('SELECT * FROM batches' + (' WHERE id=?' if batch else ''),(batch,) if batch else ()).fetchall()
        for b in batches:
            if sha(json.loads(b['config']))!=b['config_hash']: errors.append({'batch_id':b['id'],'error':'config_hash_mismatch'})
            protocol=db.execute("SELECT data FROM events WHERE batch_id=? AND kind='protocol_confirmed'",(b['id'],)).fetchone()
            records=[json.loads(r['payload']) for r in db.execute('SELECT payload FROM cases WHERE batch_id=? ORDER BY code',(b['id'],))]
            if protocol and sha(records)!=json.loads(protocol['data'])['cases_sha256']: errors.append({'batch_id':b['id'],'error':'protocol_hash_mismatch'})
        return {'ok': not errors, 'errors': errors, 'events_checked': total, 'turns_checked': len(turns),
                'chain_head': prev, 'proof_scope': 'server_records_only_not_provider_or_human_proof'}
