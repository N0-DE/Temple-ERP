"""Billing scenario tests A–G from Temple ERP requirements."""

import uuid
from datetime import date
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from core.database import SessionLocal
from main import app
from models.family_contribution import Family, FamilyDue
from services import billing_service as billing

client = TestClient(app)

# Freeze "today" so dues are not generated through real-world August 2026
FROZEN_TODAY = date(2026, 3, 31)


@pytest.fixture(autouse=True)
def freeze_billing_today():
    with patch.object(billing, "date") as mock_date:
        mock_date.today.return_value = FROZEN_TODAY
        mock_date.side_effect = lambda *args, **kw: date(*args, **kw)
        yield


def _uid() -> str:
    return uuid.uuid4().hex[:6].upper()


def _setup_masavari_rate(amount: float) -> tuple[str, str]:
    settings = client.get("/api/v1/family-contributions/settings").json()
    client.put(
        "/api/v1/family-contributions/settings",
        json={**settings, "masavari_amount": amount, "drf_amount": 0, "drf_is_monthly": False, "amount_effective_from": "2026-01-01"},
    )
    categories = client.get("/api/v1/family-contributions/categories").json()
    masavari = next(c for c in categories if c["slug"] == "masavari")
    fam = client.post(
        "/api/v1/family-contributions/families",
        json={
            "family_number": f"FAM-{_uid()}",
            "head_of_family": "Scenario Family",
            "joining_date": "2026-01-01",
        },
    ).json()
    return fam["id"], masavari["id"]


def _clear_category_dues(family_id: str, category_id: str) -> None:
    db = SessionLocal()
    try:
        due_ids = [d.id for d in db.query(FamilyDue).filter(FamilyDue.family_id == family_id, FamilyDue.category_id == category_id).all()]
        if due_ids:
            from models.family_contribution import PaymentItem
            db.query(PaymentItem).filter(PaymentItem.family_due_id.in_(due_ids)).delete(synchronize_session=False)
            db.query(FamilyDue).filter(FamilyDue.id.in_(due_ids)).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _generate_dues(family_id: str, category_id: str, through: str = "2026-03-31", *, reset: bool = True) -> None:
    if reset:
        _clear_category_dues(family_id, category_id)
    db = SessionLocal()
    try:
        family = db.query(Family).filter(Family.id == family_id).first()
        billing.ensure_monthly_dues_for_family(db, family, date.fromisoformat(through))
    finally:
        db.close()


def _pay(family_id: str, category_id: str, amount: float, payment_date: str) -> dict:
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
    return r.json()


def _masavari_outstanding(family_id: str, category_id: str) -> float:
    db = SessionLocal()
    try:
        dues = (
            db.query(FamilyDue)
            .filter(
                FamilyDue.family_id == family_id,
                FamilyDue.category_id == category_id,
                FamilyDue.is_deleted.is_(False),
                FamilyDue.festival_charge_event_id.is_(None),
                FamilyDue.billing_month > 0,
                FamilyDue.billing_month <= 12,
            )
            .all()
        )
        return round(sum(max(0, d.amount_due - d.amount_paid) for d in dues), 2)
    finally:
        db.close()


def _dues_ordered(family_id: str, category_id: str) -> list[FamilyDue]:
    db = SessionLocal()
    try:
        return (
            db.query(FamilyDue)
            .filter(
                FamilyDue.family_id == family_id,
                FamilyDue.category_id == category_id,
                FamilyDue.festival_charge_event_id.is_(None),
                FamilyDue.billing_month > 0,
                FamilyDue.billing_month <= 12,
            )
            .order_by(FamilyDue.billing_year, FamilyDue.billing_month)
            .all()
        )
    finally:
        db.close()


def test_scenario_a_normal_monthly_payment():
    """January due ₹500, pay ₹500 → outstanding ₹0."""
    family_id, cat_id = _setup_masavari_rate(500)
    _generate_dues(family_id, cat_id, "2026-01-31")
    assert _masavari_outstanding(family_id, cat_id) == 500
    _pay(family_id, cat_id, 500, "2026-01-15")
    assert _masavari_outstanding(family_id, cat_id) == 0


def test_scenario_b_two_months_unpaid():
    """Jan + Feb unpaid → ₹1000 outstanding."""
    family_id, cat_id = _setup_masavari_rate(500)
    _generate_dues(family_id, cat_id, "2026-02-28")
    assert _masavari_outstanding(family_id, cat_id) == 1000


def test_scenario_c_fifo_payment():
    """Jan/Feb/Mar ₹500 each; pay ₹700 → Jan paid, Feb partial, Mar ₹500."""
    family_id, cat_id = _setup_masavari_rate(500)
    _generate_dues(family_id, cat_id, "2026-03-31")
    _pay(family_id, cat_id, 700, "2026-03-20")
    dues = _dues_ordered(family_id, cat_id)
    assert dues[0].amount_paid == 500
    assert dues[1].amount_paid == 200
    assert dues[2].amount_paid == 0
    assert _masavari_outstanding(family_id, cat_id) == 800


def test_scenario_d_rate_change():
    """Jan/Feb ₹500; March rate ₹600 — historical dues unchanged."""
    family_id, cat_id = _setup_masavari_rate(500)
    _generate_dues(family_id, cat_id, "2026-02-28")
    settings = client.get("/api/v1/family-contributions/settings").json()
    client.put(
        "/api/v1/family-contributions/settings",
        json={**settings, "masavari_amount": 600, "amount_effective_from": "2026-03-01"},
    )
    _generate_dues(family_id, cat_id, "2026-03-31", reset=False)
    dues = _dues_ordered(family_id, cat_id)
    assert dues[0].amount_due == 500
    assert dues[1].amount_due == 500
    assert dues[2].amount_due == 600


def test_scenario_e_partial_payment():
    """Outstanding ₹500; pay ₹200 → ₹300 remaining."""
    family_id, cat_id = _setup_masavari_rate(500)
    _generate_dues(family_id, cat_id, "2026-01-31")
    _pay(family_id, cat_id, 200, "2026-01-20")
    assert _masavari_outstanding(family_id, cat_id) == 300


def test_scenario_f_large_payment():
    """Three months ₹500; pay ₹1500 → all paid."""
    family_id, cat_id = _setup_masavari_rate(500)
    _generate_dues(family_id, cat_id, "2026-03-31")
    _pay(family_id, cat_id, 1500, "2026-03-25")
    assert _masavari_outstanding(family_id, cat_id) == 0
    dues = _dues_ordered(family_id, cat_id)
    assert all(d.status == "paid" for d in dues)


def test_scenario_g_historical_rate_protection():
    """January due at ₹500; rate changes to ₹700; January stays ₹500."""
    family_id, cat_id = _setup_masavari_rate(500)
    _generate_dues(family_id, cat_id, "2026-01-31")
    jan_due = _dues_ordered(family_id, cat_id)[0]
    assert jan_due.amount_due == 500

    settings = client.get("/api/v1/family-contributions/settings").json()
    client.put(
        "/api/v1/family-contributions/settings",
        json={**settings, "masavari_amount": 700, "amount_effective_from": "2026-02-01"},
    )
    db = SessionLocal()
    try:
        refreshed = db.query(FamilyDue).filter(FamilyDue.id == jan_due.id).first()
        assert refreshed.amount_due == 500
    finally:
        db.close()
