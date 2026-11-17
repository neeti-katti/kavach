"""The identity vault: survivor details per case, each field encrypted on its own."""
import sqlite3

from . import crypto
from .db import now_iso

# Fields that identify the survivor. Only these go into the vault.
IDENTITY_FIELDS = (
    "name", "alias", "phone", "email", "address", "pincode",
    "father_name", "mother_name", "guardian_name",
    "school_or_workplace", "age", "date_of_birth",
)


def _aad(case_id: str, field: str) -> str:
    return f"case:{case_id}:field:{field}"


def put_field(db: sqlite3.Connection, case_id: str, field: str, value: str) -> None:
    nonce, ct = crypto.encrypt_text(value, _aad(case_id, field))
    db.execute(
        "INSERT INTO vault_fields(case_id, field, nonce, ciphertext, key_id) VALUES (?,?,?,?,?) "
        "ON CONFLICT(case_id, field) DO UPDATE SET nonce=excluded.nonce, ciphertext=excluded.ciphertext, key_id=excluded.key_id",
        (case_id, field, nonce, ct, crypto.KEY_ID),
    )


def put_fields(db: sqlite3.Connection, case_id: str, values: dict[str, str]) -> None:
    for field, value in values.items():
        if value not in (None, ""):
            put_field(db, case_id, field, str(value))


def get_fields(db: sqlite3.Connection, case_id: str, fields: list[str] | None = None) -> dict[str, str]:
    """Decrypt fields for one case. Callers must have checked access first."""
    rows = db.execute("SELECT field, nonce, ciphertext FROM vault_fields WHERE case_id = ?", (case_id,)).fetchall()
    out = {}
    for r in rows:
        if fields is None or r["field"] in fields:
            out[r["field"]] = crypto.decrypt_text(r["nonce"], r["ciphertext"], _aad(case_id, r["field"]))
    return out


def put_file(db: sqlite3.Connection, case_id: str, kind: str, mime: str, data: bytes) -> int:
    nonce, ct = crypto.encrypt(data, f"case:{case_id}:file:{kind}")
    cur = db.execute(
        "INSERT INTO vault_files(case_id, kind, mime, nonce, ciphertext, key_id, created_at) VALUES (?,?,?,?,?,?,?)",
        (case_id, kind, mime, nonce, ct, crypto.KEY_ID, now_iso()),
    )
    return cur.lastrowid


def get_file(db: sqlite3.Connection, case_id: str, kind: str) -> tuple[str, bytes] | None:
    r = db.execute(
        "SELECT mime, nonce, ciphertext FROM vault_files WHERE case_id = ? AND kind = ? ORDER BY id DESC LIMIT 1",
        (case_id, kind),
    ).fetchone()
    if not r:
        return None
    return r["mime"], crypto.decrypt(r["nonce"], r["ciphertext"], f"case:{case_id}:file:{kind}")
