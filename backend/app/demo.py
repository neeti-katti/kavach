"""Reset Kavach and load the demo story. Run from kavach/backend while the API is running:

    .venv\\Scripts\\python -m app.demo

All people, numbers and places are invented.
"""
import json
import os
import sqlite3
import sys
import urllib.request

from .config import DB_PATH
from .seed import reset_in_place

API = os.environ.get("KAVACH_API_BASE", f"http://127.0.0.1:{os.environ.get('PORT', '8000')}/api")
HEADERS = {"Content-Type": "application/json", "User-Agent": "kavach-demo-loader"}


def call(path, body=None, token=None):
    headers = {**HEADERS, **({"Authorization": f"Bearer {token}"} if token else {})}
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, headers=headers,
                                 method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b"null")


def login(username=None, phone=None):
    s = call("/auth/survivor/start", {"phone": phone}) if phone else call("/auth/staff/login", {"username": username, "password": "kavach@123"})
    return call("/auth/verify", {"challenge_id": s["challenge_id"], "code": s["demo_code"]})["token"]


CHILD = {
    "identity": {"name": "Kavya Rao", "phone": "9876543210", "address": "12, 4th Cross, Hosahalli Main Road", "pincode": "560041",
                 "father_name": "Suresh Rao", "mother_name": "Lata Rao", "school_or_workplace": "Government High School, Hosahalli", "age": 16},
    "incident": {"date": "2026-11-12", "time": "18:30", "locality": "Hosahalli", "pincode": "560041", "place": "Near the bus stop on Hosahalli Main Road"},
    "accused": "A man of about 30 who runs the phone repair shop near the school. Medium build, beard.",
    "narrative": "On the evening of 12 November, Kavya was walking home from Government High School, Hosahalli. The man who runs the phone "
                 "repair shop near the school followed her to the bus stop and grabbed her. She broke free and ran. Her father Suresh came "
                 "when she called him on 9876543210. Her mother Lata Rao took her home.",
    "urgent": True,
}
ADULT = {
    "identity": {"name": "Meera Kulkarni", "phone": "9123456780", "address": "22, 5th Main Road, Hosahalli", "pincode": "560041",
                 "mother_name": "Sunita Kulkarni", "age": 19},
    "incident": {"date": "2026-10-14", "time": "19:00", "locality": "Hosahalli Circle", "pincode": "560041", "place": "The lane behind the temple"},
    "accused": "Works at the tea stall near the circle, about 35, scar on his left hand.",
    "narrative": "On 14 October I was walking back from my tuition class near Hosahalli Circle. A man who works at the tea stall followed me "
                 "and assaulted me in the lane behind the temple. My mother Sunita Kulkarni can be reached on 9123456780.",
}
HINDI = {
    "identity": {"name": "पूजा शर्मा", "phone": "9811122233", "address": "बी-41, देव नगर, करोल बाग", "pincode": "110005", "father_name": "रमेश शर्मा", "age": 22},
    "incident": {"date": "2026-10-10", "time": "19:00", "locality": "करोल बाग", "pincode": "110005", "place": "बाज़ार के पीछे वाली गली"},
    "accused": "लगभग 30 साल का आदमी, नीली कमीज़ पहने हुए",
    "narrative": "मेरा नाम पूजा शर्मा है। मेरी उम्र 22 वर्ष है। 10 अक्टूबर 2026 की शाम को मैं करोल बाग के बाज़ार से घर लौट रही थी। एक आदमी ने मेरा पीछा "
                 "किया और गली में मेरे साथ ज़बरदस्ती की। वह लगभग 30 साल का था और उसने नीली कमीज़ पहनी थी। मेरे पिता रमेश शर्मा का फ़ोन नंबर 9812345670 है।",
    "language": "hi",
}


def load_when_ready(timeout: float = 60) -> None:
    """Used at start-up on a fresh host: wait for the server to answer, then load the demo story once."""
    import time
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(API + "/health", timeout=2):
                break
        except OSError:
            time.sleep(0.5)
    db = sqlite3.connect(DB_PATH)
    try:
        has_cases = db.execute("SELECT COUNT(*) FROM cases WHERE is_canary = 0").fetchone()[0] > 0
    finally:
        db.close()
    if not has_cases:
        main()


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    reset_in_place()
    survivor = login(phone="9000000001")
    a = call("/survivor/complaints", CHILD, survivor)
    b = call("/survivor/complaints", ADULT, survivor)
    c = call("/survivor/complaints", HINDI, survivor)

    kavitha = login("kavitha.rao")  # case A: accepted, statement scheduled; the live demo continues from here
    call(f"/police/cases/{a['id']}/accept", {}, kavitha)
    call(f"/police/cases/{a['id']}/status", {"status": "statement_scheduled"}, kavitha)

    neha = login("neha.verma")  # case C: investigated, sealed, public copy released
    call(f"/police/cases/{c['id']}/accept", {}, neha)
    call(f"/police/cases/{c['id']}/status", {"status": "statement_scheduled"}, neha)
    call(f"/police/cases/{c['id']}/status", {"status": "investigating"}, neha)
    call(f"/police/cases/{c['id']}/submit-report", {"summary": "Statement recorded with her father present. CCTV from the market lane identified the accused, who was arrested on 13 October."}, neha)
    call(f"/police/cases/{c['id']}/copies", {"profile": "public"}, neha)

    db = sqlite3.connect(DB_PATH)  # case B: nobody accepted it in time, so it shows as escalated
    db.execute("UPDATE cases SET accept_by = '2026-01-01T00:00:00+00:00' WHERE id = ?", (b["id"],))
    db.commit()
    db.close()

    print("Kavach demo data loaded.")
    print(f"  {a['id']}  child, urgent, Bengaluru  -> {a['officer']['display_name']} (accepted, statement scheduled)")
    print(f"  {b['id']}  adult, Bengaluru          -> {b['officer']['display_name']} (escalated: not accepted in time)")
    print(f"  {c['id']}  Hindi, New Delhi          -> {c['officer']['display_name']} (sealed, public copy released)")
    print("  Decoy cases: KV-2026-BLR-0003, -0006, KV-2026-MYS-0002, -0005, KV-2026-DEL-0004")
    print("  Staff password: kavach@123 · survivor phone: 9000000001 · honey login: sysadmin / Kv#Admin@2024")


if __name__ == "__main__":
    main()
