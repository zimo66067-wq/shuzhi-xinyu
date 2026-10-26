"""Postgres adapter unit tests: never touch formal records or external services.

These mock tests prove placeholder conversion and row compatibility only.
A real Neon SQL/transaction/restart test remains mandatory before formal runs.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock

from experiment.store_pg import Connection, IndexedRow, indexed_row, PgStore


def test_psycopg_indexed_rows_keep_sqlite_compatibility():
    cur = SimpleNamespace(description=[
        SimpleNamespace(name='count'),
        SimpleNamespace(name='label'),
    ])
    maker = indexed_row(cur)
    row = maker((40, 'pilot'))
    assert isinstance(row, IndexedRow)
    assert row[0] == 40
    assert row[1] == 'pilot'
    assert row['count'] == 40
    assert dict(row) == {'count': 40, 'label': 'pilot'}


def test_sql_parameters_are_bound_not_interpolated():
    native = MagicMock()
    conn = Connection(native)
    sql = 'UPDATE users SET enabled=? WHERE id=?'
    conn.execute(sql, (False, "test' OR 1=1 --"))
    native.execute.assert_called_once_with(
        'UPDATE users SET enabled=%s WHERE id=%s',
        (0, "test' OR 1=1 --"),
    )


def test_postgres_rate_limit_uses_on_conflict_not_sqlite_replace():
    obj = object.__new__(PgStore)
    cur = MagicMock()
    cur.fetchone.return_value = None
    conn = MagicMock()
    conn.execute.return_value = cur
    assert obj.rate(conn, 'test', 3, 60) is True
    assert 'ON CONFLICT(id)' in conn.execute.call_args_list[1].args[0]


def test_postgres_rate_limit_refuses_over_limit():
    obj = object.__new__(PgStore)
    cur = MagicMock()
    cur.fetchone.return_value = {'started': 9999999999, 'count': 3}
    conn = MagicMock()
    conn.execute.return_value = cur
    assert obj.rate(conn, 'test', 3, 60) is False
    assert conn.execute.call_count == 1


def test_postgres_event_chain_still_uses_common_verify_method():
    assert PgStore.verify is not None
    assert PgStore.verify is PgStore.__mro__[1].verify
