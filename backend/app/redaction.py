"""Kavach redaction engine for public copies.

Six layers, in order:
  1. Tagged fields   - everything the survivor typed into identity fields, with spelling variants and parts
  2. Patterns        - phone, Aadhaar, PAN, email, pin code, vehicle numbers, dates of birth, long numbers
  3. Places & clues  - schools, workplaces, villages and localities, caste or community, parents' jobs, exact ages
                       (English, Hindi and Kannada patterns)
  4. Relations       - "her uncle Ravi" (name removed); "her tutor" generalised to "a person known to her"
  5. Risk score      - the same detector is run again on the output; whatever it still finds is scored
  6. Rebuild         - the copy is assembled only from the redacted text; nothing hidden is carried over

The detector never returns the text it found, only where it is and what kind it is.
"""
import re
from dataclasses import dataclass

from .intake import _variants

# kind -> (points, token or None for generalised phrases, label, layer)
KINDS = {
    "name": (6, "[SURVIVOR_NAME]", "Survivor's name", 1),
    "father_name": (6, "[FATHER_NAME]", "Father's name", 1),
    "mother_name": (6, "[MOTHER_NAME]", "Mother's name", 1),
    "guardian_name": (6, "[GUARDIAN_NAME]", "Guardian's name", 1),
    "address": (6, "[ADDRESS]", "Home address", 1),
    "phone": (6, "[PHONE]", "Phone number", 2),
    "email": (6, "[EMAIL]", "Email", 2),
    "id_number": (6, "[ID_NUMBER]", "ID number", 2),
    "number": (6, "[NUMBER]", "Long number", 2),
    "pincode": (3, "[PINCODE]", "Pin code", 2),
    "vehicle": (3, "[VEHICLE]", "Vehicle number", 2),
    "dob": (3, "[DOB]", "Date of birth", 2),
    "school": (3, "[SCHOOL_OR_WORKPLACE]", "School or workplace", 3),
    "place": (3, "[PLACE]", "Village or locality", 3),
    "community": (3, "[COMMUNITY]", "Caste or community", 3),
    "occupation": (2, "[OCCUPATION]", "Parent's occupation", 3),
    "age": (1, "[AGE]", "Exact age", 3),
    "relative_name": (6, "[RELATIVE_NAME]", "A relative's name", 4),
    "other_name": (3, "[NAME]", "Another person's name", 4),
    "relation": (2, None, "Relation to the accused", 4),
    "date_place": (2, None, "Exact date together with the place", 3),
}
LAYERS = {1: "Tagged identity fields", 2: "Numbers and contact patterns", 3: "Places, schools and other clues", 4: "Relatives and relations"}

TAGGED_KIND = {
    "name": "name", "alias": "name", "father_name": "father_name", "mother_name": "mother_name", "guardian_name": "guardian_name",
    "phone": "phone", "email": "email", "address": "address", "pincode": "pincode", "school_or_workplace": "school",
}
KEEP = {"bengaluru", "bangalore", "mysuru", "mysore", "new delhi", "delhi", "india", "karnataka", "main road", "road"}
# Words in a locality name that are ordinary words on their own ("near the circle"), so they are not hidden alone.
GENERIC_PLACE_WORDS = {"circle", "road", "main", "cross", "market", "stand", "stop", "temple", "street", "block", "sector", "phase", "stage", "layout",
                       "colony", "extension", "nagar", "station"}

STOP_HI = {"मेरे", "मेरी", "मेरा", "अपने", "अपनी", "उसके", "उसकी", "उस", "इस", "के", "की", "का", "से", "में", "पर", "और", "वह", "वो",
           "हमारे", "ने", "को", "है", "थे", "थी", "था", "जी", "एक", "मैं", "हम", "तुम", "आप"}
STOP_KN = {"ನನ್ನ", "ಅವಳ", "ಅವನ", "ಅವರ", "ಆ", "ಈ", "ಮತ್ತು", "ಒಂದು", "ನಾನು", "ನನಗೆ", "ಅವಳು", "ಅವನು", "ನಾವು"}

TOKEN_RE = re.compile(r"\[[A-Z_]+\]")
PATTERNS = [
    ("email", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")),
    ("id_number", re.compile(r"(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)")),
    ("id_number", re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b")),
    ("phone", re.compile(r"(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)")),
    ("number", re.compile(r"(?<![\d-])\d(?: ?\d){7,13}(?![\d-])")),
    ("pincode", re.compile(r"(?<![\d-])[1-9]\d{5}(?![\d-])")),
    ("vehicle", re.compile(r"\b[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{1,3}[ -]?\d{4}\b")),
    ("dob", re.compile(r"(?i)\b(?:born on|date of birth|d\.?o\.?b\.?)[:\s]*\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}")),
    ("school", re.compile(r"(?:[A-Z][\w.'-]*\s+){1,5}(?:Higher Secondary School|High School|Public School|Primary School|School|College|"
                          r"Vidyalaya|Vidyashala|Academy|Institute|University|Convent)(?:,\s*[A-Z][a-z]+)?")),
    ("school", re.compile(r"(?:[A-Z][\w&.'-]*\s+){1,4}(?:Pvt\.?\s*Ltd\.?|Private Limited|Ltd\.?|Factory|Hospital|Mills|Industries|Garments)")),
    ("place", re.compile(r"\b[A-Z][a-z]+(?:halli|hally|pura|nagar|puram|palya|wadi|gaon|ganj|abad|pete|garh)\b")),
    ("place", re.compile(r"\b(?:[A-Z][a-z]+\s){1,2}(?:Village|village|Nagar|Layout|Colony|Extension|Mohalla|Ward|Basti|Chawl)\b")),
    ("place", re.compile(r"\b(?:village|Village) of [A-Z][a-z]+\b")),
    ("place", re.compile(r"[^\s.,]+(?:ಹಳ್ಳಿ|ಹಳ್ಳಿಯ|ಪುರ|ನಗರ|ಪಾಳ್ಯ)")),
    ("place", re.compile(r"(?:ग्राम|गाँव|गांव)\s[^\s।,]+")),
    ("community", re.compile(r"\b(?:[A-Z][a-z]+\s)?(?:[Cc]aste|[Cc]ommunity|[Tt]ribe|Dalit|Adivasi|Scheduled (?:Caste|Tribe)|OBC|SC/ST)\b")),
    ("community", re.compile(r"(?:[^\s।,]+\s)?(?:जाति|समुदाय|दलित|आदिवासी)")),
    ("community", re.compile(r"(?:[^\s.,]+\s)?(?:ಜಾತಿ|ಸಮುದಾಯ|ದಲಿತ)")),
    ("age", re.compile(r"(?i)\b(?:aged\s+)?\d{1,2}\s*(?:years?|yrs?)(?:\s*old)?\b")),
    ("age", re.compile(r"(?i)\baged\s+\d{1,2}\b")),
    ("age", re.compile(r"\(\s*\d{1,2}\s*\)")),
    ("age", re.compile(r"\d{1,2}\s*(?:वर्ष|साल)")),
    ("age", re.compile(r"\d{1,2}\s*ವರ್ಷ")),
    ("other_name", re.compile(r"\b(?:Mr|Mrs|Ms|Smt|Shri|Sri|Kumari|Dr)\.?\s[A-Z][a-z]+(?:\s[A-Z][a-z]+)?")),
    ("other_name", re.compile(r"(?:श्री|श्रीमती|कुमारी)\s[^\s।,]+(?:\s[^\s।,]+)?")),
]
# "<words> school" in Hindi and Kannada: leading pronouns and postpositions are trimmed off, the rest is the name.
TRIMMED = [
    ("school", re.compile(r"((?:[^\s।,.]+\s){1,3})(स्कूल|विद्यालय|महाविद्यालय|कॉलेज|पाठशाला)"), STOP_HI),
    ("place", re.compile(r"((?:[^\s।,.]+\s){1,2})(गाँव|गांव|मोहल्ला|कॉलोनी|बस्ती)"), STOP_HI),
    ("school", re.compile(r"((?:[^\s.,]+\s){1,3})(ಶಾಲೆಯ|ಶಾಲೆ|ಕಾಲೇಜಿನ|ಕಾಲೇಜು|ವಿದ್ಯಾಲಯ)"), STOP_KN),
    ("place", re.compile(r"((?:[^\s.,]+\s){1,2})(ಗ್ರಾಮ|ಬಡಾವಣೆ|ಕಾಲೋನಿ)"), STOP_KN),
]
RELATIVES_EN = "father|mother|brother|sister|uncle|aunt|cousin|husband|grandfather|grandmother|guardian"
RELATIVE_NAME_EN = re.compile(rf"\b(?:[Hh]er|[Hh]is|[Mm]y)\s+(?:{RELATIVES_EN})\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)")
RELATIVE_NAME_HI = re.compile(r"(?:पिता|माता|माँ|भाई|बहन|चाचा|मामा|पति|दादा|नाना)\s([^\s।,]+)(?:\s([^\s।,]+))?")
RELATION_EN = re.compile(r"\b(?:[Hh]er|[Hh]is|[Mm]y)\s+(uncle|aunt|cousin|stepfather|step-father|brother-in-law|tutor|teacher|coach|neighbour|neighbor|"
                         r"landlord|employer|boss|manager|principal|warden)\b(\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)?")
RELATION_HI = re.compile(r"(?:मेरे|मेरी|उसके|उसकी)\s(चाचा|मामा|फूफा|ताऊ|जीजा|ट्यूटर|शिक्षक|पड़ोसी|मालिक)")
RELATION_KN = re.compile(r"(?:ನನ್ನ|ಅವಳ)\s(ಚಿಕ್ಕಪ್ಪ|ಮಾವ|ಶಿಕ್ಷಕ|ನೆರೆಹೊರೆಯವರು)")
KIN = {"uncle", "aunt", "cousin", "stepfather", "step-father", "brother-in-law", "चाचा", "मामा", "फूफा", "ताऊ", "जीजा", "ಚಿಕ್ಕಪ್ಪ", "ಮಾವ"}
PARENT = re.compile(r"(?i)\b(?:father|mother|parents?)\b|पिता|माता|माँ|ತಂದೆ|ತಾಯಿ")
OCCUPATION = re.compile(r"(?i)\b(?:auto driver|daily wage worker|security guard|tailor|farmer|driver|labourer|laborer|carpenter|vendor|shopkeeper|"
                        r"clerk|constable|mechanic|weaver|fisherman|cook|maid|watchman|electrician|plumber|painter|barber|priest)\b"
                        r"|दर्जी|किसान|ड्राइवर|मज़दूर|मजदूर|दुकानदार|माली|चौकीदार|धोबी|ದರ್ಜಿ|ರೈತ|ಚಾಲಕ|ಕೂಲಿ")


@dataclass
class Span:
    start: int
    end: int
    kind: str
    replacement: str


GENERAL = {
    "en": ("a relative", "a person known to her"),
    "hi": ("एक रिश्तेदार", "एक परिचित व्यक्ति"),
    "kn": ("ಒಬ್ಬ ಸಂಬಂಧಿ", "ಒಬ್ಬ ಪರಿಚಿತ ವ್ಯಕ್ತಿ"),
}


def _generalise(word: str, lang: str) -> str:
    kin, known = GENERAL[lang]
    return kin if word in KIN else known


def detect(text: str, ctx: dict) -> list[Span]:
    """Find identifying spans. Returns positions and kinds only."""
    if not text:
        return []
    spans: list[Span] = []
    add = lambda s, e, k, rep=None: spans.append(Span(s, e, k, rep if rep is not None else KINDS[k][1]))  # noqa: E731

    for variant, kind in ctx["tagged"]:
        for m in re.finditer(r"(?<!\w)" + re.escape(variant) + r"(?!\w)", text, re.IGNORECASE):
            add(m.start(), m.end(), kind)
    for kind, rx in PATTERNS:
        for m in rx.finditer(text):
            add(m.start(), m.end(), kind)
    for kind, rx, stop in TRIMMED:
        for m in rx.finditer(text):
            words = m.group(1).split()
            while words and words[0] in stop:
                words.pop(0)
            if words:
                start = m.start() + m.group(0).index(words[0])
                add(start, m.end(), kind)
    for m in RELATIVE_NAME_EN.finditer(text):
        add(m.start(1), m.end(1), "relative_name")
    for m in RELATIVE_NAME_HI.finditer(text):
        first, second = m.group(1), m.group(2)
        if first in STOP_HI:
            continue
        end = m.end(2) if second and second not in STOP_HI else m.end(1)
        add(m.start(1), end, "relative_name")
    for rx, lang in ((RELATION_EN, "en"), (RELATION_HI, "hi"), (RELATION_KN, "kn")):
        for m in rx.finditer(text):
            # "her uncle Ravi Kumar" becomes "a relative": the relation and the name go together.
            add(m.start(), m.end(), "relation", _generalise(m.group(1), lang))
    for p in PARENT.finditer(text):
        o = OCCUPATION.search(text, p.end(), min(len(text), p.end() + 50))
        if o:
            add(o.start(), o.end(), "occupation")

    # Never touch tokens that are already there, and keep city names readable.
    tokens = [(m.start(), m.end()) for m in TOKEN_RE.finditer(text)]
    spans = [s for s in spans if not any(s.start < te and ts < s.end for ts, te in tokens)
             and text[s.start:s.end].strip().lower() not in KEEP]
    # Resolve overlaps: earliest first, longest first, highest points first.
    spans.sort(key=lambda s: (s.start, -(s.end - s.start), -KINDS[s.kind][0]))
    out, last_end = [], -1
    for s in spans:
        if s.start >= last_end:
            out.append(s)
            last_end = s.end
    return out


def apply(text: str, spans: list[Span]) -> str:
    for s in sorted(spans, key=lambda s: s.start, reverse=True):
        text = text[:s.start] + s.replacement + text[s.end:]
    return text


def mark_leaks(text: str, spans: list[Span]) -> str:
    """For the comparison view: replace each leak with a marker that names its kind but never shows its text."""
    for s in sorted(spans, key=lambda s: s.start, reverse=True):
        text = text[:s.start] + "{{LEAK:" + s.kind + "}}" + text[s.end:]
    return text


def build_context(identity: dict, locality: str | None) -> dict:
    tagged = []
    for field, value in identity.items():
        kind = TAGGED_KIND.get(field)
        if kind and value:
            tagged.extend((v, kind) for v in _variants(field, str(value)) if v.strip().lower() not in KEEP and len(v.strip()) >= 3)
    if locality:
        loc = locality.strip()
        tagged.append((loc, "place"))
        tagged.extend((w, "place") for w in loc.split() if len(w) >= 4 and w.lower() not in KEEP and w.lower() not in GENERIC_PLACE_WORDS)
    return {"tagged": tagged}


def score(findings: list[Span], extra: list[str] = ()) -> tuple[int, list[dict]]:
    kinds = [s.kind for s in findings] + list(extra)
    total = sum(KINDS[k][0] for k in kinds)
    # A place and a school from the same area together point to one person: count them double.
    if "place" in kinds and "school" in kinds:
        total += KINDS["place"][0] + KINDS["school"][0]
    summary = {}
    for k in kinds:
        summary.setdefault(k, {"kind": k, "label": KINDS[k][2], "points": KINDS[k][0], "count": 0})["count"] += 1
    return total, sorted(summary.values(), key=lambda f: -f["points"])


def decision(total: int, profile: str, findings: list[dict]) -> str:
    if profile == "court":
        return "blocked" if any(f["points"] >= 6 for f in findings) else "released"
    if total >= 6:
        return "blocked"
    return "needs_review" if total >= 3 else "released"
