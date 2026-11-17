"""Survivor portal API: file a complaint (typed or scanned), preview what police will see, track status.

Every query here is scoped to the signed-in survivor's own cases. Someone else's case number returns 404, so the
API never confirms that a case exists.
"""
import base64
import binascii
import json
import re
import sqlite3
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from . import audit, vault
from .allocation import allocate
from .auth import require_roles
from .security import trip_canary
from .db import db_dep, now_iso
from .intake import detect_language, next_case_id, station_for_pincode, tokenize

router = APIRouter(prefix="/api/survivor", tags=["survivor"])
survivor_only = require_roles("survivor", "helper")

STAGES = ["submitted", "assigned", "statement_scheduled", "investigating", "report_filed"]
MAX_SCAN_BYTES = 5 * 1024 * 1024


class Identity(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=10, max_length=20)
    email: str | None = Field(default=None, max_length=120)
    address: str = Field(min_length=5, max_length=300)
    pincode: str = Field(pattern=r"^\d{6}$")
    father_name: str | None = Field(default=None, max_length=120)
    mother_name: str | None = Field(default=None, max_length=120)
    guardian_name: str | None = Field(default=None, max_length=120)
    school_or_workplace: str | None = Field(default=None, max_length=200)
    age: int = Field(ge=1, le=120)


class Incident(BaseModel):
    date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    locality: str = Field(min_length=2, max_length=120)
    pincode: str = Field(pattern=r"^\d{6}$")
    place: str | None = Field(default=None, max_length=300)


class Complaint(BaseModel):
    identity: Identity
    incident: Incident
    accused: str | None = Field(default=None, max_length=2000)
    narrative: str = Field(min_length=20, max_length=20000)
    language: Literal["en", "hi", "kn"] | None = None
    urgent: bool = False
    source: Literal["typed", "scan"] = "typed"
    scan_image: str | None = Field(default=None, max_length=8_000_000)  # data URL
    ocr_text: str | None = Field(default=None, max_length=20000)


class Preview(BaseModel):
    identity: dict[str, str | int | None] = {}
    narrative: str | None = Field(default=None, max_length=20000)
    place: str | None = Field(default=None, max_length=300)
    accused: str | None = Field(default=None, max_length=2000)


def _identity_dict(identity: Identity) -> dict:
    d = identity.model_dump()
    d["age"] = str(d["age"])
    d["phone"] = re.sub(r"\D", "", d["phone"])[-10:]
    return {k: v.strip() if isinstance(v, str) else v for k, v in d.items() if v not in (None, "")}


def _decode_scan(data_url: str) -> tuple[str, bytes]:
    m = re.match(r"^data:(image/(?:png|jpeg|webp));base64,(.+)$", data_url, re.S)
    if not m:
        raise HTTPException(400, "The photo must be a PNG, JPEG or WebP image.")
    try:
        data = base64.b64decode(m.group(2), validate=True)
    except binascii.Error:
        raise HTTPException(400, "The photo could not be read.")
    if len(data) > MAX_SCAN_BYTES:
        raise HTTPException(413, "The photo is larger than 5 MB.")
    return m.group(1), data


def _public_case(db: sqlite3.Connection, row: sqlite3.Row) -> dict:
    station = db.execute("SELECT name FROM stations WHERE id = ?", (row["station_id"],)).fetchone()
    officer = None
    if row["assigned_officer_id"]:
        o = db.execute("SELECT display_name, badge FROM users WHERE id = ?", (row["assigned_officer_id"],)).fetchone()
        officer = dict(o) if o else None
    return {
        "id": row["id"],
        "status": row["status"],
        "stage_index": STAGES.index(row["status"]),
        "urgent": bool(row["urgent"]),
        "station": station["name"] if station else None,
        "officer": officer,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


@router.post("/preview")
def preview(body: Preview, user: dict = Depends(survivor_only)):
    """Shows the survivor what police will read, before she sends anything. Nothing is stored."""
    identity = {k: str(v) for k, v in body.identity.items() if v not in (None, "")}
    return {
        "narrative": tokenize(body.narrative, identity),
        "place": tokenize(body.place, identity),
        "accused": tokenize(body.accused, identity),
    }


@router.post("/complaints", status_code=201)
def file_complaint(body: Complaint, user: dict = Depends(survivor_only), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    identity = _identity_dict(body.identity)
    if len(identity["phone"]) != 10:
        raise HTTPException(400, "Enter a 10-digit mobile number.")
    scan = _decode_scan(body.scan_image) if body.scan_image else None
    if body.source == "scan" and not scan:
        raise HTTPException(400, "Please add the photo of your complaint.")

    station = station_for_pincode(db, body.incident.pincode)
    case_id = next_case_id(db, station["city_code"])
    language = body.language or detect_language(body.narrative)
    is_child = body.identity.age < 18
    ts = now_iso()

    # What police may read: tokenised text plus facts that do not identify her on their own.
    sheet = {
        "category": "child_victim" if is_child else "sexual_offence",
        "age_group": "Minor (under 18)" if is_child else "Adult",
        "incident": {
            "date": body.incident.date,
            "time": body.incident.time,
            "area": f"{body.incident.locality.strip()}, {station['city']}",
            "place": tokenize(body.incident.place, identity),
        },
        "accused": tokenize(body.accused, identity),
        "language": language,
        "source": body.source,
        "sealed_fields": sorted(k for k in identity if k != "age"),
    }

    db.execute(
        "INSERT INTO cases(id, survivor_user_id, filed_by_user_id, status, category, is_child, urgent, language, station_id, "
        "area, incident_date, narrative_tokenized, case_sheet_json, created_at, updated_at) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (case_id, user["id"], user["id"], "submitted", sheet["category"], int(is_child), int(body.urgent), language,
         station["id"], sheet["incident"]["area"], body.incident.date, tokenize(body.narrative, identity),
         json.dumps(sheet, ensure_ascii=False), ts, ts),
    )

    # The originals, sealed field by field.
    vault.put_fields(db, case_id, identity)
    vault.put_fields(db, case_id, {
        "narrative_original": body.narrative,
        "place_original": body.incident.place,
        "accused_original": body.accused,
        "ocr_text": body.ocr_text,
    })
    if scan:
        vault.put_file(db, case_id, "original_scan", scan[0], scan[1])

    audit.log(db, "complaint_filed", actor=user, case_id=case_id,
              detail=f"source={body.source} lang={language} urgent={int(body.urgent)} child={int(is_child)} station={station['id']}")
    allocate(db, case_id)
    row = db.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
    return _public_case(db, row)


@router.get("/complaints")
def my_complaints(user: dict = Depends(survivor_only), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    rows = db.execute(
        "SELECT * FROM cases WHERE survivor_user_id = ? AND is_canary = 0 ORDER BY created_at DESC, id DESC", (user["id"],)
    ).fetchall()
    return [_public_case(db, r) for r in rows]


@router.get("/complaints/{case_id}")
def my_complaint(case_id: str, request: Request, user: dict = Depends(survivor_only), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    if db.execute("SELECT 1 FROM cases WHERE id = ? AND is_canary = 1", (case_id,)).fetchone():
        trip_canary(db, user, request, case_id)
        db.commit()
        raise HTTPException(404, "Not found")
    row = db.execute(
        "SELECT * FROM cases WHERE id = ? AND survivor_user_id = ? AND is_canary = 0", (case_id, user["id"])
    ).fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    return _public_case(db, row)
