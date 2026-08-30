from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from api.routes import api_router
from core.database import engine, Base, SessionLocal
import models.family_contribution  # noqa: F401
from services import billing_service as billing

# Create tables
Base.metadata.create_all(bind=engine)


def _migrate_sqlite_columns():
    """Add new columns to existing SQLite DB without Alembic."""
    if not settings.SQLALCHEMY_DATABASE_URI.startswith("sqlite"):
        return
    from sqlalchemy import text
    migrations = [
        "ALTER TABLE families ADD COLUMN joining_date DATE",
        "ALTER TABLE contribution_settings ADD COLUMN drf_is_monthly INTEGER DEFAULT 1",
        "ALTER TABLE contribution_settings ADD COLUMN amount_effective_from DATE",
        "ALTER TABLE ledger_entries ADD COLUMN payment_mode VARCHAR",
        "ALTER TABLE ledger_entries ADD COLUMN collected_by VARCHAR",
        "ALTER TABLE ledger_entries ADD COLUMN receipt_number VARCHAR",
        "ALTER TABLE family_dues ADD COLUMN contribution_rate_id VARCHAR",
        "ALTER TABLE family_dues ADD COLUMN festival_charge_event_id VARCHAR",
    ]
    index_migrations = [
        """CREATE UNIQUE INDEX IF NOT EXISTS uq_family_festival_event
           ON family_dues(family_id, festival_charge_event_id)
           WHERE festival_charge_event_id IS NOT NULL""",
        """CREATE UNIQUE INDEX IF NOT EXISTS uq_family_monthly_due
           ON family_dues(family_id, category_id, billing_year, billing_month)
           WHERE festival_charge_event_id IS NULL""",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass
        for sql in index_migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass


_migrate_sqlite_columns()

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Allow local frontend origins used during development and testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)


@app.on_event("startup")
def seed_defaults():
    db = SessionLocal()
    try:
        billing.ensure_default_categories(db)
        settings = billing.get_settings(db)
        billing.sync_settings_rates(db, settings)
        billing.normalize_family_labels(db)
        billing.free_deleted_family_numbers(db)
        billing.ensure_all_monthly_dues(db)
    finally:
        db.close()


@app.get("/")
def read_root():
    return {"message": "Welcome to Temple ERP API"}
