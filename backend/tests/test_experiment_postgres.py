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
