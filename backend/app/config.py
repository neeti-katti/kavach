"""Central settings for the Kavach API. Paths resolve from this file, not the working directory.
Deployment settings come from environment variables (see README, "Deploy")."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("KAVACH_DATA_DIR", BASE_DIR / "data"))
KEYS_DIR = Path(os.environ.get("KAVACH_KEYS_DIR", BASE_DIR / "keys"))  # kept apart from the database; never committed
DB_PATH = DATA_DIR / "kavach.db"

# The built web app, served by the API in production (one server). Absent in development, where Vite serves it.
FRONTEND_DIST = Path(os.environ.get("KAVACH_FRONTEND_DIST", BASE_DIR.parent / "frontend" / "dist"))

# Demo mode shows simulated OTP and two-factor codes on screen instead of sending SMS.
DEMO_MODE = os.environ.get("KAVACH_DEMO_MODE", "1") == "1"
# Load the demo story on start-up when the database has no complaints (useful on hosts that reset storage).
LOAD_DEMO_ON_START = os.environ.get("KAVACH_LOAD_DEMO", "0") == "1"
DEMO_STAFF_PASSWORD = "kavach@123"  # synthetic demo accounts only
DEMO_SURVIVOR_PHONE = "9000000001"  # synthetic number

STAFF_SESSION_HOURS = 8
SURVIVOR_SESSION_HOURS = 1
OTP_TTL_SECONDS = 300
OTP_MAX_ATTEMPTS = 5

CASE_YEAR = 2026

# Demo timings (real deployment: 2 hours to accept, 30 minutes per reveal).
ACCEPT_WINDOW_SECONDS = 120
REVEAL_SECONDS = 60
