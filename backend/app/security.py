"""Tripwires and responses: alerts, account lock-outs, client blocking and rate limiting.

Prevention (encryption, access checks, no bulk export) stops leaks. This layer catches whoever gets past it:
decoys that no honest workflow ever touches, so any touch is an alert.
"""
import hashlib
import sqlite3
import threading
import time
from collections import defaultdict, deque
from datetime import datetime

from fastapi import Request

from . import audit
from .db import now_iso

IDOR_LOCK_THRESHOLD = 3       # wrong-case attempts by one account within the window before it is locked
IDOR_WINDOW_SECONDS = 600
RATE_LIMIT = 300              # requests per client per minute
RATE_WINDOW_SECONDS = 60


def client_key(request: Request | None) -> tuple[str | None, str | None, str | None]:
    """Who is calling: the address plus the client's signature.

    The address comes from the server's own proxy handling (uvicorn trusts the forwarding proxy and resolves the
    caller's address), not from a header the caller could write. The signature is added because many people can share
    one address (a police station's network, a presenter's laptop and their test script); blocking the address alone
    would lock them all out because one client probed a decoy."""
    if request is None:
        return None, None, None
    ip = request.client.host if request.client else "unknown"
    ua = request.headers.get("user-agent", "")[:160]
    return f"{ip}|{hashlib.sha256(ua.encode()).hexdigest()[:12]}", ip, ua


def raise_alert(db: sqlite3.Connection, kind: str, severity: str, detail: str, actor: dict | None = None,
                request: Request | None = None, target: str | None = None) -> None:
    _, ip, ua = client_key(request)
    db.execute(
        "INSERT INTO alerts(ts, kind, severity, actor_id, ip, detail, target, ua) VALUES (?,?,?,?,?,?,?,?)",
        (now_iso(), kind, severity, actor["id"] if actor else None, ip, detail, target, ua),
    )
    audit.log(db, "alert_raised", actor=actor, detail=f"kind={kind} severity={severity} target={target}")


def lock_account(db: sqlite3.Connection, user_id: int, reason: str) -> None:
    db.execute("UPDATE users SET locked = 1, locked_reason = ? WHERE id = ?", (reason, user_id))
    db.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))  # every open session ends at once
    audit.log(db, "account_locked", detail=f"user={user_id} reason={reason}")


def block_client(db: sqlite3.Connection, request: Request, reason: str) -> None:
    key, ip, ua = client_key(request)
    db.execute("INSERT OR IGNORE INTO blocked_clients(key, ip, ua, reason, created_at) VALUES (?,?,?,?,?)", (key, ip, ua, reason, now_iso()))
    audit.log(db, "client_blocked", detail=f"ip={ip} reason={reason}")


def is_blocked(db: sqlite3.Connection, request: Request) -> bool:
    key, _, _ = client_key(request)
    return db.execute("SELECT 1 FROM blocked_clients WHERE key = ?", (key,)).fetchone() is not None


def trip_canary(db: sqlite3.Connection, user: dict | None, request: Request | None, case_id: str) -> None:
    """Someone opened a decoy case. No honest workflow lists or links these, so this is browsing or enumeration."""
    who = f"{user['role']} {user.get('badge') or user['id']}" if user else "unknown"
    raise_alert(db, "canary", "critical", f"Decoy case opened by {who}", actor=user, request=request, target=case_id)
    if user:
        lock_account(db, user["id"], f"Opened decoy case {case_id}")


def note_wrong_case(db: sqlite3.Connection, user: dict, request: Request | None, case_id: str) -> None:
    """A real case that is not this user's. One may be a typo; repeated attempts look like enumeration."""
    raise_alert(db, "idor", "medium", f"Tried to open a case that is not theirs ({user['role']})", actor=user, request=request, target=case_id)
    since = time.time() - IDOR_WINDOW_SECONDS
    recent = [r["ts"] for r in db.execute("SELECT ts FROM alerts WHERE kind = 'idor' AND severity = 'medium' AND actor_id = ?", (user["id"],))]
    count = sum(1 for ts in recent if datetime.fromisoformat(ts).timestamp() >= since)
    if count >= IDOR_LOCK_THRESHOLD:
        raise_alert(db, "idor", "high", f"{count} wrong-case attempts in 10 minutes: account locked", actor=user, request=request, target=case_id)
        lock_account(db, user["id"], f"{count} attempts to open cases that are not theirs")


class RateLimiter:
    def __init__(self, limit: int, window: int):
        self.limit, self.window = limit, window
        self.hits: dict[str, deque] = defaultdict(deque)
        self.alerted: dict[str, float] = {}
        self.lock = threading.Lock()

    def check(self, key: str) -> tuple[bool, bool]:
        """Returns (allowed, should_alert)."""
        now = time.time()
        with self.lock:
            q = self.hits[key]
            while q and q[0] < now - self.window:
                q.popleft()
            q.append(now)
            if len(q) <= self.limit:
                return True, False
            first = now - self.alerted.get(key, 0) > self.window
            if first:
                self.alerted[key] = now
            return False, first


limiter = RateLimiter(RATE_LIMIT, RATE_WINDOW_SECONDS)
