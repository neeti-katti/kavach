"""Sign-in: survivors use a phone OTP; staff use a password plus a second-factor code."""
import re
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from . import audit, crypto
from .auth import (DUMMY_HASH, consume_challenge, create_session, current_user, end_session, new_challenge,
                   public_user, verify_password)
from .config import DEMO_MODE, DEMO_STAFF_PASSWORD, DEMO_SURVIVOR_PHONE
from .db import db_dep, now_iso
from .security import raise_alert

router = APIRouter(prefix="/api/auth", tags=["auth"])
demo_router = APIRouter(prefix="/api/demo", tags=["demo"])


class StaffLogin(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class SurvivorStart(BaseModel):
    phone: str = Field(min_length=10, max_length=20)


class Verify(BaseModel):
    challenge_id: str = Field(min_length=8, max_length=64)
    code: str = Field(min_length=6, max_length=6)


@router.post("/staff/login")
def staff_login(body: StaffLogin, request: Request, db: sqlite3.Connection = Depends(db_dep, scope="function")):
    username = body.username.strip().lower()
    user = db.execute("SELECT * FROM users WHERE username = ? AND role != 'survivor'", (username,)).fetchone()
    ok = verify_password(body.password, user["password_hash"] if user else DUMMY_HASH)
    if not user or not ok:
        audit.log(db, "login_failed", detail=f"staff username={username[:32]}")
        db.commit()
        raise HTTPException(401, "Wrong username or password.")
    if user["locked"]:
        raise HTTPException(423, "This account is locked. Contact the security admin.")
    if user["is_honey"]:
        # Honey credentials: let the intruder in to an empty view, skip the second factor, and raise the alarm.
        raise_alert(db, "honey_login", "critical", f"Sign-in with planted credentials '{username}'", actor=dict(user), request=request, target=username)
        token, expires = create_session(db, dict(user))
        return {"token": token, "expires_at": expires, "user": public_user(db, dict(user))}
    challenge_id, code = new_challenge(db, user["id"], "staff_2fa")
    audit.log(db, "password_ok", actor=dict(user))
    return {"challenge_id": challenge_id, "method": "authenticator", "demo_code": code if DEMO_MODE else None}


@router.post("/survivor/start")
def survivor_start(body: SurvivorStart, db: sqlite3.Connection = Depends(db_dep, scope="function")):
    phone = re.sub(r"\D", "", body.phone)[-10:]
    if len(phone) != 10 or phone[0] not in "6789":
        raise HTTPException(400, "Enter a 10-digit mobile number.")
    phone_hash = crypto.lookup_hash(phone)
    user = db.execute("SELECT * FROM users WHERE phone_hash = ?", (phone_hash,)).fetchone()
    if not user:
        nonce, ct = crypto.encrypt_text(phone, f"user-phone:{phone_hash}")
        cur = db.execute(
            "INSERT INTO users(role, display_name, phone_hash, phone_nonce, phone_enc, created_at) VALUES (?,?,?,?,?,?)",
            ("survivor", "Survivor", phone_hash, nonce, ct, now_iso()),
        )
        user = db.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
        audit.log(db, "survivor_account_created", actor=dict(user))
    if user["locked"]:
        raise HTTPException(423, "This account is locked. Please contact the helpline.")
    challenge_id, code = new_challenge(db, user["id"], "survivor_otp")
    return {"challenge_id": challenge_id, "sent_to": "******" + phone[-4:], "demo_code": code if DEMO_MODE else None}


@router.post("/verify")
def verify(body: Verify, db: sqlite3.Connection = Depends(db_dep, scope="function")):
    user_id = consume_challenge(db, body.challenge_id, body.code.strip())
    user = dict(db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())
    if user["locked"]:
        raise HTTPException(423, "This account is locked. Contact the security admin.")
    token, expires = create_session(db, user)
    audit.log(db, "login", actor=user)
    return {"token": token, "expires_at": expires, "user": public_user(db, user)}


@router.get("/me")
def me(user: dict = Depends(current_user), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    return public_user(db, user)


@router.post("/logout")
def logout(request: Request, user: dict = Depends(current_user), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    end_session(db, request)
    audit.log(db, "logout", actor=user)
    return {"ok": True}


@demo_router.get("/accounts")
def demo_accounts(db: sqlite3.Connection = Depends(db_dep, scope="function")):
    """Demo convenience only: lists the synthetic staff accounts for quick sign-in."""
    if not DEMO_MODE:
        raise HTTPException(404, "Not found")
    rows = db.execute(
        "SELECT u.username, u.display_name, u.role, u.badge, u.gender, s.name AS station "
        "FROM users u LEFT JOIN stations s ON s.id = u.station_id "
        "WHERE u.role IN ('officer','supervisor','security') AND u.is_honey = 0 ORDER BY u.role, u.id"
    ).fetchall()
    return {"password": DEMO_STAFF_PASSWORD, "survivor_phone": DEMO_SURVIVOR_PHONE, "staff": [dict(r) for r in rows]}
