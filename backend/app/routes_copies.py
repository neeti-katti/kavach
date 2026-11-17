"""Public copies: preview (name-only redaction vs Kavach), the risk-based release gate, supervisor review, and the
released copy itself. Copies are built only from redacted text; the originals are read from the vault on the server
and never leave it.
"""
import json
import sqlite3
from datetime import date as Date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import audit, vault
from .db import db_dep, now_iso
from .redaction import KINDS, LAYERS, apply, build_context, decision, detect, mark_leaks, score
from .routes_police import _load_case, police, supervisor_only

router = APIRouter(prefix="/api/police", tags=["copies"])

IDENTITY = ["name", "alias", "father_name", "mother_name", "guardian_name", "phone", "email", "address", "pincode", "school_or_workplace", "age"]
SECTIONS = [("complaint", "Complaint"), ("place", "Where it happened"), ("accused", "Person responsible"), ("report", "Investigation summary")]
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


class CopyRequest(BaseModel):
    profile: Literal["public", "court"] = "public"


class Decision(BaseModel):
    approve: bool


def _material(db: sqlite3.Connection, row: sqlite3.Row):
    identity = vault.get_fields(db, row["id"], IDENTITY)
    originals = vault.get_fields(db, row["id"], ["narrative_original", "place_original", "accused_original"])
    sheet = json.loads(row["case_sheet_json"] or "{}")
    station = db.execute("SELECT name, city FROM stations WHERE id = ?", (row["station_id"],)).fetchone()
    texts = {
        "complaint": originals.get("narrative_original") or row["narrative_tokenized"],
        "place": originals.get("place_original"),
        "accused": originals.get("accused_original"),
        "report": row["report_summary"],
    }
    locality = (sheet.get("incident", {}).get("area") or "").rsplit(",", 1)[0].strip() or None
    return identity, texts, sheet, station, locality


def _header(row, sheet, station, identity, profile: str, naive: bool, locality: str | None):
    incident = sheet.get("incident", {})
    when = incident.get("date")
    category = "Sexual offence against a child" if row["is_child"] else "Sexual offence"
    age = identity.get("age")
    if naive:
        area = incident.get("area") or ""
        if locality:
            area = area.replace(locality, "{{LEAK:place}}", 1)
        survivor = "[REDACTED]" + (", aged {{LEAK:age}}" if age else "")
        extras = (["place"] if locality else []) + (["age"] if age else []) + (["date_place"] if when and locality else [])
        return [("Case number", row["id"]), ("Police station", station["name"]), ("Offence", category), ("Date of incident", when or "Not given"),
                ("Area", area), ("Survivor", survivor)], extras
    if profile == "court":
        survivor = "Survivor A" + (f", aged {age}" if age else "")
        return [("Case number", row["id"]), ("Police station", station["name"]), ("Offence", category), ("Date of incident", when or "Not given"),
                ("Area", incident.get("area") or station["city"]), ("Survivor", survivor)], []
    month = None
    if when:
        d = Date.fromisoformat(when)
        month = f"{MONTHS[d.month - 1]} {d.year}"
    survivor = "Survivor A, " + ("a minor" if row["is_child"] else "an adult")
    return [("Case number", row["id"]), ("Police station", station["name"]), ("Offence", category), ("Month of incident", month or "Not given"),
            ("Area", station["city"]), ("Survivor", survivor)], []


def _build(db: sqlite3.Connection, row: sqlite3.Row, profile: str) -> dict:
    identity, texts, sheet, station, locality = _material(db, row)
    ctx = build_context(identity, locality)
    keep_kind = (lambda k: KINDS[k][0] >= 6 or k in ("relative_name", "other_name")) if profile == "court" else (lambda k: True)

    # Name-only redaction: what a careful clerk with find-and-replace does.
    naive_sections, naive_kinds = [], []
    for key, label in SECTIONS:
        text = texts.get(key)
        if not text:
            continue
        if identity.get("name"):
            text = text.replace(identity["name"], "[REDACTED]")
        found = detect(text, ctx)
        naive_kinds += [s.kind for s in found]
        naive_sections.append({"key": key, "label": label, "text": mark_leaks(text, found)})
    naive_header, naive_extra = _header(row, sheet, station, identity, profile, True, locality)
    n_total, n_findings = score([], naive_kinds + naive_extra)

    # Kavach: all layers, then the same detector over the result.
    sections, applied, residual_kinds = [], {}, []
    for key, label in SECTIONS:
        text = texts.get(key)
        if not text:
            continue
        spans = [s for s in detect(text, ctx) if keep_kind(s.kind)]
        for s in spans:
            layer = KINDS[s.kind][3]
            applied[layer] = applied.get(layer, 0) + 1
        out = apply(text, spans)
        residual_kinds += [s.kind for s in detect(out, ctx) if keep_kind(s.kind)]
        sections.append({"key": key, "label": label, "text": out})
    header, extra = _header(row, sheet, station, identity, profile, False, locality)
    total, findings = score([], residual_kinds + extra)
    return {
        "profile": profile,
        "naive": {"header": naive_header, "sections": naive_sections, "score": n_total, "findings": n_findings,
                  "decision": decision(n_total, profile, n_findings)},
        "kavach": {"header": header, "sections": sections, "score": total, "findings": findings,
                   "decision": decision(total, profile, findings), "redactions": sum(applied.values()),
                   "applied": [{"layer": k, "label": LAYERS[k], "count": v} for k, v in sorted(applied.items())]},
    }


def _copy_out(db: sqlite3.Connection, r: sqlite3.Row, with_body: bool = False) -> dict:
    who = lambda uid: (db.execute("SELECT display_name FROM users WHERE id = ?", (uid,)).fetchone() or [None])[0] if uid else None  # noqa: E731
    out = {"id": r["id"], "case_id": r["case_id"], "profile": r["profile"], "risk_score": r["risk_score"], "status": r["status"],
           "created_at": r["created_at"], "created_by": who(r["created_by"]), "approved_by": who(r["approved_by"])}
    body = json.loads(r["body"])
    out["findings"] = body.get("findings", [])
    out["applied"] = body.get("applied", [])
    if with_body and r["status"] != "blocked":  # a blocked copy may still hold identity, so its text is never sent
        out["header"] = body["header"]
        out["sections"] = body["sections"]
    return out


def _load_copy(db: sqlite3.Connection, copy_id: int, user: dict) -> sqlite3.Row:
    r = db.execute("SELECT * FROM public_copies WHERE id = ?", (copy_id,)).fetchone()
    if not r:
        raise HTTPException(404, "Not found")
    _load_case(db, r["case_id"], user)  # same access rule as the case itself
    return r


@router.post("/cases/{case_id}/copies/preview")
def preview_copy(case_id: str, body: CopyRequest, user: dict = Depends(police), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    row = _load_case(db, case_id, user)
    audit.log(db, "copy_previewed", actor=user, case_id=case_id, detail=f"profile={body.profile}")
    return _build(db, row, body.profile)


@router.post("/cases/{case_id}/copies", status_code=201)
def create_copy(case_id: str, body: CopyRequest, user: dict = Depends(police), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    row = _load_case(db, case_id, user)
    built = _build(db, row, body.profile)["kavach"]
    status = built["decision"]
    payload = {"header": built["header"], "sections": built["sections"], "findings": built["findings"], "applied": built["applied"]}
    cur = db.execute(
        "INSERT INTO public_copies(case_id, profile, risk_score, status, body, created_by, created_at) VALUES (?,?,?,?,?,?,?)",
        (case_id, body.profile, built["score"], status, json.dumps(payload, ensure_ascii=False), user["id"], now_iso()),
    )
    audit.log(db, {"released": "copy_released", "needs_review": "copy_sent_for_review", "blocked": "copy_blocked"}[status],
              actor=user, case_id=case_id, detail=f"profile={body.profile} risk={built['score']}")
    return _copy_out(db, db.execute("SELECT * FROM public_copies WHERE id = ?", (cur.lastrowid,)).fetchone())


@router.get("/copies")
def list_copies(user: dict = Depends(police), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    if user["role"] == "officer":
        rows = db.execute("SELECT p.* FROM public_copies p JOIN cases c ON c.id = p.case_id WHERE c.assigned_officer_id = ? OR p.created_by = ? "
                          "ORDER BY p.id DESC", (user["id"], user["id"]))
    else:
        rows = db.execute("SELECT p.* FROM public_copies p JOIN cases c ON c.id = p.case_id WHERE c.station_id = ? "
                          "ORDER BY (p.status = 'needs_review') DESC, p.id DESC", (user["station_id"],))
    return [_copy_out(db, r) for r in rows]


@router.get("/copies/{copy_id}")
def get_copy(copy_id: int, user: dict = Depends(police), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    r = _load_copy(db, copy_id, user)
    audit.log(db, "copy_viewed", actor=user, case_id=r["case_id"], detail=f"copy={copy_id}")
    return _copy_out(db, r, with_body=True)


@router.post("/copies/{copy_id}/decide")
def decide_copy(copy_id: int, body: Decision, user: dict = Depends(supervisor_only), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    r = _load_copy(db, copy_id, user)
    if r["status"] != "needs_review":
        raise HTTPException(409, "This copy is not waiting for review.")
    status = "released" if body.approve else "blocked"
    db.execute("UPDATE public_copies SET status = ?, approved_by = ? WHERE id = ?", (status, user["id"], copy_id))
    audit.log(db, "copy_approved" if body.approve else "copy_rejected", actor=user, case_id=r["case_id"], detail=f"copy={copy_id}")
    return _copy_out(db, db.execute("SELECT * FROM public_copies WHERE id = ?", (copy_id,)).fetchone())
