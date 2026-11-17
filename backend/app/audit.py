"""Tamper-evident audit log. Each entry hashes the previous one, so editing or deleting a row breaks the chain.

Rule: `detail` holds case IDs, field names and actions only, never personal data.
"""
import hashlib
import json
import sqlite3

from .db import now_iso


def log(db: sqlite3.Connection, action: str, actor: dict | None = None, case_id: str | None = None,
        detail: str | None = None) -> None:
    prev = db.execute("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1").fetchone()
    prev_hash = prev["hash"] if prev else "GENESIS"
    ts = now_iso()
    actor_id = actor["id"] if actor else None
    actor_role = actor["role"] if actor else None
    payload = json.dumps([ts, actor_id, actor_role, action, case_id, detail, prev_hash], separators=(",", ":"))
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    db.execute(
        "INSERT INTO audit_log(ts, actor_id, actor_role, action, case_id, detail, prev_hash, hash) VALUES (?,?,?,?,?,?,?,?)",
        (ts, actor_id, actor_role, action, case_id, detail, prev_hash, digest),
    )


def verify_chain(db: sqlite3.Connection) -> tuple[bool, int | None]:
    """Returns (ok, first_bad_id)."""
    prev_hash = "GENESIS"
    for r in db.execute("SELECT * FROM audit_log ORDER BY id"):
        payload = json.dumps([r["ts"], r["actor_id"], r["actor_role"], r["action"], r["case_id"], r["detail"], prev_hash],
                             separators=(",", ":"))
        if r["prev_hash"] != prev_hash or hashlib.sha256(payload.encode("utf-8")).hexdigest() != r["hash"]:
            return False, r["id"]
        prev_hash = r["hash"]
    return True, None
