"""Passwords, one-time codes, sessions and role checks."""
import hashlib
import hmac
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request

from . import crypto
from .config import OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS, STAFF_SESSION_HOURS, SURVIVOR_SESSION_HOURS
from .db import db_dep, now_iso

_SCRYPT = dict(n=2**14, r=8, p=1, dklen=32)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, **_SCRYPT)
    return f"scrypt${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        _algo, salt_hex, hash_hex = stored.split("$")
    except ValueError:
        return False
    dk = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt_hex), **_SCRYPT)
    return hmac.compare_digest(dk.hex(), hash_hex)


# Used when a username does not exist, so a failed login takes the same time either way.
DUMMY_HASH = hash_password(secrets.token_hex(8))


def _sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _expired(iso: str) -> bool:
    return datetime.fromisoformat(iso) <= _utcnow()


def new_challenge(db: sqlite3.Connection, user_id: int, purpose: str) -> tuple[str, str]:
    challenge_id = secrets.token_urlsafe(16)
    code = f"{secrets.randbelow(10**6):06d}"
    expires = (_utcnow() + timedelta(seconds=OTP_TTL_SECONDS)).isoformat(timespec="seconds")
    db.execute(
        "INSERT INTO challenges(id, user_id, code_hash, purpose, expires_at) VALUES (?,?,?,?,?)",
        (challenge_id, user_id, _sha(f"{challenge_id}:{code}"), purpose, expires),
    )
    return challenge_id, code


def consume_challenge(db: sqlite3.Connection, challenge_id: str, code: str) -> int:
    row = db.execute("SELECT * FROM challenges WHERE id = ?", (challenge_id,)).fetchone()
    if not row or row["used"] or _expired(row["expires_at"]):
        raise HTTPException(400, "This code has expired or was already used. Request a new one.")
    if row["attempts"] >= OTP_MAX_ATTEMPTS:
        raise HTTPException(429, "Too many wrong attempts. Request a new code.")
    if not hmac.compare_digest(_sha(f"{challenge_id}:{code}"), row["code_hash"]):
        db.execute("UPDATE challenges SET attempts = attempts + 1 WHERE id = ?", (challenge_id,))
        db.commit()  # keep the attempt count even though the request fails
        left = OTP_MAX_ATTEMPTS - row["attempts"] - 1
        raise HTTPException(400, f"Wrong code. {left} attempt{'s' if left != 1 else ''} left.")
    db.execute("UPDATE challenges SET used = 1 WHERE id = ?", (challenge_id,))
    return row["user_id"]


def create_session(db: sqlite3.Connection, user: dict) -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    hours = SURVIVOR_SESSION_HOURS if user["role"] == "survivor" else STAFF_SESSION_HOURS
    expires = (_utcnow() + timedelta(hours=hours)).isoformat(timespec="seconds")
    db.execute(
        "INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)",
        (_sha(token), user["id"], now_iso(), expires),
    )
    return token, expires


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return None


def end_session(db: sqlite3.Connection, request: Request) -> None:
    token = _bearer(request)
    if token:
        db.execute("DELETE FROM sessions WHERE token_hash = ?", (_sha(token),))


def current_user(request: Request, db: sqlite3.Connection = Depends(db_dep)) -> dict:
    token = _bearer(request)
    if not token:
        raise HTTPException(401, "Please sign in.")
    row = db.execute(
        "SELECT u.*, s.expires_at AS session_expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
        (_sha(token),),
    ).fetchone()
    if not row or _expired(row["session_expires"]):
        raise HTTPException(401, "Your session has ended. Please sign in again.")
    if row["locked"]:
        raise HTTPException(423, "This account is locked. Contact the security admin.")
    if row["is_honey"]:
        from . import audit  # every move made with the honey account is recorded for the security admin
        audit.log(db, "honey_activity", actor=dict(row), detail=f"{request.method} {request.url.path}"[:120])
    return dict(row)


def require_roles(*roles: str):
    def checker(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, "You do not have access to this.")
        return user
    return checker


def public_user(db: sqlite3.Connection, user: dict) -> dict:
    """What the client may see about the signed-in user. No password hash, no raw phone."""
    station = None
    if user.get("station_id"):
        s = db.execute("SELECT id, name, city FROM stations WHERE id = ?", (user["station_id"],)).fetchone()
        station = dict(s) if s else None
    out = {
        "id": user["id"],
        "role": user["role"],
        "display_name": user["display_name"],
        "badge": user["badge"],
        "gender": user["gender"],
        "station": station,
        "child_trained": bool(user["child_trained"]),
    }
    if user["role"] == "survivor" and user.get("phone_enc"):
        phone = crypto.decrypt_text(user["phone_nonce"], user["phone_enc"], f"user-phone:{user['phone_hash']}")
        out["phone_masked"] = "******" + phone[-4:]
    return out
