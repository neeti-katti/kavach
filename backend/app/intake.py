"""Complaint intake helpers: tag identity at the source, pick the station, number the case.

"Tag at source, redact at release": anything the survivor typed into an identity field is replaced by a token
in every free-text field before the text is stored for police eyes. The originals go only into the vault.
"""
import re
import sqlite3

from .config import CASE_YEAR

TOKENS = {
    "name": "[SURVIVOR_NAME]",
    "alias": "[SURVIVOR_NAME]",
    "father_name": "[FATHER_NAME]",
    "mother_name": "[MOTHER_NAME]",
    "guardian_name": "[GUARDIAN_NAME]",
    "phone": "[PHONE]",
    "email": "[EMAIL]",
    "address": "[ADDRESS]",
    "pincode": "[PINCODE]",
    "school_or_workplace": "[SCHOOL_OR_WORKPLACE]",
}
PERSON_FIELDS = {"name", "alias", "father_name", "mother_name", "guardian_name"}

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
AADHAAR_RE = re.compile(r"(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)")
PHONE_RE = re.compile(r"(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)")
# Safety net for numbers OCR has garbled (a phone read with a digit missing): any run of 8+ digits, optionally
# split by single spaces. Hyphens are excluded so dates like 2026-11-12 stay readable.
LONG_NUMBER_RE = re.compile(r"(?<![\d-])\d(?: ?\d){7,13}(?![\d-])")


def _variants(field: str, value: str) -> list[str]:
    """The value plus the parts people actually write: first names, surnames, parts of an address."""
    value = value.strip()
    out = {value}
    if field in PERSON_FIELDS:
        out.update(p.strip(".,") for p in value.split() if len(p.strip(".,")) >= 3)
    elif field in ("address", "school_or_workplace"):
        out.update(p.strip() for p in value.split(",") if len(p.strip()) >= 6)
    elif field == "phone":
        digits = re.sub(r"\D", "", value)
        out.add(digits[-10:])
    return [v for v in out if v]


def tokenize(text: str | None, identity: dict) -> str | None:
    if not text:
        return text
    pairs = []
    for field, value in identity.items():
        if field in TOKENS and value not in (None, ""):
            pairs.extend((variant, TOKENS[field]) for variant in _variants(field, str(value)))
    # Longest first, so "Kavya Rao" becomes one token before "Kavya" is looked at on its own.
    for variant, token in sorted(pairs, key=lambda p: len(p[0]), reverse=True):
        text = re.sub(r"(?<!\w)" + re.escape(variant) + r"(?!\w)", token, text, flags=re.IGNORECASE)
    text = EMAIL_RE.sub("[EMAIL]", text)
    text = AADHAAR_RE.sub("[ID_NUMBER]", text)
    text = PHONE_RE.sub("[PHONE]", text)
    text = LONG_NUMBER_RE.sub("[NUMBER]", text)
    return text


def detect_language(text: str) -> str:
    deva = len(re.findall(r"[ऀ-ॿ]", text))
    kann = len(re.findall(r"[ಀ-೿]", text))
    if max(deva, kann) < 5:
        return "en"
    return "hi" if deva >= kann else "kn"


def station_for_pincode(db: sqlite3.Connection, pincode: str) -> sqlite3.Row:
    prefix = (pincode or "")[:3]
    for station in db.execute("SELECT * FROM stations ORDER BY id"):
        if prefix in station["pin_prefixes"].split(","):
            return station
    # Unknown area: in the demo the first station takes it, as the nearest station would in practice.
    return db.execute("SELECT * FROM stations ORDER BY id LIMIT 1").fetchone()


def next_case_id(db: sqlite3.Connection, city_code: str) -> str:
    prefix = f"KV-{CASE_YEAR}-{city_code}-"
    rows = db.execute("SELECT id FROM cases WHERE id LIKE ?", (prefix + "%",)).fetchall()
    n = max((int(r["id"].rsplit("-", 1)[1]) for r in rows), default=0) + 1
    return f"{prefix}{n:04d}"
