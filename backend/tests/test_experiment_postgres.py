"""Isolated PostgreSQL evidence-store contract.

Run only against a DISPOSABLE database dedicated to CI/pilot data. These
tests do not call DeepSeek, do not simulate human trials, and never populate
a formal experiment batch.
"""
import concurrent.futures
import os
import uuid

import pytest

from experiment.postgres_store import PostgresStore


@pytest.fixture(scope="module")
def store():
    dsn = os.environ.get("PG_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("PG_TEST_DATABASE_URL is not configured (never use formal DB)")
    # Explicit opt-in prevents accidental writes to Neon research data.
    if os.environ.get("PG_TEST_ALLOW_WRITES") != "ci-only":
        pytest.skip("PG_TEST_ALLOW_WRITES=ci-only must be explicitly set")
    return PostgresStore(dsn)


def test_schema_and_sqlite_compatible_rows(store):
    with store.tx() as db:
        row = db.execute("SELECT 'ok' AS result, 42 AS value").fetchone()
        assert row["result"] == row[0] == "ok"
        assert row["value"] == row[1] == 42
        assert db.execute(
            "SELECT value FROM experiment_meta WHERE key='schema_version'"
        ).fetchone()[0] == "1"


def test_audit_chain_is_persistent_and_immutable(store):
    actor = "qa-" + uuid.uuid4().hex
    with store.tx() as db:
        e = store.event(db, "synthetic_pilot", {"synthetic": True}, actor=actor)
        assert e["chain_hash"]
    # Check through a separate PostgreSQL connection.
    with store.tx(read=True) as db:
        assert db.execute(
            "SELECT count(*) AS n FROM events WHERE actor_id=?", (actor,)
        ).fetchone()[0] == 1
        assert store.verify(db)["ok"]
    with pytest.raises(Exception):
        with store.tx() as db:
            db.execute(
                "UPDATE events SET kind='tampered' WHERE actor_id=?", (actor,)
            )
    with store.tx(read=True) as db:
        assert store.verify(db)["ok"]


def test_nonce_and_rate_limit_lock_semantics(store):
    scope = "pg-ci-" + uuid.uuid4().hex
    def operation(_):
        with store.tx() as db:
            return store.rate(db, scope, 4, 600)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        outcome = list(ex.map(operation, range(6)))
    assert sum(outcome) == 4
    with store.tx(read=True) as db:
        assert db.execute(
            "SELECT count FROM limits WHERE id=?", (scope,)
        ).fetchone()["count"] == 4
        assert store.verify(db)["ok"]


def test_protects_completed_turns_with_trigger(store):
    with store.tx(read=True) as db:
        rows = db.execute(
            "SELECT tgname FROM pg_trigger WHERE tgrelid='turns'::regclass AND NOT tgisinternal"
        ).fetchall()
    names = {r["tgname"] for r in rows}
    assert {"completed_turn_immutable", "turn_no_delete"} <= names


def test_postgres_full_experiment_api_and_upstream_evidence(store, monkeypatch):
    """40 planned cases and one synthetic HTTP/model turn through real Flask routing."""
    import importlib
    import json
    from unittest.mock import Mock
    from werkzeug.security import generate_password_hash
    from conftest import nonce, send, PASSWORD
    import llm_client

    monkeypatch.setenv('EXPERIMENT_ENABLED', '1')
    monkeypatch.setenv('EXPERIMENT_ENV', 'automated')
    monkeypatch.setenv('EXPERIMENT_DATABASE_URL', os.environ['PG_TEST_DATABASE_URL'])
    monkeypatch.setenv('EXPERIMENT_HUMAN_VERIFICATION', 'supervised')
    monkeypatch.setenv('DEEPSEEK_API_KEY', 'synthetic-ci-not-a-real-key')
    import app as app_module
    app_module = importlib.reload(app_module)
    app = app_module.app
    app.config.update(TESTING=True, RATELIMIT_ENABLED=False)
    client = app.test_client()
    w = app.extensions['experiment']

    suffix = uuid.uuid4().hex[:10]
    ids = {n: str(uuid.uuid4()) for n in ('captain', 'tester1', 'tester2', 'rater1', 'rater2')}
    with w.store.tx() as db:
        for name, user_id in ids.items():
            db.execute(
                'INSERT INTO users(id,username,password_hash,role) VALUES(?,?,?,?)',
                (user_id, name + '-' + suffix, generate_password_hash(PASSWORD),
                 'admin' if name == 'captain' else 'executor'))
            w.store.event(db, 'qa_account', {'synthetic': True}, actor=user_id)
    headers = {}
    for name in ids:
        r = client.post('/api/experiment/login',
                        json={'username': name + '-' + suffix, 'password': PASSWORD})
        assert r.status_code == 200, r.json
        headers[name] = {'Authorization': 'Experiment ' + r.json['token']}
    admin = headers['captain']
    r = client.post('/api/experiment/batches', headers=admin,
                    json={'name': 'SYNTHETIC-PG-CI-' + suffix, 'kind': 'automated'})
    assert r.status_code == 201, r.json
    bid = r.json['id']
    template = client.get('/api/experiment/case-template', headers=admin).json
    assert client.post(f'/api/experiment/batches/{bid}/cases',
                       headers=admin, json={**template, 'confirmed': True}).status_code == 200
    assert client.post(f'/api/experiment/batches/{bid}/assign', headers=admin,
                       json={'executors': [ids['tester1'], ids['tester2']],
                             'raters': [ids['rater1'], ids['rater2']]}).status_code == 200
    assert client.patch(f'/api/experiment/batches/{bid}', headers=admin,
                        json={'state': 'enabled', 'reason': 'Synthetic QA'}).status_code == 200
    sessions = client.get('/api/experiment/sessions', headers=admin).json['sessions']
    candidate = next(s for s in sessions if s['batch_id'] == bid and s['executor_id'] == ids['tester1'])
    sid = candidate['id']
    assert client.post(f'/api/experiment/sessions/{sid}/admit', headers=admin,
                       json={'reason': 'Synthetic supervised QA'}).status_code == 200
    response = Mock()
    response.status_code = 200
    response.headers = {'x-request-id': 'PG-SYNTHETIC-REQUEST'}
    data = {'id': 'PG-SYNTHETIC-COMPLETION', 'model': 'deepseek-flash',
            'usage': {'prompt_tokens': 10, 'completion_tokens': 6, 'total_tokens': 16},
            'choices': [{'message': {'content': '你好。面包五元。[SCENE:ask_price]'},
                         'finish_reason': 'stop'}]}
    response.json.return_value = data
    response.text = json.dumps(data, ensure_ascii=False)
    response.raise_for_status.return_value = None
    post = Mock(return_value=response)
    monkeypatch.setattr(llm_client.requests, 'post', post)
    e = {'sid': sid, 'client': client, 'headers': headers, 'ids': ids, 'w': w, 'bid': bid}
    r = send(e)
    assert r.status_code == 200, r.json
    detail = client.get(f'/api/experiment/sessions/{sid}', headers=admin).json
    assert len(detail['turns']) == 1
    assert detail['turns'][0]['source'] == 'mock'
    assert detail['turns'][0]['model_called'] == 1
    evidence = [json.loads(event['data']) for event in detail['events']
                if event['kind'] == 'provider_result']
    assert evidence[0]['provider_response_id'] == 'PG-SYNTHETIC-COMPLETION'
    assert evidence[0]['usage']['total_tokens'] == 16
    assert post.call_count == 1
    ui = client.post(f'/api/experiment/sessions/{sid}/ui-events',
                     headers=nonce(e, 'ui', sid=sid, who='tester1'),
                     json={'type': 'ui_render', 'turn_id': r.json['_experiment']['turn_id'],
                           'text': r.json['reply']})
    assert ui.status_code == 200, ui.json
    verification = client.get(f'/api/experiment/batches/{bid}/verify', headers=admin)
    assert verification.status_code == 200, verification.json
    assert verification.json['ok'], verification.json
