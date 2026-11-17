"""Decoy endpoints. Nothing in Kavach links to or calls these paths; they exist only to be found by someone probing.
Any request to one raises an alert, blocks the caller, and locks the account if the request carried a session.
"""
import hashlib
import sqlite3

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .db import get_db
from .security import block_client, lock_account, raise_alert

DECOY_PATHS = [
    "/api/admin/export-all",
    "/api/admin/users",
    "/api/v1/victims",
    "/api/internal/debug",
    "/api/backup.sql",
    "/api/.env",
    "/api/.git/config",
    "/backup.sql",
    "/.env",
    "/.git/config",
    "/config.old.env",
]

router = APIRouter(include_in_schema=False)


def _session_user(db: sqlite3.Connection, request: Request) -> dict | None:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    token_hash = hashlib.sha256(header[7:].strip().encode()).hexdigest()
    row = db.execute("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?", (token_hash,)).fetchone()
    return dict(row) if row else None


async def decoy(request: Request):
    path = request.url.path
    with get_db() as db:
        user = _session_user(db, request)
        who = f"{user['role']} {user.get('badge') or user['id']}" if user else "an unauthenticated client"
        raise_alert(db, "decoy", "high", f"Decoy endpoint {path} requested by {who}", actor=user, request=request, target=path)
        block_client(db, request, f"Requested decoy {path}")
        if user:
            lock_account(db, user["id"], f"Requested decoy endpoint {path}")
    return JSONResponse({"detail": "Access blocked."}, status_code=403)


for _path in DECOY_PATHS:
    router.add_api_route(_path, decoy, methods=["GET", "POST", "PUT", "DELETE"])
