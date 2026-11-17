"""Kavach API entry point. In production it also serves the built web app, so the whole project is one server."""
import hashlib
import mimetypes
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse

from .config import FRONTEND_DIST, LOAD_DEMO_ON_START
from .db import get_db, init_schema
from .routes_auth import demo_router, router as auth_router
from .routes_copies import router as copies_router
from .routes_decoys import router as decoys_router
from .routes_police import router as police_router
from .routes_security import router as security_router
from .routes_survivor import router as survivor_router
from .security import client_key, is_blocked, limiter, raise_alert
from .seed import ensure_honey, seed_if_empty

mimetypes.add_type("image/webp", ".webp")  # slim container images do not know .webp


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_schema()
    seed_if_empty()
    ensure_honey()
    if LOAD_DEMO_ON_START:
        from .demo import load_when_ready
        threading.Thread(target=load_when_ready, daemon=True).start()
    yield


# Interactive API docs are switched off: they would map the whole API surface for an attacker.
app = FastAPI(title="Kavach API", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


def _is_security_admin(db, request: Request) -> bool:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        return False
    token_hash = hashlib.sha256(header[7:].strip().encode()).hexdigest()
    row = db.execute("SELECT u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?", (token_hash,)).fetchone()
    return bool(row and row["role"] == "security")


@app.middleware("http")
async def guard(request: Request, call_next):
    path = request.url.path
    if path != "/api/health":
        with get_db() as db:
            # A blocked client gets nothing, except sign-in and the security admin's own tools (so they can unblock).
            if is_blocked(db, request) and not path.startswith("/api/auth/") and not _is_security_admin(db, request):
                return JSONResponse({"detail": "Access blocked."}, status_code=403)
        key, _, _ = client_key(request)
        allowed, first = limiter.check(key)
        if not allowed:
            if first:
                with get_db() as db:
                    raise_alert(db, "rate_limit", "medium", "More than 300 requests in a minute from one client", request=request, target=path[:80])
            return JSONResponse({"detail": "Too many requests. Please slow down."}, status_code=429)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    if path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"
    return response


app.include_router(auth_router)
app.include_router(demo_router)
app.include_router(survivor_router)
app.include_router(police_router)
app.include_router(copies_router)
app.include_router(security_router)
app.include_router(decoys_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Production: serve the built web app. Registered last, so API and decoy routes always win.
if (FRONTEND_DIST / "index.html").exists():
    DIST = FRONTEND_DIST.resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    def web_app(full_path: str):
        if full_path.startswith("api/") or full_path == "api":
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        candidate = (DIST / full_path).resolve()
        if full_path and candidate.is_file() and DIST in candidate.parents:
            cache = "public, max-age=31536000, immutable" if full_path.startswith("assets/") else "no-cache"
            return FileResponse(candidate, headers={"Cache-Control": cache})
        # Any other path is a screen of the single-page app.
        return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-store"})
