"""Read a survivor's own complaint text (typed or from a photo) and pull out the form fields, so she does not have to
type them again. Works on English, Hindi and Kannada. She always checks and corrects the result before sending.
"""
import re
from datetime import date

from .config import CASE_YEAR
from .intake import detect_language, self_named
from .redaction import PATTERNS, TRIMMED

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6, "july": 7, "august": 8, "september": 9,
    "october": 10, "november": 11, "december": 12, "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
    "जनवरी": 1, "फ़रवरी": 2, "फरवरी": 2, "मार्च": 3, "अप्रैल": 4, "मई": 5, "जून": 6, "जुलाई": 7, "अगस्त": 8, "सितंबर": 9,
    "सितम्बर": 9, "अक्टूबर": 10, "अक्तूबर": 10, "नवंबर": 11, "नवम्बर": 11, "दिसंबर": 12, "दिसम्बर": 12,
    "ಜನವರಿ": 1, "ಫೆಬ್ರವರಿ": 2, "ಮಾರ್ಚ್": 3, "ಏಪ್ರಿಲ್": 4, "ಮೇ": 5, "ಜೂನ್": 6, "ಜುಲೈ": 7, "ಆಗಸ್ಟ್": 8, "ಸೆಪ್ಟೆಂಬರ್": 9,
    "ಅಕ್ಟೋಬರ್": 10, "ನವೆಂಬರ್": 11, "ಡಿಸೆಂಬರ್": 12,
}
_MONTH_ALT = "|".join(re.escape(m) for m in sorted(MONTHS, key=len, reverse=True))
DATE_RE = re.compile(rf"(?<!\d)(\d{{1,2}})(?:st|nd|rd|th)?\s+({_MONTH_ALT})\.?(?:,?\s+(\d{{4}}))?", re.IGNORECASE)
ISO_DATE_RE = re.compile(r"(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)")

AGE_RES = [
    re.compile(r"\b(?:I am|I'm|aged|age)\s*:?\s*(\d{1,2})\b", re.IGNORECASE),
    re.compile(r"\b(\d{1,2})\s*(?:years?|yrs?)\s*old\b", re.IGNORECASE),
    re.compile(r"(?:उम्र|आयु)\s*:?\s*(\d{1,2})"),
    re.compile(r"ನನಗೆ\s*(\d{1,2})\s*ವರ್ಷ"),
    re.compile(r"ವಯಸ್ಸು\s*:?\s*(\d{1,2})"),
]
STOP = {"है", "हैं", "का", "की", "के", "ने", "को", "से", "ಅವರ", "ಅವರು", "ಅವರಿಗೆ", "ಜೊತೆ", "ಮತ್ತು", "is", "was", "and"}
RELATIVES = {
    "father_name": [
        re.compile(r"\b(?:[Mm]y|[Hh]er)\s+father,?\s+(?:is\s+)?([A-Z][a-z]+)(?:\s([A-Z][a-z]+))?"),
        re.compile(r"(?:मेरे|उसके)\s+पिता\s+(?:जी\s+)?([^\s।,]+)(?:\s([^\s।,]+))?"),
        re.compile(r"(?:ನನ್ನ|ಅವಳ)\s+ತಂದೆ\s+([^\s.,]+)(?:\s([^\s.,]+))?"),
    ],
    "mother_name": [
        re.compile(r"\b(?:[Mm]y|[Hh]er)\s+mother,?\s+(?:is\s+)?([A-Z][a-z]+)(?:\s([A-Z][a-z]+))?"),
        re.compile(r"(?:मेरी|उसकी)\s+(?:माँ|माता)\s+(?:जी\s+)?([^\s।,]+)(?:\s([^\s।,]+))?"),
        re.compile(r"(?:ನನ್ನ|ಅವಳ|ತನ್ನ)\s+ತಾಯಿ\s+([^\s.,]+)(?:\s([^\s.,]+))?"),
    ],
}
LIVES = [
    re.compile(r"\bI live (?:at|in)\s+([^.\n]+)", re.IGNORECASE),
    re.compile(r"(?:मैं|हम)\s+([^।\n]+?)\s+में\s+रहती"),
    re.compile(r"([^\s.,]+)\s*(?:ನಲ್ಲಿ|ದಲ್ಲಿ)\s+ವಾಸ"),
]
PIN_RE = re.compile(r"(?<![\d-])[1-9]\d{5}(?![\d-])")
# Letters are addressed to a station but rarely give a pin code; the city they name gives a starting pin to check.
CITY_PINS = [
    (("bengaluru", "bangalore", "ಬೆಂಗಳೂರು", "बेंगलुरु", "बैंगलोर"), "560001"),
    (("mysuru", "mysore", "ಮೈಸೂರು", "मैसूर"), "570001"),
    (("delhi", "दिल्ली", "ದೆಹಲಿ"), "110001"),
]


def _city_pin(text: str) -> str | None:
    clean = text.replace("‌", "").replace("‍", "").lower()
    for names, pin in CITY_PINS:
        if any(n in clean for n in names):
            return pin
    return None


def _first_by_kind(text: str, kind: str) -> str | None:
    """First school or place the redaction patterns recognise, as written."""
    found = []
    for k, rx in PATTERNS:
        if k == kind:
            found += [(m.start(), m.group(0)) for m in rx.finditer(text)]
    for k, rx, stop in TRIMMED:
        if k == kind:
            for m in rx.finditer(text):
                words = m.group(1).split()
                while words and words[0] in stop:
                    words.pop(0)
                if words:
                    found.append((m.start() + m.group(0).index(words[0]), " ".join(words) + " " + m.group(2)))
    return min(found)[1].strip(" ,.") if found else None


# Kannada adds case endings to the last word ("ಶಾಲೆಯ" = "of the school"); the form wants the plain name.
KN_ENDINGS = [(re.compile(r"ಶಾಲೆ(?:ಯ|ಯಲ್ಲಿ|ಗೆ|ಯಿಂದ)$"), "ಶಾಲೆ"), (re.compile(r"ಕಾಲೇಜ(?:ಿನ|ಿನಲ್ಲಿ|ಿಗೆ|ಿಂದ)$"), "ಕಾಲೇಜು")]


def _plain(name: str | None) -> str | None:
    if not name:
        return name
    for rx, base in KN_ENDINGS:
        name = rx.sub(base, name)
    return name


def _relative(text: str, field: str) -> str | None:
    for rx in RELATIVES[field]:
        m = rx.search(text)
        if m:
            words = [w for w in m.groups() if w and w not in STOP]
            if words:
                return " ".join(words).strip(" ,.।")
    return None


def _date(text: str) -> str | None:
    for m in DATE_RE.finditer(text):
        day, month = int(m.group(1)), MONTHS[m.group(2).lower()]
        year = int(m.group(3)) if m.group(3) else CASE_YEAR
        try:
            return date(year, month, day).isoformat()
        except ValueError:
            continue
    m = ISO_DATE_RE.search(text)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat()
        except ValueError:
            return None
    return None


def extract(text: str) -> dict:
    text = text or ""
    names = self_named(text)
    age = next((m.group(1) for rx in AGE_RES for m in [rx.search(text)] if m), None)
    school = _plain(_first_by_kind(text, "school"))
    place = _first_by_kind(text, "place")
    lives = next((m.group(1).strip(" ,.।") for rx in LIVES for m in [rx.search(text)] if m), None)
    pins = PIN_RE.findall(text)
    locality = place or (lives.split(",")[-1].strip() if lives else None)
    identity = {
        "name": names[0] if names else None,
        "age": age,
        "father_name": _relative(text, "father_name"),
        "mother_name": _relative(text, "mother_name"),
        "school_or_workplace": school,
        "address": lives or place,
        "pincode": pins[0] if pins else None,
    }
    incident = {"date": _date(text), "locality": locality, "pincode": pins[0] if pins else _city_pin(text)}
    found = [k for k, v in identity.items() if v] + [f"incident.{k}" for k, v in incident.items() if v]
    return {"language": detect_language(text), "identity": identity, "incident": incident, "found": found}
