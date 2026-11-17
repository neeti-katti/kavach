"""Measure how many planted identifiers the redaction engine removes, on a synthetic set it was not tuned on.

    python -m eval.evaluate          (from kavach/backend)

90 complaints (30 each in English, Hindi and Kannada) are generated from templates written for this evaluation, with
invented names, schools, villages, phone numbers and ages. Two settings:
  tagged    - she typed her details into the form in the same script (the normal case)
  untagged  - nothing typed into the form; only the rules can find identifiers (the worst case)
Recall = planted identifier strings no longer present in the public copy. Controls are ordinary case words
("bus stand", "the accused") that should survive; their survival shows over-redaction.
"""
import json
import random
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.redaction import apply, build_context, detect  # noqa: E402

SETS = {
    "English": {
        "names": ["Ananya Reddy", "Priya Nair", "Sneha Patil", "Divya Menon", "Ritu Singh", "Asha Kumari", "Fatima Sheikh", "Neha Joshi"],
        "fathers": ["Ramesh Reddy", "Mahesh Nair", "Abdul Rahim", "Prakash Patil", "Venkatesh Menon"],
        "mothers": ["Sunita Devi", "Kamala Bai", "Shabana Begum", "Geeta Joshi"],
        "schools": ["Sri Sai Vidya Mandir", "Government Girls High School", "St. Mary's Convent", "Little Flower Public School", "Kendriya Vidyalaya"],
        "villages": ["Doddaballapura", "Hosakote", "Devanahalli", "Kengeri", "Yelahanka", "Attibele"],
        "months": ["March", "June", "August", "October"],
        "templates": [
            "My name is {name}. I am {age} years old and I study at {school} in {village}. On {date}, a man followed me near the bus stand. "
            "My father {father} can be reached on {phone}.",
            "{name} ({age}) lives with her mother {mother} in {village}. She was walking back from {school} when the accused stopped her. "
            "Her father {father} called the police from {phone}.",
            "I, {name}, aged {age}, was going to {school} on {date}. The driver of the school van touched me. My mother {mother} lives in "
            "{village}. Please call {phone}.",
        ],
        "controls": ["bus stand", "the accused", "school van", "the police", "a man followed me"],
    },
    "Hindi": {
        "names": ["प्रिया वर्मा", "सीमा यादव", "अंजलि गुप्ता", "रेखा कुमारी", "नेहा सिंह", "पूजा शर्मा"],
        "fathers": ["राजेश वर्मा", "सुनील यादव", "मनोज गुप्ता", "रामलाल"],
        "mothers": ["सुनीता देवी", "कमला देवी", "गीता"],
        "schools": ["सरस्वती विद्या मंदिर", "राजकीय कन्या विद्यालय", "केंद्रीय विद्यालय", "आदर्श पब्लिक स्कूल"],
        "villages": ["रामपुर", "सिकंदरपुर", "मोहनपुर", "करोल बाग"],
        "months": ["मार्च", "जून", "अगस्त", "अक्टूबर"],
        "templates": [
            "मेरा नाम {name} है। मेरी उम्र {age} वर्ष है। मैं {school} में पढ़ती हूँ और {village} गाँव में रहती हूँ। {date} को एक आदमी ने मेरा पीछा किया। "
            "मेरे पिता {father} का नंबर {phone} है।",
            "{name} अपनी माँ {mother} के साथ {village} में रहती है। {school} से लौटते समय आरोपी ने उसे रोका। उसके पिता {father} ने {phone} से पुलिस को फ़ोन किया।",
            "मैं {name}, उम्र {age} साल, {date} को {school} जा रही थी। वैन के ड्राइवर ने मेरे साथ गलत हरकत की। मेरी माँ {mother} से {phone} पर बात करें।",
        ],
        "controls": ["आदमी", "आरोपी", "ड्राइवर", "पुलिस"],
    },
    "Kannada": {
        "names": ["ಕಾವ್ಯ ಗೌಡ", "ಸುಮಾ ಹೆಗಡೆ", "ರೇಖಾ ನಾಯಕ್", "ದಿವ್ಯ ಶೆಟ್ಟಿ", "ಅನಿತಾ ಕುಮಾರಿ"],
        "fathers": ["ಮಂಜುನಾಥ ಗೌಡ", "ರಮೇಶ ಹೆಗಡೆ", "ಸುರೇಶ ನಾಯಕ್"],
        "mothers": ["ಲಕ್ಷ್ಮಿ", "ಸುನೀತಾ"],
        "schools": ["ಸರ್ಕಾರಿ ಪ್ರೌಢ ಶಾಲೆ", "ವಿದ್ಯಾ ನಿಕೇತನ ಶಾಲೆ", "ಸರ್ಕಾರಿ ಪದವಿ ಕಾಲೇಜು"],
        "villages": ["ಹೊಸಹಳ್ಳಿ", "ದೊಡ್ಡಬಳ್ಳಾಪುರ", "ಕೆಂಗೇರಿ", "ಮಾಗಡಿ"],
        "months": ["ಮಾರ್ಚ್", "ಜೂನ್", "ಆಗಸ್ಟ್", "ಅಕ್ಟೋಬರ್"],
        "templates": [
            "ನನ್ನ ಹೆಸರು {name}. ನನಗೆ {age} ವರ್ಷ. ನಾನು {village} ಗ್ರಾಮದ {school} ಯಲ್ಲಿ ಓದುತ್ತೇನೆ. {date} ರಂದು ಒಬ್ಬ ವ್ಯಕ್ತಿ ನನ್ನನ್ನು ಹಿಂಬಾಲಿಸಿದನು. "
            "ನನ್ನ ತಂದೆ {father} ಅವರ ಸಂಖ್ಯೆ {phone}.",
            "{name} ತನ್ನ ತಾಯಿ {mother} ಜೊತೆ {village} ನಲ್ಲಿ ವಾಸಿಸುತ್ತಾಳೆ. {school} ನಿಂದ ಮನೆಗೆ ಬರುವಾಗ ಆರೋಪಿ ಅವಳನ್ನು ತಡೆದನು. "
            "ಅವಳ ತಂದೆ {father} {phone} ಮೂಲಕ ಪೊಲೀಸರಿಗೆ ಕರೆ ಮಾಡಿದರು.",
            "ನಾನು {name}, ವಯಸ್ಸು {age} ವರ್ಷ. {date} ರಂದು {school} ಗೆ ಹೋಗುತ್ತಿದ್ದಾಗ ವ್ಯಾನ್ ಚಾಲಕ ಕೆಟ್ಟದಾಗಿ ವರ್ತಿಸಿದನು. ನನ್ನ ತಾಯಿ {mother} ಅವರಿಗೆ {phone} ಗೆ ಕರೆ ಮಾಡಿ.",
        ],
        "controls": ["ವ್ಯಕ್ತಿ", "ಆರೋಪಿ", "ಪೊಲೀಸರಿಗೆ", "ಚಾಲಕ"],
    },
}
CATEGORIES = {"name": "Survivor's name", "father": "Father's name", "mother": "Mother's name", "school": "School",
              "village": "Village / locality", "phone": "Phone number", "age": "Exact age"}


def phone(r: random.Random) -> str:
    n = f"{r.choice('6789')}{r.randrange(10**8, 10**9)}"
    return r.choice([n, f"{n[:5]} {n[5:]}", f"+91 {n}"])


def generate(per_language: int = 30, seed: int = 7):
    r = random.Random(seed)
    cases = []
    for lang, s in SETS.items():
        for i in range(per_language):
            v = {"name": r.choice(s["names"]), "father": r.choice(s["fathers"]), "mother": r.choice(s["mothers"]),
                 "school": r.choice(s["schools"]), "village": r.choice(s["villages"]), "phone": phone(r), "age": str(r.randrange(13, 31)),
                 "date": f"{r.randrange(1, 10)} {r.choice(s['months'])} 2026"}
            text = s["templates"][i % len(s["templates"])].format(**v)
            planted = {k: v[k] for k in CATEGORIES if "{" + k + "}" in s["templates"][i % len(s["templates"])]}
            cases.append({"lang": lang, "text": text, "values": v, "planted": planted, "controls": [c for c in s["controls"] if c in text]})
    return cases


def present(value: str, kind: str, text: str) -> bool:
    if kind == "age":
        return re.search(rf"(?<!\d){value}(?!\d)", text) is not None
    if kind == "phone":
        return re.sub(r"\D", "", value)[-10:] in re.sub(r"\D", "", text)
    return value in text


def run():
    cases = generate()
    results = {}
    for setting in ("tagged", "untagged"):
        hit, total = defaultdict(int), defaultdict(int)
        ctrl_kept, ctrl_total = defaultdict(int), defaultdict(int)
        for c in cases:
            v = c["values"]
            identity = {"name": v["name"], "father_name": v["father"], "mother_name": v["mother"], "school_or_workplace": v["school"],
                        "phone": v["phone"]} if setting == "tagged" else {}
            ctx = build_context(identity, v["village"] if setting == "tagged" else None)
            out = apply(c["text"], detect(c["text"], ctx))
            for kind, value in c["planted"].items():
                total[(c["lang"], kind)] += 1
                hit[(c["lang"], kind)] += 0 if present(value, kind, out) else 1
            for ctl in c["controls"]:
                ctrl_total[c["lang"]] += 1
                ctrl_kept[c["lang"]] += 1 if ctl in out else 0
        table = {}
        for lang in SETS:
            row = {k: (hit[(lang, k)], total[(lang, k)]) for k in CATEGORIES if total[(lang, k)]}
            all_hit, all_tot = sum(h for h, _ in row.values()), sum(t for _, t in row.values())
            table[lang] = {"by_category": {k: {"removed": h, "planted": t, "recall": round(h / t, 3)} for k, (h, t) in row.items()},
                           "overall": {"removed": all_hit, "planted": all_tot, "recall": round(all_hit / all_tot, 3)},
                           "controls_kept": round(ctrl_kept[lang] / ctrl_total[lang], 3) if ctrl_total[lang] else None}
        results[setting] = table
    return {"complaints": len(cases), "per_language": len(cases) // len(SETS), "results": results}


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    res = run()
    out = Path(__file__).resolve().parents[2] / "reports" / "eval-results.json"
    out.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    for setting, table in res["results"].items():
        print(f"\n== {setting} ({res['complaints']} complaints) ==")
        print(f"{'':10}" + "".join(f"{CATEGORIES[k][:14]:>16}" for k in CATEGORIES) + f"{'overall':>12}{'controls kept':>15}")
        for lang, t in table.items():
            cells = "".join(f"{(str(round(t['by_category'][k]['recall'] * 100)) + '%') if k in t['by_category'] else '-':>16}" for k in CATEGORIES)
            print(f"{lang:10}{cells}{str(round(t['overall']['recall'] * 100)) + '%':>12}{str(round((t['controls_kept'] or 0) * 100)) + '%':>15}")
    print(f"\nWritten to {out}")
