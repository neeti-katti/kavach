"""Police API: case lists and case sheets without identity, masked calls, time-boxed reveals, submit-and-seal,
and the supervisor's allocation and approval tools.

Access rule on every case request: an officer sees only cases assigned to them; a supervisor sees only cases at their
own station. Anything else returns 404, and the attempt is written to the audit log.
"""
import base64
import json
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from . import audit, vault
from .allocation import OPEN_STATUSES, assign, check_escalations, open_case_count
from .auth import require_roles
from .config import REVEAL_SECONDS
from .db import db_dep, now_iso
from .intake import tokenize
from .security import note_wrong_case, trip_canary

router = APIRouter(prefix="/api/police", tags=["police"])
police = require_roles("officer", "supervisor")
officer_only = require_roles("officer")
supervisor_only = require_roles("supervisor")

REVEALABLE = {
    "name": "Survivor's name",
    "age": "Exact age",
    "address": "Home address",
    "father_name": "Father's name",
    "mother_name": "Mother's name",
    "guardian_name": "Guardian's name",
    "school_or_workplace": "School or workplace",
    "narrative_original": "Complaint in her own words",
    "original_scan": "Original photo of the complaint",
}
MASKED = {"phone": "Phone number", "email": "Email", "pincode": "Home pin code"}  # never shown; contact goes through the relay
TASKS = {
    "record_statement": "Record her statement",
    "medical_exam": "Arrange a medical examination",
    "court_summons": "Serve court papers",
    "other": "Other (needs supervisor approval)",
}
ROUTINE_TASKS = {"record_statement", "medical_exam", "court_summons"}
FORWARD = {"assigned": "statement_scheduled", "statement_scheduled": "investigating"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _identity(db: sqlite3.Connection, case_id: str) -> dict:
    return vault.get_fields(db, case_id, [k for k in ("name", "alias", "father_name", "mother_name", "guardian_name", "phone",
                                                      "email", "address", "pincode", "school_or_workplace")])


def _clean(db: sqlite3.Connection, case_id: str, text: str) -> str:
    """Free text written by police is cleaned of the survivor's identity before it is stored."""
    return tokenize(text, _identity(db, case_id))


def _expire_reveals(db: sqlite3.Connection) -> None:
    db.execute("UPDATE reveals SET status = 'expired' WHERE status = 'approved' AND expires_at < ?", (now_iso(),))


def _load_case(db: sqlite3.Connection, case_id: str, user: dict, request: Request | None = None) -> sqlite3.Row:
    row = db.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
    if row is not None and row["is_canary"]:
        # A decoy case: it is never listed or linked, so opening it means someone is browsing or enumerating.
        trip_canary(db, user, request, case_id)
        db.commit()
        raise HTTPException(404, "Not found")  # the intruder learns nothing; their account is already locked
    allowed = row is not None and (
        (user["role"] == "officer" and row["assigned_officer_id"] == user["id"])
        or (user["role"] == "supervisor" and row["station_id"] == user["station_id"])
    )
    if not allowed:
        audit.log(db, "case_access_denied", actor=user, detail=f"requested={case_id[:40]}")
        if row is not None:
            note_wrong_case(db, user, request, case_id)
        db.commit()  # keep the record even though the request fails
        raise HTTPException(404, "Not found")
    return row


def _officer(db: sqlite3.Connection, officer_id: int | None) -> dict | None:
    if not officer_id:
        return None
    o = db.execute("SELECT id, display_name, badge, gender, child_trained FROM users WHERE id = ?", (officer_id,)).fetchone()
    return dict(o) if o else None


def _list_item(db: sqlite3.Connection, r: sqlite3.Row) -> dict:
    return {
        "id": r["id"], "status": r["status"], "category": r["category"], "is_child": bool(r["is_child"]),
        "urgent": bool(r["urgent"]), "area": r["area"], "language": r["language"], "created_at": r["created_at"],
        "updated_at": r["updated_at"], "accepted": r["accepted_at"] is not None, "accept_by": r["accept_by"],
        "escalated": bool(r["escalated"]), "sealed": bool(r["sealed"]), "allocation_reason": r["allocation_reason"],
        "officer": _officer(db, r["assigned_officer_id"]),
    }


def _reveal_out(db: sqlite3.Connection, r: sqlite3.Row) -> dict:
    return {
        "id": r["id"], "case_id": r["case_id"], "field": r["field"], "label": REVEALABLE.get(r["field"], r["field"]),
        "task": r["task"], "task_label": TASKS.get(r["task"], r["task"]), "reason": r["reason"], "status": r["status"],
        "created_at": r["created_at"], "expires_at": r["expires_at"], "officer": _officer(db, r["officer_id"]),
    }


def _require_active(row: sqlite3.Row) -> None:
    if row["sealed"]:
        raise HTTPException(409, "This case is sealed. Ask your supervisor to reopen it.")
    if not row["accepted_at"]:
        raise HTTPException(409, "Accept the case first.")


# ---------- lists and summary ----------

@router.get("/summary")
def summary(user: dict = Depends(police), db: sqlite3.Connection = Depends(db_dep)):
    check_escalations(db)
    _expire_reveals(db)
    marks = ",".join("?" * len(OPEN_STATUSES))
    if user["role"] == "officer":
        q = lambda sql, *a: db.execute(sql, a).fetchone()[0]  # noqa: E731
        return {
            "open_cases": open_case_count(db, user["id"]),
            "awaiting_acceptance": q("SELECT COUNT(*) FROM cases WHERE assigned_officer_id = ? AND status = 'assigned' AND accepted_at IS NULL AND is_canary = 0", user["id"]),
            "reveals_open": q("SELECT COUNT(*) FROM reveals WHERE officer_id = ? AND status = 'approved'", user["id"]),
            "copies_released": q("SELECT COUNT(*) FROM public_copies WHERE created_by = ? AND status = 'released'", user["id"]),
        }
    st = user["station_id"]
    q = lambda sql: db.execute(sql, (st,)).fetchone()[0]  # noqa: E731
    return {
        "unassigned": q("SELECT COUNT(*) FROM cases WHERE station_id = ? AND assigned_officer_id IS NULL AND is_canary = 0"),
        "reveal_approvals": q("SELECT COUNT(*) FROM reveals rv JOIN cases c ON c.id = rv.case_id WHERE c.station_id = ? AND rv.status = 'pending'"),
        "copies_to_review": q("SELECT COUNT(*) FROM public_copies p JOIN cases c ON c.id = p.case_id WHERE c.station_id = ? AND p.status = 'needs_review'"),
        "escalations": q("SELECT COUNT(*) FROM cases WHERE station_id = ? AND escalated = 1 AND accepted_at IS NULL AND is_canary = 0"),
        "open_cases": db.execute(f"SELECT COUNT(*) FROM cases WHERE station_id = ? AND is_canary = 0 AND status IN ({marks})", (st, *OPEN_STATUSES)).fetchone()[0],
    }


@router.get("/cases")
def list_cases(q: str | None = None, user: dict = Depends(police), db: sqlite3.Connection = Depends(db_dep)):
    check_escalations(db)
    if user["role"] == "officer":
        sql, args = "SELECT * FROM cases WHERE assigned_officer_id = ? AND is_canary = 0", [user["id"]]
    else:
        sql, args = "SELECT * FROM cases WHERE station_id = ? AND is_canary = 0", [user["station_id"]]
    if q:
        sql += " AND id LIKE ?"
        args.append(f"%{q.strip().upper()[:40]}%")
    sql += " ORDER BY sealed ASC, urgent DESC, updated_at DESC"
    return [_list_item(db, r) for r in db.execute(sql, args)]


@router.get("/officers")
def station_officers(user: dict = Depends(supervisor_only), db: sqlite3.Connection = Depends(db_dep)):
    rows = db.execute(
        "SELECT id, display_name, badge, gender, child_trained, on_duty, locked, last_assigned_at FROM users "
        "WHERE role = 'officer' AND station_id = ? AND is_honey = 0 ORDER BY display_name", (user["station_id"],)
    ).fetchall()
    return [{**dict(r), "child_trained": bool(r["child_trained"]), "on_duty": bool(r["on_duty"]), "locked": bool(r["locked"]),
             "open_cases": open_case_count(db, r["id"])} for r in rows]


# ---------- the case sheet ----------

@router.get("/cases/{case_id}")
def case_sheet(case_id: str, request: Request, user: dict = Depends(police), db: sqlite3.Connection = Depends(db_dep)):
    check_escalations(db)
    _expire_reveals(db)
    row = _load_case(db, case_id, user, request)
    sheet = json.loads(row["case_sheet_json"] or "{}")
    present = {r["field"] for r in db.execute("SELECT field FROM vault_fields WHERE case_id = ?", (case_id,))}
    has_scan = db.execute("SELECT 1 FROM vault_files WHERE case_id = ? AND kind = 'original_scan'", (case_id,)).fetchone() is not None
    revealable = [{"field": f, "label": label} for f, label in REVEALABLE.items() if f in present or (f == "original_scan" and has_scan)]
    reveal_sql = "SELECT * FROM reveals WHERE case_id = ?" + (" AND officer_id = ?" if user["role"] == "officer" else "") + " ORDER BY id DESC"
    reveal_args = (case_id, user["id"]) if user["role"] == "officer" else (case_id,)
    audit.log(db, "case_viewed", actor=user, case_id=case_id)
    return {
        **_list_item(db, row),
        "age_group": sheet.get("age_group"),
        "incident": sheet.get("incident", {}),
        "accused": sheet.get("accused"),
        "narrative": row["narrative_tokenized"],
        "source": sheet.get("source"),
        "accepted_at": row["accepted_at"],
        "sealed_at": row["sealed_at"],
        "report_summary": row["report_summary"],
        "revealable": revealable,
        "masked": [{"field": f, "label": label} for f, label in MASKED.items() if f in present],
        "tasks": [{"id": k, "label": v, "routine": k in ROUTINE_TASKS} for k, v in TASKS.items()],
        "reveals": [_reveal_out(db, r) for r in db.execute(reveal_sql, reveal_args)],
        "calls": [dict(r) for r in db.execute("SELECT relay_number, created_at FROM calls WHERE case_id = ? ORDER BY id DESC LIMIT 5", (case_id,))],
        "timeline": [dict(r) for r in db.execute(
            "SELECT ts, action, actor_role FROM audit_log WHERE case_id = ? AND action != 'case_viewed' ORDER BY id", (case_id,))],
    }


# ---------- officer actions ----------

class StatusChange(BaseModel):
    status: Literal["statement_scheduled", "investigating"]


class Report(BaseModel):
    summary: str = Field(min_length=10, max_length=4000)


class RevealRequest(BaseModel):
    field: str = Field(max_length=40)
    task: str = Field(max_length=40)
    reason: str = Field(min_length=10, max_length=500)


@router.post("/cases/{case_id}/accept")
def accept(case_id: str, user: dict = Depends(officer_only), db: sqlite3.Connection = Depends(db_dep)):
    row = _load_case(db, case_id, user)
    if row["accepted_at"]:
        raise HTTPException(409, "You have already accepted this case.")
    db.execute("UPDATE cases SET accepted_at = ?, updated_at = ? WHERE id = ?", (now_iso(), now_iso(), case_id))
    audit.log(db, "case_accepted", actor=user, case_id=case_id)
    return {"ok": True}


@router.post("/cases/{case_id}/status")
def move_status(case_id: str, body: StatusChange, user: dict = Depends(officer_only), db: sqlite3.Connection = Depends(db_dep)):
    row = _load_case(db, case_id, user)
    _require_active(row)
    if FORWARD.get(row["status"]) != body.status:
        raise HTTPException(409, "That step is not next for this case.")
    db.execute("UPDATE cases SET status = ?, updated_at = ? WHERE id = ?", (body.status, now_iso(), case_id))
    audit.log(db, f"status_{body.status}", actor=user, case_id=case_id)
    return {"ok": True}


@router.post("/cases/{case_id}/call")
def masked_call(case_id: str, user: dict = Depends(officer_only), db: sqlite3.Connection = Depends(db_dep)):
    row = _load_case(db, case_id, user)
    _require_active(row)
    relay = f"+91 80 47{secrets.randbelow(100):02d} {secrets.randbelow(10000):04d}"
    db.execute("INSERT INTO calls(case_id, officer_id, relay_number, created_at) VALUES (?,?,?,?)", (case_id, user["id"], relay, now_iso()))
    audit.log(db, "masked_call", actor=user, case_id=case_id)
    return {"relay_number": relay, "connected": True, "simulated": True}


@router.post("/cases/{case_id}/reveals", status_code=201)
def request_reveal(case_id: str, body: RevealRequest, user: dict = Depends(officer_only), db: sqlite3.Connection = Depends(db_dep)):
    _expire_reveals(db)
    row = _load_case(db, case_id, user)
    _require_active(row)
    if body.field in MASKED:
        raise HTTPException(400, "Contact details are never shown. Use the masked call.")
    if body.field not in REVEALABLE or body.task not in TASKS:
        raise HTTPException(400, "Unknown field or task.")
    live = db.execute("SELECT id FROM reveals WHERE case_id = ? AND officer_id = ? AND field = ? AND status IN ('pending','approved')",
                      (case_id, user["id"], body.field)).fetchone()
    if live:
        raise HTTPException(409, "You already have an open request for this detail.")
    routine = body.task in ROUTINE_TASKS
    ts = now_iso()
    expires = (_now() + timedelta(seconds=REVEAL_SECONDS)).isoformat(timespec="seconds") if routine else None
    cur = db.execute(
        "INSERT INTO reveals(case_id, officer_id, field, task, reason, status, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?)",
        (case_id, user["id"], body.field, body.task, _clean(db, case_id, body.reason), "approved" if routine else "pending", ts, expires),
    )
    audit.log(db, "reveal_requested", actor=user, case_id=case_id, detail=f"field={body.field} task={body.task} auto_approved={int(routine)}")
    return _reveal_out(db, db.execute("SELECT * FROM reveals WHERE id = ?", (cur.lastrowid,)).fetchone())


@router.get("/reveals/{reveal_id}/value")
def reveal_value(reveal_id: int, user: dict = Depends(officer_only), db: sqlite3.Connection = Depends(db_dep)):
    _expire_reveals(db)
    r = db.execute("SELECT * FROM reveals WHERE id = ? AND officer_id = ?", (reveal_id, user["id"])).fetchone()
    if not r:
        raise HTTPException(404, "Not found")
    row = _load_case(db, r["case_id"], user)
    if row["sealed"]:
        raise HTTPException(409, "This case is sealed.")
    if r["status"] != "approved":
        raise HTTPException(403, "This detail is not open to you right now.")
    out = {"field": r["field"], "label": REVEALABLE[r["field"]], "expires_at": r["expires_at"], "watermark": f"{user['badge']} · {user['display_name']}"}
    if r["field"] == "original_scan":
        mime, data = vault.get_file(db, r["case_id"], "original_scan")
        out["data_url"] = f"data:{mime};base64,{base64.b64encode(data).decode()}"
    else:
        out["value"] = vault.get_fields(db, r["case_id"], [r["field"]]).get(r["field"])
    audit.log(db, "reveal_viewed", actor=user, case_id=r["case_id"], detail=f"field={r['field']}")
    return out


@router.post("/cases/{case_id}/submit-report")
def submit_report(case_id: str, body: Report, user: dict = Depends(officer_only), db: sqlite3.Connection = Depends(db_dep)):
    row = _load_case(db, case_id, user)
    _require_active(row)
    if row["status"] != "investigating":
        raise HTTPException(409, "Move the case to investigation before filing the report.")
    ts = now_iso()
    db.execute("UPDATE cases SET status = 'report_filed', sealed = 1, sealed_at = ?, report_summary = ?, updated_at = ? WHERE id = ?",
               (ts, _clean(db, case_id, body.summary), ts, case_id))
    db.execute("UPDATE reveals SET status = 'expired' WHERE case_id = ? AND status = 'approved'", (case_id,))
    db.execute("UPDATE reveals SET status = 'denied' WHERE case_id = ? AND status = 'pending'", (case_id,))
    audit.log(db, "case_sealed", actor=user, case_id=case_id, detail="final report filed; identity access closed")
    return {"ok": True}


# ---------- supervisor actions ----------

class Reassign(BaseModel):
    officer_id: int
    reason: str = Field(min_length=10, max_length=500)


class Reopen(BaseModel):
    reason: str = Field(min_length=10, max_length=500)


class Decision(BaseModel):
    approve: bool


@router.post("/cases/{case_id}/reassign")
def reassign(case_id: str, body: Reassign, user: dict = Depends(supervisor_only), db: sqlite3.Connection = Depends(db_dep)):
    row = _load_case(db, case_id, user)
    if row["sealed"]:
        raise HTTPException(409, "Reopen the case before reassigning it.")
    officer = db.execute("SELECT * FROM users WHERE id = ? AND role = 'officer' AND station_id = ? AND locked = 0 AND is_honey = 0",
                         (body.officer_id, user["station_id"])).fetchone()
    if not officer:
        raise HTTPException(400, "Choose an officer at your station.")
    assign(db, case_id, dict(officer), f"Reassigned by supervisor: {_clean(db, case_id, body.reason)}", actor=user)
    db.execute("UPDATE reveals SET status = 'expired' WHERE case_id = ? AND status IN ('approved','pending')", (case_id,))
    return {"ok": True}


@router.post("/cases/{case_id}/reopen")
def reopen(case_id: str, body: Reopen, user: dict = Depends(supervisor_only), db: sqlite3.Connection = Depends(db_dep)):
    row = _load_case(db, case_id, user)
    if not row["sealed"]:
        raise HTTPException(409, "This case is not sealed.")
    db.execute("UPDATE cases SET sealed = 0, status = 'investigating', updated_at = ? WHERE id = ?", (now_iso(), case_id))
    audit.log(db, "case_reopened", actor=user, case_id=case_id, detail=_clean(db, case_id, body.reason)[:200])
    return {"ok": True}


@router.get("/reveals")
def list_reveals(user: dict = Depends(police), db: sqlite3.Connection = Depends(db_dep)):
    _expire_reveals(db)
    if user["role"] == "officer":
        rows = db.execute("SELECT * FROM reveals WHERE officer_id = ? ORDER BY id DESC LIMIT 100", (user["id"],))
    else:
        rows = db.execute("SELECT rv.* FROM reveals rv JOIN cases c ON c.id = rv.case_id WHERE c.station_id = ? "
                          "ORDER BY (rv.status = 'pending') DESC, rv.id DESC LIMIT 100", (user["station_id"],))
    return [_reveal_out(db, r) for r in rows]


@router.post("/reveals/{reveal_id}/decide")
def decide(reveal_id: int, body: Decision, user: dict = Depends(supervisor_only), db: sqlite3.Connection = Depends(db_dep)):
    r = db.execute("SELECT rv.*, c.station_id FROM reveals rv JOIN cases c ON c.id = rv.case_id WHERE rv.id = ?", (reveal_id,)).fetchone()
    if not r or r["station_id"] != user["station_id"]:
        raise HTTPException(404, "Not found")
    if r["status"] != "pending":
        raise HTTPException(409, "This request has already been decided.")
    if body.approve:
        expires = (_now() + timedelta(seconds=REVEAL_SECONDS)).isoformat(timespec="seconds")
        db.execute("UPDATE reveals SET status = 'approved', decided_by = ?, expires_at = ? WHERE id = ?", (user["id"], expires, reveal_id))
    else:
        db.execute("UPDATE reveals SET status = 'denied', decided_by = ? WHERE id = ?", (user["id"], reveal_id))
    audit.log(db, "reveal_approved" if body.approve else "reveal_denied", actor=user, case_id=r["case_id"], detail=f"field={r['field']}")
    return _reveal_out(db, db.execute("SELECT * FROM reveals WHERE id = ?", (reveal_id,)).fetchone())
