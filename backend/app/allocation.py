"""Allocation engine: every complaint reaches one named officer, a woman officer by default, and cannot be quietly ignored.

Rule, in order:
  1. officers at the case's station who are on duty and not locked
  2. women officers first (all officers only if no woman is on duty)
  3. for a child survivor, officers trained for child cases first
  4. fewest open cases, then the one assigned longest ago
An unaccepted case escalates to the supervisor after the accept window.
"""
import sqlite3
from datetime import datetime, timedelta, timezone

from . import audit
from .config import ACCEPT_WINDOW_SECONDS
from .db import now_iso

OPEN_STATUSES = ("assigned", "statement_scheduled", "investigating")


def open_case_count(db: sqlite3.Connection, officer_id: int) -> int:
    return db.execute(
        f"SELECT COUNT(*) FROM cases WHERE assigned_officer_id = ? AND is_canary = 0 AND status IN ({','.join('?' * len(OPEN_STATUSES))})",
        (officer_id, *OPEN_STATUSES),
    ).fetchone()[0]


def choose_officer(db: sqlite3.Connection, station_id: str, is_child: bool) -> tuple[dict | None, str]:
    officers = [dict(r) for r in db.execute(
        "SELECT * FROM users WHERE role = 'officer' AND station_id = ? AND on_duty = 1 AND locked = 0 AND is_honey = 0",
        (station_id,),
    )]
    if not officers:
        return None, "No officer on duty at this station"
    reasons = []
    women = [o for o in officers if o["gender"] == "F"]
    pool = women or officers
    reasons.append("woman officer" if women else "no woman officer on duty")
    if is_child:
        trained = [o for o in pool if o["child_trained"]]
        if trained:
            pool = trained
            reasons.append("trained for child cases")
    for o in pool:
        o["open_cases"] = open_case_count(db, o["id"])
    pool.sort(key=lambda o: (o["open_cases"], o["last_assigned_at"] or ""))
    chosen = pool[0]
    reasons.append(f"{chosen['open_cases']} open case{'s' if chosen['open_cases'] != 1 else ''}")
    return chosen, ", ".join(reasons).capitalize()


def assign(db: sqlite3.Connection, case_id: str, officer: dict, reason: str, actor: dict | None = None) -> None:
    ts = now_iso()
    accept_by = (datetime.now(timezone.utc) + timedelta(seconds=ACCEPT_WINDOW_SECONDS)).isoformat(timespec="seconds")
    db.execute(
        "UPDATE cases SET assigned_officer_id = ?, assigned_at = ?, accepted_at = NULL, accept_by = ?, escalated = 0, "
        "allocation_reason = ?, status = 'assigned', updated_at = ? WHERE id = ?",
        (officer["id"], ts, accept_by, reason, ts, case_id),
    )
    db.execute("UPDATE users SET last_assigned_at = ? WHERE id = ?", (ts, officer["id"]))
    audit.log(db, "case_assigned", actor=actor, case_id=case_id, detail=f"officer={officer['badge']} reason={reason}")


def allocate(db: sqlite3.Connection, case_id: str) -> dict | None:
    case = db.execute("SELECT station_id, is_child FROM cases WHERE id = ?", (case_id,)).fetchone()
    officer, reason = choose_officer(db, case["station_id"], bool(case["is_child"]))
    if officer:
        assign(db, case_id, officer, reason)
    else:
        audit.log(db, "allocation_failed", case_id=case_id, detail=reason)
    return officer


def check_escalations(db: sqlite3.Connection) -> None:
    """Escalate assigned cases nobody accepted in time. Runs whenever police screens load."""
    now = now_iso()
    rows = db.execute(
        "SELECT id FROM cases WHERE status = 'assigned' AND accepted_at IS NULL AND escalated = 0 AND accept_by IS NOT NULL "
        "AND accept_by < ? AND is_canary = 0",
        (now,),
    ).fetchall()
    for r in rows:
        db.execute("UPDATE cases SET escalated = 1, updated_at = ? WHERE id = ?", (now, r["id"]))
        audit.log(db, "allocation_escalated", case_id=r["id"], detail="not accepted within the window")
