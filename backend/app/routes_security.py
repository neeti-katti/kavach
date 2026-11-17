"""Security admin API: live alerts, locked accounts, blocked clients, decoy status and the audit log.
The security admin never sees case content: case numbers and areas only, no survivor details.
"""
import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import audit
from .auth import require_roles
from .db import db_dep
from .routes_decoys import DECOY_PATHS

router = APIRouter(prefix="/api/security", tags=["security"])
security_only = require_roles("security")


class Unblock(BaseModel):
    key: str = Field(max_length=300)


def _actor(db: sqlite3.Connection, uid: int | None) -> dict | None:
    if not uid:
        return None
    r = db.execute("SELECT id, display_name, badge, role, is_honey FROM users WHERE id = ?", (uid,)).fetchone()
    return dict(r) if r else None


@router.get("/summary")
def summary(user: dict = Depends(security_only), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    today = datetime.now(timezone.utc).date().isoformat()
    q = lambda sql, *a: db.execute(sql, a).fetchone()[0]  # noqa: E731
    ok, bad_id = audit.verify_chain(db)
    return {
        "open_alerts": q("SELECT COUNT(*) FROM alerts WHERE resolved = 0"),
        "serious_open": q("SELECT COUNT(*) FROM alerts WHERE resolved = 0 AND severity IN ('high','critical')"),
        "locked_accounts": q("SELECT COUNT(*) FROM users WHERE locked = 1 AND is_honey = 0"),
        "decoy_hits_today": q("SELECT COUNT(*) FROM alerts WHERE kind IN ('canary','decoy','honey_login') AND ts >= ?", today),
        "blocked_clients": q("SELECT COUNT(*) FROM blocked_clients"),
        "audit_entries": q("SELECT COUNT(*) FROM audit_log"),
        "audit_chain_ok": ok,
        "audit_first_bad": bad_id,
        "canaries": q("SELECT COUNT(*) FROM cases WHERE is_canary = 1"),
        "decoy_endpoints": len(DECOY_PATHS),
    }


@router.get("/alerts")
def alerts(user: dict = Depends(security_only), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    rows = db.execute("SELECT * FROM alerts ORDER BY id DESC LIMIT 100").fetchall()
    return [{**dict(r), "resolved": bool(r["resolved"]), "actor": _actor(db, r["actor_id"])} for r in rows]


@router.post("/alerts/{alert_id}/resolve")
def resolve(alert_id: int, user: dict = Depends(security_only), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    if not db.execute("UPDATE alerts SET resolved = 1 WHERE id = ? AND resolved = 0", (alert_id,)).rowcount:
        raise HTTPException(404, "Not found")
    audit.log(db, "alert_resolved", actor=user, detail=f"alert={alert_id}")
    return {"ok": True}


@router.get("/locked")
def locked(user: dict = Depends(security_only), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    rows = db.execute("SELECT u.id, u.display_name, u.badge, u.role, u.locked_reason, s.name AS station FROM users u "
                      "LEFT JOIN stations s ON s.id = u.station_id WHERE u.locked = 1 AND u.is_honey = 0 ORDER BY u.id").fetchall()
    return [dict(r) for r in rows]


@router.post("/users/{user_id}/unlock")
def unlock(user_id: int, user: dict = Depends(security_only), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    if not db.execute("UPDATE users SET locked = 0, locked_reason = NULL WHERE id = ? AND locked = 1", (user_id,)).rowcount:
        raise HTTPException(404, "Not found")
    audit.log(db, "account_unlocked", actor=user, detail=f"user={user_id}")
    return {"ok": True}


@router.get("/blocked")
def blocked(user: dict = Depends(security_only), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    return [dict(r) for r in db.execute("SELECT * FROM blocked_clients ORDER BY created_at DESC")]


@router.post("/blocked/unblock")
def unblock(body: Unblock, user: dict = Depends(security_only), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    if not db.execute("DELETE FROM blocked_clients WHERE key = ?", (body.key,)).rowcount:
        raise HTTPException(404, "Not found")
    audit.log(db, "client_unblocked", actor=user)
    return {"ok": True}


@router.get("/decoys")
def decoys(user: dict = Depends(security_only), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    hits = lambda kind, target: db.execute("SELECT COUNT(*) FROM alerts WHERE kind = ? AND target = ?", (kind, target)).fetchone()[0]  # noqa: E731
    canaries = [{"id": r["id"], "station": r["station_id"], "area": r["area"], "hits": hits("canary", r["id"])}
                for r in db.execute("SELECT id, station_id, area FROM cases WHERE is_canary = 1 ORDER BY id")]
    endpoints = [{"path": p, "hits": hits("decoy", p)} for p in DECOY_PATHS]
    honey = [{"username": r["username"], "planted_in": "backend/legacy/config.old.env", "hits": hits("honey_login", r["username"])}
             for r in db.execute("SELECT username FROM users WHERE is_honey = 1")]
    return {"canaries": canaries, "endpoints": endpoints, "honey_accounts": honey}


@router.get("/audit")
def audit_log(limit: int = 200, user: dict = Depends(security_only), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    ok, bad_id = audit.verify_chain(db)
    rows = db.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (min(max(limit, 1), 500),)).fetchall()
    return {"chain_ok": ok, "first_bad": bad_id,
            "entries": [{**dict(r), "actor": _actor(db, r["actor_id"])} for r in rows]}
