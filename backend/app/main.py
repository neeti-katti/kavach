"""Kavach API entry point."""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .db import init_schema
from .routes_auth import demo_router, router as auth_router
from .routes_survivor import router as survivor_router
from .seed import seed_if_empty


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_schema()
    seed_if_empty()
    yield


# Interactive API docs are switched off: they would map the whole API surface for an attacker.
app = FastAPI(title="Kavach API", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.include_router(auth_router)
app.include_router(demo_router)
app.include_router(survivor_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
