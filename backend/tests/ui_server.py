"""Isolated browser QA server. Never run against a formal database."""
import os
import sys
from pathlib import Path
import tempfile
sys.path.insert(0,str(Path(__file__).parents[1]))
qa_root=Path(tempfile.mkdtemp(prefix='xinyu-browser-qa-'))
os.environ['EXPERIMENT_ENABLED']='1'
os.environ['EXPERIMENT_ENV']='automated'
os.environ['EXPERIMENT_DB']=str(qa_root/'qa.sqlite3')
os.environ['EXPERIMENT_HUMAN_VERIFICATION']='supervised'
os.environ.pop('DEEPSEEK_API_KEY',None)
from werkzeug.security import generate_password_hash
from app import app
from experiment.audit import uid
app.config.update(TESTING=True,RATELIMIT_ENABLED=False)
w=app.extensions['experiment']
# Deliberately synthetic QA credentials, only this temporary local server.
with w.store.tx() as db:
    for name in ('captain','tester1','tester2','rater1','rater2'):
        db.execute('INSERT INTO users(id,username,password_hash,role) VALUES(?,?,?,?)',(uid(),name,generate_password_hash('qa-browser-only-12345'),'admin' if name=='captain' else 'executor'))
        w.store.event(db,'qa_bootstrap',{'name':name,'kind':'automated'})
client=app.test_client()
h={'Authorization':'Experiment '+client.post('/api/experiment/login',json={'username':'captain','password':'qa-browser-only-12345'}).json['token']}
users=client.get('/api/experiment/users',headers=h).json['users']; ids={u['username']:u['id'] for u in users}
bid=client.post('/api/experiment/batches',headers=h,json={'name':'SYNTHETIC BROWSER QA — 非人工实验','kind':'automated'}).json['id']
plan=client.get('/api/experiment/case-template',headers=h).json
assert client.post(f'/api/experiment/batches/{bid}/cases',headers=h,json={**plan,'confirmed':True}).status_code==200
assert client.post(f'/api/experiment/batches/{bid}/assign',headers=h,json={'executors':[ids['tester1'],ids['tester2']],'raters':[ids['rater1'],ids['rater2']]}).status_code==200
assert client.patch(f'/api/experiment/batches/{bid}',headers=h,json={'state':'enabled','reason':'Isolated browser QA'}).status_code==200
sessions=client.get('/api/experiment/sessions',headers=h).json['sessions']
assert client.post(f"/api/experiment/sessions/{sessions[0]['id']}/admit",headers=h,json={'reason':'SYNTHETIC QA GRANT, NOT HUMAN SUPERVISION'}).status_code==200
print('QA server uses a fresh temporary database. Zero formal records. No real API key.')
app.run(host='127.0.0.1',port=5000,debug=False,use_reloader=False)
