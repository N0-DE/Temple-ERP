"""Automatic monthly Masavari debt accumulation — backend guarantees."""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from datetime import date
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from core.database import SessionLocal
from main import app
from models.family_contribution import Family, FamilyDue
from services import billing_service as billing

client = TestClient(app)


@contextmanager
def frozen_today(day: date):
    with patch.object(billing, "date") as mock_date:
        mock_date.today.return_value = day
        mock_date.side_effect = lambda *args, **kw: date(*args, **kw)
        yield


def _uid() -> str:
    return uuid.uuid4().hex[:6].upper()


def _setup_family(rate: float = 500, joining_date: str = "2026-01-01", *, as_of: date) -> tuple[str, str]:
    """Create family while `billing.date.today()` is frozen to `as_of`."""
    with frozen_today(as_of):
        settings = client.get("/api/v1/family-contributions/settings").json()
        client.put(
            "/api/v1/family-contributions/settings",
            json={
                **settings,
                "masavari_amount": rate,
                "drf_amount": 0,
                "drf_is_monthly": False,
                "amount_effective_from": joining_date,
            },
        )
        masavari = next(c for c in client.get("/api/v1/family-contributions/categories").json() if c["slug"] == "masavari")
        fam = client.post(
            "/api/v1/family-contributions/families",
            json={
                "family_number": f"FAM-{_uid()}",
                "head_of_family": "Auto Masavari Family",
                "joining_date": joining_date,
            },
        ).json()
        return fam["id"], masavari["id"]


def _api_masavari_outstanding(family_id: str) -> float:
    r = client.get(f"/api/v1/family-contributions/outstanding/{family_id}")
    assert r.status_code == 200, r.text
    return r.json()["outstanding"]["masavari_outstanding"]


def _api_family_detail(family_id: str) -> dict:
    r = client.get(f"/api/v1/family-contributions/outstanding/{family_id}")
    assert r.status_code == 200, r.text
    return r.json()


def _count_masavari_dues(family_id: str, category_id: str) -> int:
    db = SessionLocal()
    try:
        return (
            db.query(FamilyDue)
            .filter(
                FamilyDue.family_id == family_id,
                FamilyDue.category_id == category_id,
                FamilyDue.is_deleted.is_(False),
                FamilyDue.billing_month > 0,
            )
            .count()
        )
    finally:
        db.close()


def _pay(family_id: str, category_id: str, amount: float, payment_date: str) -> None:
    r = client.post(
        "/api/v1/family-contributions/payments",
        json={
            "family_id": family_id,
            "category_id": category_id,
            "amount": amount,
            "payment_date": payment_date,
            "payment_mode": "Cash",
        },
    )
    assert r.status_code == 200, r.text


def test_one_unpaid_month_creates_one_month_debt():
    """1. One unpaid month → one month's debt."""
    with frozen_today(date(2026, 1, 31)):
        family_id, cat_id = _setup_family(500, as_of=date(2026, 1, 31))
        assert _api_masavari_outstanding(family_id) == 500
        assert _count_masavari_dues(family_id, cat_id) == 1


def test_two_unpaid_months_accumulate():
    """2. Two unpaid months → two months' debt."""
    with frozen_today(date(2026, 2, 28)):
        family_id, cat_id = _setup_family(500, as_of=date(2026, 2, 28))
        assert _api_masavari_outstanding(family_id) == 1000
        assert _count_masavari_dues(family_id, cat_id) == 2


def test_idle_months_catch_up_automatically():
    """3. System idle Jan 10 → May 15: Jan–May dues all appear."""
    with frozen_today(date(2026, 1, 10)):
        family_id, cat_id = _setup_family(500, as_of=date(2026, 1, 10))
        assert _api_masavari_outstanding(family_id) == 500
        assert _count_masavari_dues(family_id, cat_id) == 1

    with frozen_today(date(2026, 5, 15)):
        assert _api_masavari_outstanding(family_id) == 2500
        assert _count_masavari_dues(family_id, cat_id) == 5


def test_repeated_outstanding_calls_do_not_duplicate_dues():
    """4–6. Multiple API / page refreshes → no duplicate monthly dues."""
    with frozen_today(date(2026, 3, 31)):
        family_id, cat_id = _setup_family(500, as_of=date(2026, 3, 31))
        for _ in range(10):
            _api_masavari_outstanding(family_id)
        for _ in range(5):
            _api_family_detail(family_id)
        client.get("/api/v1/family-contributions/outstanding")
        assert _count_masavari_dues(family_id, cat_id) == 3
        assert _api_masavari_outstanding(family_id) == 1500


def test_fifo_pays_oldest_masavari_first():
    """7. Payment applies to oldest dues first (FIFO)."""
    with frozen_today(date(2026, 3, 31)):
        family_id, cat_id = _setup_family(500, as_of=date(2026, 3, 31))
        _api_masavari_outstanding(family_id)
        _pay(family_id, cat_id, 700, "2026-03-20")

    db = SessionLocal()
    try:
        dues = (
            db.query(FamilyDue)
            .filter(FamilyDue.family_id == family_id, FamilyDue.category_id == cat_id)
            .order_by(FamilyDue.billing_year, FamilyDue.billing_month)
            .all()
        )
        assert dues[0].amount_paid == 500
        assert dues[1].amount_paid == 200
        assert dues[2].amount_paid == 0
    finally:
        db.close()

    with frozen_today(date(2026, 3, 31)):
        assert _api_masavari_outstanding(family_id) == 800


def test_partial_payment_leaves_correct_balance():
    """8. Partial payment → correct remaining balance."""
    with frozen_today(date(2026, 1, 31)):
        family_id, cat_id = _setup_family(500, as_of=date(2026, 1, 31))
        _api_masavari_outstanding(family_id)
        _pay(family_id, cat_id, 200, "2026-01-20")
        assert _api_masavari_outstanding(family_id) == 300


def test_rate_change_preserves_historical_month_amounts():
    """9. Rate change — prior months keep original rates; April total = ₹2,200."""
    with frozen_today(date(2026, 2, 28)):
        family_id, cat_id = _setup_family(500, as_of=date(2026, 2, 28))
        _api_masavari_outstanding(family_id)

    settings = client.get("/api/v1/family-contributions/settings").json()
    client.put(
        "/api/v1/family-contributions/settings",
        json={**settings, "masavari_amount": 600, "amount_effective_from": "2026-03-01"},
    )

    with frozen_today(date(2026, 4, 30)):
        assert _api_masavari_outstanding(family_id) == 2200
        db = SessionLocal()
        try:
            dues = (
                db.query(FamilyDue)
                .filter(FamilyDue.family_id == family_id, FamilyDue.category_id == cat_id)
                .order_by(FamilyDue.billing_year, FamilyDue.billing_month)
                .all()
            )
            assert [d.amount_due for d in dues] == [500, 500, 600, 600]
        finally:
            db.close()


def test_fifo_with_mixed_rates_after_rate_change():
    """FIFO with mixed rates: ₹800 payment → ₹1,400 outstanding."""
    with frozen_today(date(2026, 2, 28)):
        family_id, cat_id = _setup_family(500, as_of=date(2026, 2, 28))
        _api_masavari_outstanding(family_id)

    settings = client.get("/api/v1/family-contributions/settings").json()
    client.put(
        "/api/v1/family-contributions/settings",
        json={**settings, "masavari_amount": 600, "amount_effective_from": "2026-03-01"},
    )

    with frozen_today(date(2026, 4, 30)):
        _api_masavari_outstanding(family_id)
        _pay(family_id, cat_id, 800, "2026-04-15")
        assert _api_masavari_outstanding(family_id) == 1400


def test_new_month_adds_exactly_one_due_per_family():
    """10. When a new month begins, exactly one new Masavari due is added."""
    with frozen_today(date(2026, 2, 28)):
        family_id, cat_id = _setup_family(500, as_of=date(2026, 2, 28))
        _api_masavari_outstanding(family_id)
        assert _count_masavari_dues(family_id, cat_id) == 2

    with frozen_today(date(2026, 3, 1)):
        _api_masavari_outstanding(family_id)
        assert _count_masavari_dues(family_id, cat_id) == 3
        assert _api_masavari_outstanding(family_id) == 1500

    with frozen_today(date(2026, 3, 15)):
        _api_masavari_outstanding(family_id)
        assert _count_masavari_dues(family_id, cat_id) == 3


def test_current_month_included_future_month_not_created():
    """Current month is due; next calendar month is not created early."""
    with frozen_today(date(2026, 2, 15)):
        family_id, cat_id = _setup_family(500, as_of=date(2026, 2, 15))
        _api_masavari_outstanding(family_id)
        assert _count_masavari_dues(family_id, cat_id) == 2
        assert _api_masavari_outstanding(family_id) == 1000

    with frozen_today(date(2026, 3, 1)):
        _api_masavari_outstanding(family_id)
        assert _count_masavari_dues(family_id, cat_id) == 3


def test_database_unique_constraint_prevents_duplicate_monthly_dues():
    """DB uniqueness: one due per family + category + billing period."""
    with frozen_today(date(2026, 1, 31)):
        family_id, cat_id = _setup_family(500, as_of=date(2026, 1, 31))
        _api_masavari_outstanding(family_id)

    db = SessionLocal()
    try:
        with pytest.raises(IntegrityError):
            db.add(
                FamilyDue(
                    family_id=family_id,
                    category_id=cat_id,
                    billing_month=1,
                    billing_year=2026,
                    amount_due=500,
                    amount_paid=0,
                    status="pending",
                )
            )
            db.commit()
    finally:
        db.rollback()
        db.close()
