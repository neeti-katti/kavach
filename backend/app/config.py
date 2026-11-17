"""Central settings for the Kavach API. Paths resolve from this file, not the working directory."""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
KEYS_DIR = BASE_DIR / "keys"  # kept apart from the database; never committed
DB_PATH = DATA_DIR / "kavach.db"

# Demo mode shows simulated OTP and two-factor codes on screen instead of sending SMS.
DEMO_MODE = True
DEMO_STAFF_PASSWORD = "kavach@123"  # synthetic demo accounts only
DEMO_SURVIVOR_PHONE = "9000000001"  # synthetic number

STAFF_SESSION_HOURS = 8
SURVIVOR_SESSION_HOURS = 1
OTP_TTL_SECONDS = 300
OTP_MAX_ATTEMPTS = 5

CASE_YEAR = 2026
