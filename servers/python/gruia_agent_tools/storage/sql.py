"""Implementación SQL de referencia del Storage (SQLite para tests y
Postgres para producción). Misma SQL con paramstyle por dialecto."""

from __future__ import annotations

import json
from contextlib import contextmanager
from typing import Any, Iterable

from .base import Storage

_DDL = """
CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY,
    tool TEXT NOT NULL,
    input TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    preview TEXT,
    estimate TEXT,
    confirm_effective TEXT NOT NULL,
    state TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    supersedes TEXT,
    plan_id TEXT,
    step INTEGER,
    change_id TEXT,
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    thread_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS apply_tokens (
    token_hash TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    user_id TEXT NOT NULL,
    org_id TEXT NOT NULL,
    app_key TEXT NOT NULL,
    issued_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT
);
CREATE TABLE IF NOT EXISTS revert_tokens (
    token_hash TEXT PRIMARY KEY,
    change_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    org_id TEXT NOT NULL,
    issued_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT
);
CREATE TABLE IF NOT EXISTS changes (
    change_id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL UNIQUE,
    tool TEXT NOT NULL,
    app_key TEXT NOT NULL,
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    applied_at TEXT NOT NULL,
    state TEXT NOT NULL,
    undo_mode TEXT NOT NULL,
    undo_window_s INTEGER NOT NULL,
    undone_at TEXT,
    cost_actual REAL,
    cost_unit TEXT,
    applied_token_hash TEXT
);
CREATE TABLE IF NOT EXISTS grace_jobs (
    job_id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL,
    run_at TEXT NOT NULL,
    status TEXT NOT NULL,
    change_id TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_outbox (
    event_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    delivered_at TEXT,
    attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS gateway_jtis (
    jti TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL
);
"""


class SqlStorage(Storage):
    """Base concreta: paramstyle '?' (sqlite) o '%s' (postgres)."""

    ph = "?"

    def __init__(self, conn):
        import threading
        self.conn = conn
        self._write_lock = threading.RLock()
        self.conn.executescript(_DDL) if hasattr(self.conn, "executescript") else self._ddl_generic()

    def _ddl_generic(self) -> None:
        cur = self.conn.cursor()
        for statement in _DDL.split(";"):
            if statement.strip():
                cur.execute(statement)
        self.conn.commit()

    def transaction(self):
        return _tx(self.conn)

    # -- helpers ---------------------------------------------------------
    def _q(self, sql: str, params: Iterable[Any] = ()):
        cur = self.conn.cursor()
        cur.execute(sql.replace("?", self.ph), tuple(params))
        return cur

    def _row(self, sql: str, params: Iterable[Any] = ()) -> dict[str, Any] | None:
        cur = self._q(sql, params)
        row = cur.fetchone()
        if row is None:
            return None
        return dict(row) if not isinstance(row, dict) else row

    def _rows(self, sql: str, params: Iterable[Any] = ()) -> list[dict[str, Any]]:
        cur = self._q(sql, params)
        return [dict(r) if not isinstance(r, dict) else r for r in cur.fetchall()]

    # -- proposals -------------------------------------------------------
    def insert_proposal(self, p: dict[str, Any]) -> None:
        with self._write_lock, _tx(self.conn):
            self._q(
                """INSERT INTO proposals
                (id,tool,input,payload_hash,preview,estimate,confirm_effective,state,
                 created_at,expires_at,supersedes,plan_id,step,change_id,org_id,user_id,thread_id)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    p["id"], p["tool"], _dump(p.get("input")), p["payload_hash"],
                    _dump(p.get("preview")), _dump(p.get("estimate")), p["confirm_effective"],
                    p["state"], p["created_at"], p["expires_at"], p.get("supersedes"),
                    p.get("plan_id"), p.get("step"), p.get("change_id"),
                    p["org_id"], p["user_id"], p["thread_id"],
                ),
            )

    def get_proposal(self, proposal_id: str) -> dict[str, Any] | None:
        row = self._row("SELECT * FROM proposals WHERE id = ?", (proposal_id,))
        return _decode_proposal(row) if row else None

    def list_proposals(self, thread_id: str) -> list[dict[str, Any]]:
        return [
            _decode_proposal(r)
            for r in self._rows(
                "SELECT * FROM proposals WHERE thread_id = ? ORDER BY created_at, id",
                (thread_id,),
            )
        ]

    def cas_proposal_state(self, proposal_id: str, from_state: str, updates: dict[str, Any]) -> bool:
        sets = ", ".join(f"{k} = ?" for k in updates)
        params = [_dump(v) for v in updates.values()] + [proposal_id, from_state]
        with self._write_lock, _tx(self.conn):
            cur = self._q(
                f"UPDATE proposals SET {sets} WHERE id = ? AND state = ?", params
            )
            return cur.rowcount == 1

    # -- apply tokens ----------------------------------------------------
    def insert_apply_token(self, t: dict[str, Any]) -> None:
        with self._write_lock, _tx(self.conn):
            self._q(
                """INSERT INTO apply_tokens
                (token_hash,proposal_id,payload_hash,user_id,org_id,app_key,issued_at,expires_at,consumed_at)
                VALUES (?,?,?,?,?,?,?,?,NULL)""",
                (
                    t["token_hash"], t["proposal_id"], t["payload_hash"], t["user_id"],
                    t["org_id"], t["app_key"], t["issued_at"], t["expires_at"],
                ),
            )

    def get_apply_token(self, token_hash: str) -> dict[str, Any] | None:
        return self._row("SELECT * FROM apply_tokens WHERE token_hash = ?", (token_hash,))

    def consume_apply_token(self, token_hash: str, consumed_at: str) -> bool:
        with self._write_lock, _tx(self.conn):
            cur = self._q(
                "UPDATE apply_tokens SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL",
                (consumed_at, token_hash),
            )
            return cur.rowcount == 1

    # -- revert tokens ---------------------------------------------------
    def insert_revert_token(self, t: dict[str, Any]) -> None:
        with self._write_lock, _tx(self.conn):
            self._q(
                """INSERT INTO revert_tokens
                (token_hash,change_id,user_id,org_id,issued_at,expires_at,consumed_at)
                VALUES (?,?,?,?,?,?,NULL)""",
                (t["token_hash"], t["change_id"], t["user_id"], t["org_id"], t["issued_at"], t["expires_at"]),
            )

    def get_revert_token(self, token_hash: str) -> dict[str, Any] | None:
        return self._row("SELECT * FROM revert_tokens WHERE token_hash = ?", (token_hash,))

    def consume_revert_token(self, token_hash: str, consumed_at: str) -> bool:
        with self._write_lock, _tx(self.conn):
            cur = self._q(
                "UPDATE revert_tokens SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL",
                (consumed_at, token_hash),
            )
            return cur.rowcount == 1

    # -- changes ---------------------------------------------------------
    def get_change(self, change_id: str) -> dict[str, Any] | None:
        return self._row("SELECT * FROM changes WHERE change_id = ?", (change_id,))

    def get_change_by_proposal(self, proposal_id: str) -> dict[str, Any] | None:
        return self._row("SELECT * FROM changes WHERE proposal_id = ?", (proposal_id,))

    def insert_change(self, change: dict[str, Any], outbox_events: Iterable[dict[str, Any]]) -> bool:
        with self._write_lock, _tx(self.conn):
            if self._row("SELECT 1 AS x FROM changes WHERE proposal_id = ?", (change["proposal_id"],)):
                return False
            self._q(
                """INSERT INTO changes
                (change_id,proposal_id,tool,app_key,org_id,user_id,payload_hash,applied_at,
                 state,undo_mode,undo_window_s,undone_at,cost_actual,cost_unit,applied_token_hash)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    change["change_id"], change["proposal_id"], change["tool"], change["app_key"],
                    change["org_id"], change["user_id"], change["payload_hash"], change["applied_at"],
                    change["state"], change["undo_mode"], change["undo_window_s"],
                    change.get("undone_at"), change.get("cost_actual"), change.get("cost_unit"),
                    change.get("applied_token_hash"),
                ),
            )
            self._insert_outbox_locked(outbox_events)
            return True

    def update_change_state(self, change_id: str, updates: dict[str, Any], outbox_events: Iterable[dict[str, Any]]) -> bool:
        sets = ", ".join(f"{k} = ?" for k in updates)
        params = [_dump(v) for v in updates.values()] + [change_id]
        with self._write_lock, _tx(self.conn):
            cur = self._q(f"UPDATE changes SET {sets} WHERE change_id = ?", params)
            self._insert_outbox_locked(outbox_events)
            return cur.rowcount == 1

    # -- grace jobs ------------------------------------------------------
    def insert_grace_job(self, job: dict[str, Any]) -> None:
        with self._write_lock, _tx(self.conn):
            self._q(
                "INSERT INTO grace_jobs (job_id,proposal_id,run_at,status,change_id,created_at) VALUES (?,?,?,?,?,?)",
                (job["job_id"], job["proposal_id"], job["run_at"], job["status"], job.get("change_id"), job["created_at"]),
            )

    def due_grace_jobs(self, now_iso: str) -> list[dict[str, Any]]:
        return self._rows(
            "SELECT * FROM grace_jobs WHERE status = 'pending' AND run_at <= ? ORDER BY run_at",
            (now_iso,),
        )

    def cas_grace_job_status(self, job_id: str, from_status: str, updates: dict[str, Any]) -> bool:
        sets = ", ".join(f"{k} = ?" for k in updates)
        params = list(updates.values()) + [job_id, from_status]
        with self._write_lock, _tx(self.conn):
            cur = self._q(f"UPDATE grace_jobs SET {sets} WHERE job_id = ? AND status = ?", params)
            return cur.rowcount == 1

    def get_grace_job_by_proposal(self, proposal_id: str) -> dict[str, Any] | None:
        return self._row(
            "SELECT * FROM grace_jobs WHERE proposal_id = ? ORDER BY created_at DESC",
            (proposal_id,),
        )

    # -- jti del gateway (§9.4) ------------------------------------------
    def insert_gateway_jti(self, jti: str, expires_at: str) -> bool:
        """INSERT OR IGNORE: False si el jti ya existía (replay → 401)."""
        with self._write_lock, _tx(self.conn):
            cur = self._q(
                """INSERT INTO gateway_jtis (jti, expires_at)
                SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM gateway_jtis WHERE jti = ?)""",
                (jti, expires_at, jti),
            )
            return cur.rowcount == 1

    def purge_gateway_jtis(self, now_iso: str) -> int:
        with self._write_lock, _tx(self.conn):
            return self._q("DELETE FROM gateway_jtis WHERE expires_at <= ?", (now_iso,)).rowcount

    # -- audit outbox ----------------------------------------------------
    def _insert_outbox_locked(self, events: Iterable[dict[str, Any]]) -> int:
        n = 0
        for event in events:
            cur = self._q(
                """INSERT INTO audit_outbox (event_id,payload,created_at,delivered_at,attempts)
                VALUES (?,?,?,NULL,0) ON CONFLICT (event_id) DO NOTHING"""
                if self.ph == "%s"
                else
                """INSERT OR IGNORE INTO audit_outbox (event_id,payload,created_at,delivered_at,attempts)
                VALUES (?,?,?,NULL,0)""",
                (event["event_id"], _dump(event), event.get("ts") or event["created_at"]),
            )
            n += cur.rowcount
        return n

    def insert_outbox_events(self, events: Iterable[dict[str, Any]]) -> int:
        with self._write_lock, _tx(self.conn):
            return self._insert_outbox_locked(events)

    def undelivered_outbox(self, limit: int) -> list[dict[str, Any]]:
        return [
            {**r, "payload": json.loads(r["payload"])}
            for r in self._rows(
                "SELECT * FROM audit_outbox WHERE delivered_at IS NULL ORDER BY created_at LIMIT ?",
                (limit,),
            )
        ]

    def mark_outbox_delivered(self, event_ids: Iterable[str], delivered_at: str) -> None:
        with self._write_lock, _tx(self.conn):
            for event_id in event_ids:
                self._q(
                    "UPDATE audit_outbox SET delivered_at = ?, attempts = attempts + 1 WHERE event_id = ?",
                    (delivered_at, event_id),
                )


class SqliteStorage(SqlStorage):
    ph = "?"

    def __init__(self, path: str = ":memory:"):
        import sqlite3

        conn = sqlite3.connect(path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.isolation_level = None  # autocommit; _tx maneja BEGIN/COMMIT
        super().__init__(conn)


class PostgresStorage(SqlStorage):
    ph = "%s"

    def __init__(self, dsn: str):
        import psycopg
        from psycopg.rows import dict_row

        import threading
        self.conn = psycopg.connect(dsn, row_factory=dict_row, autocommit=True)
        self._write_lock = threading.RLock()
        cur = self.conn.cursor()
        for statement in _DDL.split(";"):
            if statement.strip():
                cur.execute(statement)


@contextmanager
def _tx(conn):
    """BEGIN/commit/rollback portable (sqlite autocommit + psycopg autocommit)."""
    cur = conn.cursor()
    cur.execute("BEGIN")
    try:
        yield
        conn.commit()
    except BaseException:
        conn.rollback()
        raise


def _dump(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return json.dumps(value, separators=(",", ":"), sort_keys=True)
    return value


def _decode_proposal(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    for field in ("input", "preview", "estimate"):
        if isinstance(out.get(field), str):
            out[field] = json.loads(out[field])
    return out
