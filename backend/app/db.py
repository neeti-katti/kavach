"""SQLite storage. Identity data never sits in these tables in plain text: it lives in vault_* as AES-GCM ciphertext."""
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from .config import DATA_DIR, DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS stations (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  city          TEXT NOT NULL,
  city_code     TEXT NOT NULL,
  pin_prefixes  TEXT NOT NULL            -- comma-separated 3-digit pin code prefixes
);

CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  role              TEXT NOT NULL CHECK (role IN ('survivor','helper','officer','supervisor','security')),
  username          TEXT UNIQUE,
  password_hash     TEXT,
  display_name      TEXT NOT NULL,
  badge             TEXT,
  gender            TEXT CHECK (gender IN ('F','M','X') OR gender IS NULL),
  station_id        TEXT REFERENCES stations(id),
  child_trained     INTEGER NOT NULL DEFAULT 0,
  on_duty           INTEGER NOT NULL DEFAULT 1,
  is_honey          INTEGER NOT NULL DEFAULT 0,
  locked            INTEGER NOT NULL DEFAULT 0,
  locked_reason     TEXT,
  phone_hash        TEXT UNIQUE,          -- keyed hash, for lookup only
  phone_nonce       BLOB,
  phone_enc         BLOB,                 -- AES-GCM ciphertext
  last_assigned_at  TEXT,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,           -- only the hash of the bearer token is stored
  user_id     INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS challenges (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  code_hash   TEXT NOT NULL,
  purpose     TEXT NOT NULL CHECK (purpose IN ('survivor_otp','staff_2fa')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  used        INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  id                   TEXT PRIMARY KEY,  -- e.g. KV-2026-BLR-0007
  survivor_user_id     INTEGER REFERENCES users(id),
  filed_by_user_id     INTEGER REFERENCES users(id),
  status               TEXT NOT NULL CHECK (status IN ('submitted','assigned','statement_scheduled','investigating','report_filed')),
  category             TEXT NOT NULL CHECK (category IN ('sexual_offence','child_victim','other')),
  is_child             INTEGER NOT NULL DEFAULT 0,
  urgent               INTEGER NOT NULL DEFAULT 0,
  language             TEXT,
  station_id           TEXT REFERENCES stations(id),
  area                 TEXT,              -- area only, never the full address
  incident_date        TEXT,
  assigned_officer_id  INTEGER REFERENCES users(id),
  assigned_at          TEXT,
  accepted_at          TEXT,
  narrative_tokenized  TEXT,              -- identity replaced by tokens like [SURVIVOR_NAME]
  case_sheet_json      TEXT,
  risk_score           INTEGER,
  sealed               INTEGER NOT NULL DEFAULT 0,
  is_canary            INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vault_fields (
  case_id     TEXT NOT NULL REFERENCES cases(id),
  field       TEXT NOT NULL,
  nonce       BLOB NOT NULL,
  ciphertext  BLOB NOT NULL,
  key_id      TEXT NOT NULL,
  PRIMARY KEY (case_id, field)
);

CREATE TABLE IF NOT EXISTS vault_files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id     TEXT NOT NULL REFERENCES cases(id),
  kind        TEXT NOT NULL,              -- e.g. original_scan
  mime        TEXT NOT NULL,
  nonce       BLOB NOT NULL,
  ciphertext  BLOB NOT NULL,
  key_id      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reveals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id      TEXT NOT NULL REFERENCES cases(id),
  officer_id   INTEGER NOT NULL REFERENCES users(id),
  field        TEXT NOT NULL,
  task         TEXT NOT NULL,
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pending','approved','denied','expired')),
  decided_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL,
  expires_at   TEXT
);

CREATE TABLE IF NOT EXISTS calls (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id       TEXT NOT NULL REFERENCES cases(id),
  officer_id    INTEGER NOT NULL REFERENCES users(id),
  relay_number  TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public_copies (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id      TEXT NOT NULL REFERENCES cases(id),
  profile      TEXT NOT NULL CHECK (profile IN ('public','court','internal')),
  risk_score   INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('released','needs_review','blocked')),
  body         TEXT NOT NULL,             -- built only from redacted text
  approved_by  INTEGER REFERENCES users(id),
  created_by   INTEGER NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT NOT NULL,
  actor_id    INTEGER,
  actor_role  TEXT,
  action      TEXT NOT NULL,
  case_id     TEXT,
  detail      TEXT,                       -- never personal data
  prev_hash   TEXT NOT NULL,
  hash        TEXT NOT NULL               -- hash chain makes edits detectable
);

CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('canary','decoy','honey_login','idor','rate_limit')),
  severity    TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  actor_id    INTEGER,
  ip          TEXT,
  detail      TEXT,
  resolved    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS blocked_clients (
  key         TEXT PRIMARY KEY,           -- address, or address + browser signature on a single demo machine
  ip          TEXT,
  ua          TEXT,
  reason      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cases_officer ON cases(assigned_officer_id);
CREATE INDEX IF NOT EXISTS idx_cases_survivor ON cases(survivor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_case ON audit_log(case_id);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    # check_same_thread=False: FastAPI may run a request's dependency and handler on different worker threads.
    conn = sqlite3.connect(DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def get_db():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def db_dep():
    """FastAPI dependency: one connection per request, committed on success."""
    with get_db() as conn:
        yield conn


# Columns added after Phase 1. Applied on start-up so existing databases keep working.
MIGRATIONS = [
    ("cases", "allocation_reason", "TEXT"),
    ("cases", "accept_by", "TEXT"),
    ("cases", "escalated", "INTEGER NOT NULL DEFAULT 0"),
    ("cases", "sealed_at", "TEXT"),
    ("cases", "report_summary", "TEXT"),
    ("alerts", "target", "TEXT"),
    ("alerts", "ua", "TEXT"),
]


def init_schema() -> None:
    with get_db() as conn:
        conn.executescript(SCHEMA)
        for table, column, kind in MIGRATIONS:
            existing = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
            if column not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {kind}")
