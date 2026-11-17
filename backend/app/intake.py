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


# "My name is …" in each language. A survivor may type her name in English in the form but write it in Kannada or
# Hindi in a photographed complaint; these catch the name in the text itself, and then every other mention of it.
SELF_NAME = [
    re.compile(r"\b[Mm]y name is\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)"),
    re.compile(r"मेरा नाम\s+([^\s।,.]+(?:\s[^\s।,.]+)?)\s+(?:है|हैं)"),
    re.compile(r"ನನ್ನ ಹೆಸರು\s+([^\s.,।]+(?:\s[^\s.,।]+)?)"),
]
SELF_NAME_STOP = {"है", "हैं", "ಆಗಿದೆ", "ಇದೆ"}


def boundary_pattern(value: str) -> str:
    """Match a value as a whole word. In Hindi and Kannada a case ending is often joined to the word
    ("ಹೊಸಹಳ್ಳಿಯ" = "of Hosahalli"), so for non-Latin values the end of the match may run into such an ending."""
    if value.isascii():
        return r"(?<!\w)" + re.escape(value) + r"(?!\w)"
    return r"(?<!\w)" + re.escape(value)


def self_named(text: str | None) -> list[str]:
    """Names the writer gives for herself, plus the first name on its own."""
    out = []
    for rx in SELF_NAME:
        for m in rx.finditer(text or ""):
            words = [w for w in m.group(1).split() if w not in SELF_NAME_STOP]
            if words:
                out.append(" ".join(words))
                if len(words) > 1 and len(words[0]) >= 3:
                    out.append(words[0])
    return out


def tokenize(text: str | None, identity: dict) -> str | None:
    if not text:
        return text
    pairs = [(name, "[SURVIVOR_NAME]") for name in self_named(text)]
    for field, value in identity.items():
        if field in TOKENS and value not in (None, ""):
            pairs.extend((variant, TOKENS[field]) for variant in _variants(field, str(value)))
    # Longest first, so "Kavya Rao" becomes one token before "Kavya" is looked at on its own.
    for variant, token in sorted(pairs, key=lambda p: len(p[0]), reverse=True):
        text = re.sub(boundary_pattern(variant), token, text, flags=re.IGNORECASE)
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
