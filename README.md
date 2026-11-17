# Kavach

Complaint-to-public-copy platform for sexual-offence cases that hides the survivor's identity from everyone who does
not need it: the public, the wider police force, the assigned officer once her task is done, and anyone who breaks in.
Built for a department hackathon (Problem Statement #2: automated sensitive-data redaction and DLP).

All data in this repository is synthetic. Never load real case files.

## Run it

Two servers: the API (FastAPI, port 8000) and the web app (React + Vite, port 5173).

```bash
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install fastapi "uvicorn[standard]" cryptography python-multipart pypdf
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. In the Claude desktop app both servers start from `.claude/launch.json` (`kavach-api`,
`kavach-web`).

### Load the demo story

With the API running:

```bash
cd backend
.venv\Scripts\python -m app.demo
```

This resets everything and loads three cases:

| Case | Who | State |
|---|---|---|
| `KV-2026-BLR-0007` | Child, urgent, English | Insp. Kavitha Rao: accepted, statement scheduled |
| `KV-2026-BLR-0008` | Adult, English | SI Meena Iyer: escalated (not accepted in time) |
| `KV-2026-DEL-0005` | Adult, Hindi | Insp. Neha Verma: sealed, public copy released |

## Demo accounts

Codes are shown on screen (demo mode); press "Use it".

| Role | Sign in |
|---|---|
| Survivor | phone `9000000001` |
| Officer (woman, child-trained, Bengaluru) | `kavitha.rao` / `kavach@123` |
| Officer (woman, Bengaluru) | `meena.iyer` / `kavach@123` |
| Officer (Bengaluru, the "rogue officer" in the demo) | `rohit.sharma` / `kavach@123` |
| Officer (woman, child-trained, New Delhi) | `neha.verma` / `kavach@123` |
| Supervisor (Bengaluru) | `prakash.reddy` / `kavach@123` |
| Security admin | `anita.desai` / `kavach@123` |
| Honey credentials (a trap) | `sysadmin` / `Kv#Admin@2024`, planted in `backend/legacy/config.old.env` |

Other officers and supervisors are listed on the sign-in screen under "Demo accounts".

## The 7-minute demo

1. **Hook (30 s).** In December 2024 a police website leaked a survivor's FIR; the Madras High Court ordered ₹25 lakh compensation. Kavach makes that leak impossible.
2. **Survivor files (1 min).** Sign in as the survivor. File a complaint. Switch to ಕನ್ನಡ, press "Fill sample details (demo)", then "Upload a photo" and "Use a sample page in ಕನ್ನಡ (demo)". OCR reads the page beside the photo; tick the check and review: "What your officer will see" shows "Survivor A". Send. Press Esc to show quick exit.
3. **Allocation (30 s).** The new case goes straight to Insp. Kavitha Rao: a woman officer trained for child cases.
4. **Officer (1 min).** Sign in as `kavitha.rao`, open `KV-2026-BLR-0007`. Call survivor (masked). Request "Survivor's name" for "Record her statement": it opens for 60 seconds under a watermark. Start investigation, file the final report: the identity is sealed.
5. **Public copy (1.5 min).** Choose "Public copy": name-only redaction scores 45 and is blocked; Kavach scores 0. Release, then "Print or save as PDF". Copy text out of the PDF: nothing identifying.
6. **Honeypot (1 min).** Sign in as `anita.desai` in a second window. In the first, sign in as `rohit.sharma` and open `http://localhost:5173/police/cases/KV-2026-BLR-0003`: he is thrown out and locked; the monitor turns red. Then run `curl http://localhost:5173/api/admin/export-all`: blocked and alerted.
7. **Numbers and limits (1 min).** Show the evaluation table below and the limits.
8. **Close (30 s).** What a pilot at one police station would need.

## Measured

`.venv\Scripts\python -m eval.evaluate` runs the redaction engine over 90 synthetic complaints (30 each in English,
Hindi and Kannada) written for evaluation and not used to tune the rules. Results are in `reports/eval-results.json`
and the Phase 7 report.

## What is where

```
backend/app/       API: auth, vault (AES-256-GCM), intake, allocation, police, redaction, copies, security, decoys
backend/eval/      redaction evaluation on a held-out synthetic set
backend/legacy/    planted honey credentials (deliberate)
frontend/src/      React app: survivor, police, security portals; artwork in components/art.jsx
reports/           phase reports (PDF), screenshots, report tooling
samples/           synthetic complaint pages for OCR
```

Encryption keys live in `backend/keys/` and the database in `backend/data/`; neither is committed.

## Limits

- Detection is rule-based. When a survivor fills in the form, tagged details are caught; when she does not, names
  and places without recognisable patterns can slip through. Every copy is re-scored, medium risk goes to a supervisor,
  and Kavach never claims zero risk.
- OCR runs in the browser but downloads its engine and language data from a public CDN; handwriting is weak.
- Calls, SMS and OTP are simulated. No translation.
- On one machine all requests come from localhost, so blocked clients are told apart by browser signature as well.
