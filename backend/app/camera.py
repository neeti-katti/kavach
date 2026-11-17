"""Camera guard for police screens.

While an officer or supervisor uses Kavach, their browser keeps the webcam on and watches, on the device itself, for
a phone pointed at the screen. Video never leaves the browser: the server only hears "camera on" every few seconds
and a short note when a phone is seen or the camera goes off.

The server refuses police data to any session that has not reported its camera on recently. Turning the camera off,
or blocking it, therefore hides everything, not just the page in front of the officer.
"""
import hashlib
import sqlite3
import threading
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .auth import _bearer, require_roles
from .db import db_dep
from .security import raise_alert

HEARTBEAT_TTL = 45          # seconds a "camera on" report stays valid; the browser sends one every 10 s
ALERT_COOLDOWN = 60         # at most one camera alert per session and kind per minute
CAMERA_REQUIRED = "Turn on your camera to see case information."

_lock = threading.Lock()
_beats: dict[str, float] = {}               # session token hash -> time of last "camera on"
_last_alert: dict[tuple[str, str], float] = {}


def _session_key(request: Request) -> str:
    return hashlib.sha256((_bearer(request) or "").encode()).hexdigest()


def camera_on(request: Request) -> bool:
    with _lock:
        seen = _beats.get(_session_key(request))
    return seen is not None and time.monotonic() - seen <= HEARTBEAT_TTL


def camera_required(*roles: str):
    """require_roles, plus a recent camera heartbeat from this same session."""
    base = require_roles(*roles)

    def checker(request: Request, user: dict = Depends(base)) -> dict:
        if not camera_on(request):
            raise HTTPException(428, CAMERA_REQUIRED)
        return user
    return checker


router = APIRouter(prefix="/api/police/camera", tags=["camera"])
staff = require_roles("officer", "supervisor")


class Heartbeat(BaseModel):
    detector: Literal["loading", "ready", "unavailable"] = "loading"


class CameraEvent(BaseModel):
    kind: Literal["phone", "denied", "lost", "no_camera"]
    page: str | None = Field(default=None, max_length=120)
    score: float | None = Field(default=None, ge=0, le=1)


@router.post("/heartbeat")
def heartbeat(body: Heartbeat, request: Request, user: dict = Depends(staff)):
    with _lock:
        _beats[_session_key(request)] = time.monotonic()
    return {"ok": True, "ttl": HEARTBEAT_TTL}


EVENT_TEXT = {
    "phone": ("high", "Phone seen pointing at the screen of {who}. The screen was blanked."),
    "lost": ("medium", "Camera went off during a session for {who}. The screen was blanked."),
    "denied": ("low", "{who} did not allow the camera. No case information was shown."),
    "no_camera": ("low", "No camera found for {who}. No case information was shown."),
}


@router.post("/event")
def event(body: CameraEvent, request: Request, user: dict = Depends(staff), db: sqlite3.Connection = Depends(db_dep, scope="function")):
    key = _session_key(request)
    if body.kind != "phone":
        with _lock:
            _beats.pop(key, None)  # camera is off: stop serving data to this session at once
    now = time.monotonic()
    with _lock:
        if now - _last_alert.get((key, body.kind), -ALERT_COOLDOWN) < ALERT_COOLDOWN:
            return {"ok": True, "alert": False}
        _last_alert[(key, body.kind)] = now
    severity, text = EVENT_TEXT[body.kind]
    who = f"{user['display_name']} ({user.get('badge') or user['role']})"
    detail = text.format(who=who)
    if body.kind == "phone" and body.score is not None:
        detail += f" Confidence {round(body.score * 100)}%."
    raise_alert(db, "camera", severity, detail, actor=user, request=request, target=body.page)
    return {"ok": True, "alert": True}


def forget(request: Request) -> None:
    """Drop the session's camera state at sign-out."""
    key = _session_key(request)
    with _lock:
        _beats.pop(key, None)
        for k in [k for k in _last_alert if k[0] == key]:
            _last_alert.pop(k, None)
