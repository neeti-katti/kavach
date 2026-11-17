"""Synthetic seed data. Every name, number and place here is invented for the demo.

Run `python -m app.seed --reset` from backend/ to wipe and re-seed the database (keys are kept).
"""
import sys

from . import audit, crypto, vault
from .auth import hash_password
from .config import CASE_YEAR, DB_PATH, DEMO_STAFF_PASSWORD, DEMO_SURVIVOR_PHONE
from .db import get_db, init_schema, now_iso

STATIONS = [
    # id, name, city, city_code, pin code prefixes
    ("BLR-S", "Bengaluru South Police Station", "Bengaluru", "BLR", "560,561,562"),
    ("MYS-C", "Mysuru City Police Station", "Mysuru", "MYS", "570,571"),
    ("DEL-C", "New Delhi Central Police Station", "New Delhi", "DEL", "110"),
]

STAFF = [
    # username, display name, role, badge, gender, station, child-trained
    ("kavitha.rao", "Insp. Kavitha Rao", "officer", "KA-4412", "F", "BLR-S", 1),
    ("meena.iyer", "SI Meena Iyer", "officer", "KA-4518", "F", "BLR-S", 0),
    ("rohit.sharma", "SI Rohit Sharma", "officer", "KA-4630", "M", "BLR-S", 0),
    ("lakshmi.gowda", "Insp. Lakshmi Gowda", "officer", "KA-5102", "F", "MYS-C", 1),
    ("arjun.patil", "SI Arjun Patil", "officer", "KA-5217", "M", "MYS-C", 0),
    ("neha.verma", "Insp. Neha Verma", "officer", "DL-2208", "F", "DEL-C", 1),
    ("prakash.reddy", "SHO Prakash Reddy", "supervisor", "KA-1001", "M", "BLR-S", 0),
    ("shalini.hegde", "SHO Shalini Hegde", "supervisor", "KA-1002", "F", "MYS-C", 0),
    ("vikram.singh", "SHO Vikram Singh", "supervisor", "DL-1003", "M", "DEL-C", 0),
    ("anita.desai", "Anita Desai, Cyber Cell", "security", "CC-0901", "F", None, 0),
]

# Canary cases: realistic-looking decoys assigned to no one. No honest workflow ever opens them,
# so any read is a tripwire (wired up in Phase 6). Their IDs sit among normal case numbers.
CANARIES = [
    {"id": f"KV-{CASE_YEAR}-BLR-0003", "station": "BLR-S", "area": "Jayanagar, Bengaluru", "is_child": 0,
     "fields": {"name": "Pooja Nair", "phone": "9000000913", "address": "14, 3rd Cross, Jayanagar",
                "pincode": "560041", "father_name": "Ramesh Nair", "age": "24"}},
    {"id": f"KV-{CASE_YEAR}-BLR-0006", "station": "BLR-S", "area": "Banashankari, Bengaluru", "is_child": 1,
     "fields": {"name": "Divya Shetty", "phone": "9000000927", "address": "7, 9th Main, Banashankari",
                "pincode": "560050", "father_name": "Mohan Shetty", "school_or_workplace": "Govt High School, Banashankari",
                "age": "15"}},
    {"id": f"KV-{CASE_YEAR}-MYS-0002", "station": "MYS-C", "area": "Kuvempunagar, Mysuru", "is_child": 0,
     "fields": {"name": "Kavya Urs", "phone": "9000000938", "address": "22, 4th Stage, Kuvempunagar",
                "pincode": "570023", "mother_name": "Sudha Urs", "age": "29"}},
    {"id": f"KV-{CASE_YEAR}-MYS-0005", "station": "MYS-C", "area": "Hebbal, Mysuru", "is_child": 1,
     "fields": {"name": "Ananya Gowda", "phone": "9000000946", "address": "3, Industrial Layout, Hebbal",
                "pincode": "570016", "father_name": "Suresh Gowda", "school_or_workplace": "Sri Vidya Public School",
                "age": "16"}},
    {"id": f"KV-{CASE_YEAR}-DEL-0004", "station": "DEL-C", "area": "Karol Bagh, New Delhi", "is_child": 0,
     "fields": {"name": "Ritu Malhotra", "phone": "9000000952", "address": "B-41, Dev Nagar, Karol Bagh",
                "pincode": "110005", "father_name": "Anil Malhotra", "school_or_workplace": "City Garments Pvt Ltd",
                "age": "31"}},
]


def seed(db) -> None:
    ts = now_iso()
    db.executemany("INSERT INTO stations(id, name, city, city_code, pin_prefixes) VALUES (?,?,?,?,?)", STATIONS)

    pw = hash_password(DEMO_STAFF_PASSWORD)
    for username, name, role, badge, gender, station, child in STAFF:
        db.execute(
            "INSERT INTO users(role, username, password_hash, display_name, badge, gender, station_id, child_trained, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (role, username, pw, name, badge, gender, station, child, ts),
        )

    phone_hash = crypto.lookup_hash(DEMO_SURVIVOR_PHONE)
    nonce, ct = crypto.encrypt_text(DEMO_SURVIVOR_PHONE, f"user-phone:{phone_hash}")
    db.execute(
        "INSERT INTO users(role, display_name, phone_hash, phone_nonce, phone_enc, created_at) VALUES (?,?,?,?,?,?)",
        ("survivor", "Survivor", phone_hash, nonce, ct, ts),
    )

    for c in CANARIES:
        db.execute(
            "INSERT INTO cases(id, status, category, is_child, language, station_id, area, incident_date, "
            "narrative_tokenized, is_canary, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)",
            (c["id"], "investigating", "child_victim" if c["is_child"] else "sexual_offence", c["is_child"], "en",
             c["station"], c["area"], f"{CASE_YEAR}-09-1{c['is_child']}",
             "[SURVIVOR_NAME] reported an assault near [PLACE] on [DATE].", ts, ts),
        )
        vault.put_fields(db, c["id"], c["fields"])

    audit.log(db, "system_seeded", detail=f"stations={len(STATIONS)} staff={len(STAFF)} canaries={len(CANARIES)}")


# Honey credentials: this account exists only to be found. Its password sits in backend/legacy/config.old.env,
# a planted "old config" file. Logging in with it opens an empty view and raises a critical alert.
HONEY_USER = ("sysadmin", "Kv#Admin@2024", "System Administrator", "ADM-01")


def ensure_honey() -> None:
    with get_db() as db:
        if db.execute("SELECT 1 FROM users WHERE is_honey = 1").fetchone():
            return
        username, password, name, badge = HONEY_USER
        db.execute(
            "INSERT INTO users(role, username, password_hash, display_name, badge, gender, station_id, is_honey, created_at) "
            "VALUES ('supervisor', ?, ?, ?, ?, NULL, NULL, 1, ?)",
            (username, hash_password(password), name, badge, now_iso()),
        )


TABLES = ["public_copies", "calls", "reveals", "vault_files", "vault_fields", "alerts", "audit_log", "challenges", "sessions",
          "cases", "blocked_clients", "users", "stations"]


def reset_in_place() -> None:
    """Start over without stopping the server (on Windows a running server keeps the database file open)."""
    with get_db() as db:
        for table in TABLES:
            db.execute(f"DROP TABLE IF EXISTS {table}")
    init_schema()
    seed_if_empty()
    ensure_honey()


def seed_if_empty() -> bool:
    with get_db() as db:
        if db.execute("SELECT COUNT(*) FROM stations").fetchone()[0]:
            return False
        seed(db)
        return True


if __name__ == "__main__":
    if "--reset" in sys.argv:
        for suffix in ("", "-wal", "-shm"):
            p = DB_PATH.with_name(DB_PATH.name + suffix)
            if p.exists():
                p.unlink()
    init_schema()
    print("Seeded." if seed_if_empty() else "Database already has data; use --reset to start over.")
    ensure_honey()
