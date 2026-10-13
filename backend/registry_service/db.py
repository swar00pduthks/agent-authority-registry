from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS skill_versions (
  skill_id TEXT, version TEXT, status TEXT NOT NULL, label TEXT, blurb TEXT, accent TEXT,
  description TEXT, body TEXT, wheel BLOB, sha256 TEXT, published_at TEXT, published_by TEXT,
  signature TEXT, approved_by TEXT, PRIMARY KEY (skill_id, version));
CREATE TABLE IF NOT EXISTS tool_versions (
  tool_id TEXT, version TEXT, status TEXT NOT NULL, kind TEXT, description TEXT, spec TEXT,
  published_at TEXT, published_by TEXT, PRIMARY KEY (tool_id, version));
CREATE TABLE IF NOT EXISTS ui_versions (
  name TEXT, version TEXT, status TEXT NOT NULL, component TEXT, description TEXT,
  published_at TEXT, published_by TEXT, PRIMARY KEY (name, version));
CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT);
CREATE TABLE IF NOT EXISTS profile_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT, status TEXT NOT NULL, note TEXT,
  config TEXT NOT NULL, created_at TEXT, created_by TEXT);
CREATE TABLE IF NOT EXISTS env_pins (
  agent_id TEXT, env TEXT, revision_id INTEGER, updated_at TEXT, updated_by TEXT,
  PRIMARY KEY (agent_id, env));
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, actor TEXT, action TEXT, target TEXT, detail TEXT,
  prev TEXT, hash TEXT);
CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, roles TEXT, token_hash TEXT UNIQUE,
  created_at TEXT, created_by TEXT, revoked INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS usage (
  thread_id TEXT PRIMARY KEY, agent_id TEXT, env TEXT, revision_id INTEGER, snapshot TEXT,
  started_at TEXT, last_seen TEXT);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class DB:
    def __init__(self, path: Path | str):
        self.conn = sqlite3.connect(str(path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.executescript(SCHEMA)
        self.lock = threading.RLock()

    def q(self, sql: str, args: tuple = ()) -> list[dict]:
        with self.lock:
            return [dict(r) for r in self.conn.execute(sql, args).fetchall()]

    def one(self, sql: str, args: tuple = ()) -> dict | None:
        rows = self.q(sql, args)
        return rows[0] if rows else None

    def run(self, sql: str, args: tuple = ()) -> int:
        with self.lock:
            cur = self.conn.execute(sql, args)
            self.conn.commit()
            return cur.lastrowid or 0

    def audit(self, actor: str, action: str, target: str, detail: dict | None = None) -> None:
        """Append to a hash chain: each row commits to the one before it, so edits or deletions are detectable."""
        import hashlib

        with self.lock:
            last = self.conn.execute("SELECT hash FROM audit ORDER BY id DESC LIMIT 1").fetchone()
            prev = last["hash"] if last else "genesis"
            row = (now(), actor, action, target, json.dumps(detail or {}, sort_keys=True))
            digest = hashlib.sha256((prev + "|".join(row)).encode()).hexdigest()
            self.conn.execute(
                "INSERT INTO audit(ts, actor, action, target, detail, prev, hash) VALUES (?,?,?,?,?,?,?)",
                (*row, prev, digest),
            )
            self.conn.commit()

    def verify_audit(self) -> dict:
        import hashlib

        prev = "genesis"
        for r in self.q("SELECT * FROM audit ORDER BY id"):
            row = (r["ts"], r["actor"], r["action"], r["target"], r["detail"])
            if r["prev"] != prev or hashlib.sha256((prev + "|".join(row)).encode()).hexdigest() != r["hash"]:
                return {"ok": False, "broken_at": r["id"]}
            prev = r["hash"]
        return {"ok": True, "entries": self.one("SELECT COUNT(*) AS n FROM audit")["n"]}
