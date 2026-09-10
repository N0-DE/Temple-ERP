"""Annual DRF billing — generation, idempotency, catch-up, FIFO, rate changes, DB uniqueness."""

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
from models.family_contribution import ContributionCategory, Family, FamilyDue
from services import billing_service as billing

client = TestClient(app)


@contextmanager
def billing_date(day: date):
    with patch.object(billing, "date") as mock_date:
        mock_date.today.return_value = day
        mock_date.side_effect = lambda *args, **kw: date(*args, **kw)
        yield


def _uid() -> str:
    return uuid.uuid4().hex[:6].upper()


def _cat(slug: str) -> dict:
    return next(c for c in client.get("/api/v1/family-contributions/categories").json() if c["slug"] == slug)


def _create_family(joining_date: str = "2026-01-01") -> dict:
    return client.post(
        "/api/v1/family-contributions/families",
        json={"family_number": f"DRF-{_uid()}", "head_of_family": f"DRF Family {_uid()}", "joining_date": joining_date},
    ).json()


def _set_settings(**kwargs) -> None:
    settings = client.get("/api/v1/family-contributions/settings").json()
    client.put("/api/v1/family-contributions/settings", json={**settings, **kwargs})


def _drf_outstanding(family_id: str) -> float:
    drf = _cat("drf")
    r = client.get(f"/api/v1/family-contributions/families/{family_id}/outstanding/{drf['id']}")
    assert r.status_code == 200, r.text
    return r.json()["outstanding"]


def _drf_dues(family_id: str) -> list[FamilyDue]:
    db = SessionLocal()
    try:
        drf = db.query(ContributionCategory).filter(ContributionCategory.slug == "drf").first()
        return (
            db.query(FamilyDue)
            .filter(
                FamilyDue.family_id == family_id,
                FamilyDue.category_id == drf.id,
                FamilyDue.billing_month == 0,
                FamilyDue.festival_charge_event_id.is_(None),
                FamilyDue.is_deleted.is_(False),
            )
            .order_by(FamilyDue.billing_year)
            .all()
        )
    finally:
        db.close()


def _generate_drf(family_id: str, up_to: date) -> None:
    db = SessionLocal()
    try:
        family = db.query(Family).filter(Family.id == family_id).first()
        billing.ensure_annual_drf_for_family(db, family, up_to)
    finally:
        db.close()


def _pay(family_id: str, amount: float, payment_date: str = "2026-12-31") -> None:
    drf = _cat("drf")
    r = client.post(
        "/api/v1/family-contributions/payments",
        json={
            "family_id": family_id,
            "category_id": drf["id"],
            "amount": amount,
            "payment_date": payment_date,
            "payment_mode": "Cash",
        },
    )
    assert r.status_code == 200, r.text


@pytest.fixture(autouse=True)
def setup_drf_rate():
    _set_settings(
        masavari_amount=0,
        drf_amount=1000,
        festival_1_minimum=0,
        festival_2_minimum=0,
        festival_3_minimum=0,
        amount_effective_from="2026-01-01",
        partial_payment_allowed=True,
    )


def test_01_first_annual_drf():
    """Test 1 — Generate 2026 DRF = ₹1,000."""
    with billing_date(date(2026, 6, 15)):
        family = _create_family()
        _generate_drf(family["id"], date(2026, 6, 15))
        dues = _drf_dues(family["id"])
        assert len(dues) == 1
        assert dues[0].billing_year == 2026
        assert dues[0].billing_month == 0
        assert dues[0].amount_due == 1000
        assert _drf_outstanding(family["id"]) == 1000


def test_02_same_year_idempotent():
    """Test 2 — Repeated generation creates only one 2026 DRF."""
    with billing_date(date(2026, 6, 15)):
        family = _create_family()
        for _ in range(3):
            _generate_drf(family["id"], date(2026, 6, 15))
        dues = _drf_dues(family["id"])
        assert len(dues) == 1
        assert dues[0].amount_due == 1000
        assert _drf_outstanding(family["id"]) == 1000


def test_03_new_year_accumulates():
    """Test 3 — 2026 unpaid, move to 2027 → total ₹2,000."""
    with billing_date(date(2027, 3, 1)):
        family = _create_family()
        _generate_drf(family["id"], date(2027, 3, 1))
        dues = _drf_dues(family["id"])
        assert len(dues) == 2
        assert [d.billing_year for d in dues] == [2026, 2027]
        assert sum(d.amount_due - d.amount_paid for d in dues) == 2000
        assert _drf_outstanding(family["id"]) == 2000


def test_04_multiple_year_catchup():
    """Test 4 — Catch up 2026–2029 without payments → total ₹4,000."""
    with billing_date(date(2029, 1, 15)):
        family = _create_family(joining_date="2026-01-01")
        _generate_drf(family["id"], date(2029, 1, 15))
        dues = _drf_dues(family["id"])
        assert len(dues) == 4
        assert [d.billing_year for d in dues] == [2026, 2027, 2028, 2029]
        assert sum(d.amount_due - d.amount_paid for d in dues) == 4000


def test_05_full_payment():
    """Test 5 — Pay ₹1,000 → DRF outstanding = ₹0."""
    with billing_date(date(2026, 6, 15)):
        family = _create_family()
        _generate_drf(family["id"], date(2026, 6, 15))
        assert _drf_outstanding(family["id"]) == 1000
        _pay(family["id"], 1000)
        assert _drf_outstanding(family["id"]) == 0


def test_06_partial_payment():
    """Test 6 — Pay ₹400 on 2026 → remaining ₹600."""
    with billing_date(date(2026, 6, 15)):
        family = _create_family()
        _generate_drf(family["id"], date(2026, 6, 15))
        _pay(family["id"], 400)
        dues = _drf_dues(family["id"])
        assert len(dues) == 1
        assert dues[0].amount_paid == 400
        assert dues[0].amount_due - dues[0].amount_paid == 600
        assert _drf_outstanding(family["id"]) == 600


def test_07_fifo_by_year():
    """Test 7 — ₹1,500 pays 2026 fully and ₹500 on 2027."""
    with billing_date(date(2028, 6, 1)):
        family = _create_family()
        _generate_drf(family["id"], date(2028, 6, 1))
        assert _drf_outstanding(family["id"]) == 3000
        _pay(family["id"], 1500, "2028-06-01")
        dues = {d.billing_year: d for d in _drf_dues(family["id"])}
        assert dues[2026].amount_due - dues[2026].amount_paid == 0
        assert dues[2027].amount_due - dues[2027].amount_paid == 500
        assert dues[2028].amount_due - dues[2028].amount_paid == 1000
        assert _drf_outstanding(family["id"]) == 1500


def test_08_rate_change_preserves_history():
    """Test 8 — 2026 stays ₹1,000; 2027 uses new ₹1,200 rate."""
    with billing_date(date(2026, 12, 31)):
        family = _create_family()
        dues_2026 = _drf_dues(family["id"])
        assert len(dues_2026) == 1
        assert dues_2026[0].amount_due == 1000

    _set_settings(drf_amount=1200, amount_effective_from="2027-01-01")
    with billing_date(date(2027, 6, 1)):
        _generate_drf(family["id"], date(2027, 6, 1))
        dues = {d.billing_year: d for d in _drf_dues(family["id"])}
        assert dues[2026].amount_due == 1000
        assert dues[2027].amount_due == 1200


def test_09_masavari_remains_monthly():
    """Test 9 — Masavari monthly unaffected; DRF annual separate."""
    _set_settings(masavari_amount=700, drf_amount=1000, amount_effective_from="2026-01-01")
    masavari = _cat("masavari")
    with billing_date(date(2026, 3, 31)):
        family = _create_family()
        client.get(f"/api/v1/family-contributions/outstanding/{family['id']}")
        detail = client.get(f"/api/v1/family-contributions/outstanding/{family['id']}").json()
        assert detail["outstanding"]["masavari_outstanding"] == 2100  # Jan–Mar
        assert detail["outstanding"]["drf_outstanding"] == 1000

        db = SessionLocal()
        try:
            fam = db.query(Family).filter(Family.id == family["id"]).first()
            mas_dues = (
                db.query(FamilyDue)
                .filter(
                    FamilyDue.family_id == family["id"],
                    FamilyDue.category_id == masavari["id"],
                    FamilyDue.billing_month > 0,
                )
                .count()
            )
            drf_dues_count = len(_drf_dues(family["id"]))
            assert mas_dues == 3
            assert drf_dues_count == 1
        finally:
            db.close()


def test_10_database_duplicate_rejected():
    """Test 10 — DB rejects duplicate family + DRF + billing year."""
    with billing_date(date(2026, 6, 15)):
        family = _create_family()
        _generate_drf(family["id"], date(2026, 6, 15))

        db = SessionLocal()
        try:
            drf = db.query(ContributionCategory).filter(ContributionCategory.slug == "drf").first()
            duplicate = FamilyDue(
                family_id=family["id"],
                category_id=drf.id,
                billing_month=0,
                billing_year=2026,
                amount_due=1000,
                amount_paid=0.0,
                status="pending",
            )
            db.add(duplicate)
            with pytest.raises(IntegrityError):
                db.commit()
            db.rollback()
        finally:
            db.close()

        assert len(_drf_dues(family["id"])) == 1
