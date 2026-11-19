import os
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-secret-change-me-in-production-32b")
    DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE / 'data' / 'app.db'}")
    ARTIFACTS_DIR = os.getenv("ARTIFACTS_DIR", str(BASE / "artifacts"))
    LITERATURE_CSV = str(BASE / "data" / "literature_review.csv")
    JWT_EXPIRES_HOURS = int(os.getenv("JWT_EXPIRES_HOURS", "72"))
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
    SEED_DEMO_USER = os.getenv("SEED_DEMO_USER", "1") == "1"
