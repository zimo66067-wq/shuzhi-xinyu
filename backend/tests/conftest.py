"""All records are synthetic QA records in pytest's private temporary directory."""
import importlib
import json
from pathlib import Path
import sys
import uuid
import pytest
from werkzeug.security import generate_password_hash

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
PASSWORD='qa-password-only-12345'
PASSWORD_HASH=generate_password_hash(PASSWORD)

@pytest.fixture
def env(tmp_path, monkeypatch):
    # SQLite contract tests must not accidentally write to any linked Neon database.
    monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.delenv('EXPERIMENT_DATABASE_URL', raising=False)
    monkeypatch.setenv('EXPERIMENT_ENABLED','1')
    monkeypatch.setenv('EXPERIMENT_DB',str(tmp_path/'qa.sqlite3'))
    monkeypatch.setenv('EXPERIMENT_ENV','automated')
    monkeypatch.setenv('EXPERIMENT_HUMAN_VERIFICATION','supervised')
    monkeypatch.setenv('DEEPSEEK_API_KEY','qa-placeholder-not-real')
    import app as app_module
    app_module=importlib.reload(app_module)
    app=app_module.app
    app.config.update(TESTING=True, RATELIMIT_ENABLED=False)
    w=app.extensions['experiment']; client=app.test_client()
    ids={name:str(uuid.uuid4()) for name in ('captain','tester1','tester2','rater1','rater2')}
    with w.store.tx() as db:
        for name,ident in ids.items():
            db.execute('INSERT INTO users(id,username,password_hash,role) VALUES(?,?,?,?)',(ident,name,PASSWORD_HASH,'admin' if name=='captain' else 'executor'))
            w.store.event(db,'qa_account',{'name':name},actor=ident)
    headers={}
    for name in ids:
        response=client.post('/api/experiment/login',json={'username':name,'password':PASSWORD})
        assert response.status_code==200,response.json
        headers[name]={'Authorization':'Experiment '+response.json['token']}
    admin=headers['captain']
    response=client.post('/api/experiment/batches',headers=admin,json={'name':'SYNTHETIC-QA-NOT-HUMAN','kind':'automated'})
    assert response.status_code==201,response.json
    bid=response.json['id']
    template=client.get('/api/experiment/case-template',headers=admin).json
    assert client.post(f'/api/experiment/batches/{bid}/cases',headers=admin,json={**template,'confirmed':True}).status_code==200
    assert client.post(f'/api/experiment/batches/{bid}/assign',headers=admin,json={'executors':[ids['tester1'],ids['tester2']],'raters':[ids['rater1'],ids['rater2']]}).status_code==200
    assert client.patch(f'/api/experiment/batches/{bid}',headers=admin,json={'state':'enabled','reason':'synthetic QA initialization'}).status_code==200
    sessions=client.get('/api/experiment/sessions',headers=admin).json['sessions']
    sid=sessions[0]['id']
    assert client.post(f'/api/experiment/sessions/{sid}/admit',headers=admin,json={'reason':'Synthetic test grant; no human experiment was performed.'}).status_code==200
    return dict(app=app,client=client,w=w,ids=ids,headers=headers,bid=bid,sid=sid,sessions=sessions,module=app_module)


def nonce(e,scope='chat',sid=None,who='tester1'):
    sid=sid or e['sid']
    r=e['client'].post(f'/api/experiment/sessions/{sid}/nonce',headers=e['headers'][who],json={'scope':scope})
    assert r.status_code==200,r.json
    return {**e['headers'][who],'X-Experiment-Session':sid,'X-Experiment-Nonce':r.json['nonce'],'Idempotency-Key':str(uuid.uuid4())}


def send(e, text='你好，我想买面包', headers=None, **extra):
    return e['client'].post('/api/chat',headers=headers or nonce(e),json={'text':text,'modality':'text','scenario':'supermarket',**extra})
