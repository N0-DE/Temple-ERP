"""Category-aware payment recording — per-category outstanding, FIFO isolation, overpayment rejection."""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from datetime import date
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from core.database import SessionLocal
from main import app
from models.family_contribution import FamilyDue
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
        json={"family_number": f"FAM-{_uid()}", "head_of_family": f"Head {_uid()}", "joining_date": joining_date},
    ).json()


def _set_settings(**kwargs) -> None:
    settings = client.get("/api/v1/family-contributions/settings").json()
    client.put("/api/v1/family-contributions/settings", json={**settings, **kwargs})


def _apply_festival(slug: str, amount: float, family_ids: list[str], name: str | None = None) -> None:
    cat_id = _cat(slug)["id"]
    event = client.post(
        "/api/v1/family-contributions/festival-charges",
        json={
            "name": name or f"Fest {_uid()}",
            "category_id": cat_id,
            "amount": amount,
            "charge_date": "2026-08-30",
            "apply_to_all": False,
            "family_ids": family_ids,
        },
    )
    assert event.status_code == 200, event.text
    applied = client.post(f"/api/v1/family-contributions/festival-charges/{event.json()['id']}/apply")
    assert applied.status_code == 200, applied.text


def _category_outstanding(family_id: str, category_id: str) -> float:
    r = client.get(f"/api/v1/family-contributions/families/{family_id}/outstanding/{category_id}")
    assert r.status_code == 200, r.text
    return r.json()["outstanding"]


def _family_totals(family_id: str) -> dict:
    return client.get(f"/api/v1/family-contributions/outstanding/{family_id}").json()["outstanding"]


def _pay(family_id: str, category_id: str, amount: float, payment_date: str = "2026-08-31") -> dict:
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
    return r


@pytest.fixture(autouse=True)
def setup_rates():
    _set_settings(
        masavari_amount=700,
        drf_amount=2000,
        drf_is_monthly=False,
        festival_1_minimum=0,
        festival_2_minimum=0,
        festival_3_minimum=0,
        amount_effective_from="2026-01-01",
        partial_payment_allowed=True,
    )


def test_masavari_payment_only_decreases_masavari():
    """Pay ₹700 masavari — only masavari outstanding decreases."""
    masavari = _cat("masavari")
    with billing_date(date(2026, 2, 28)):
        family = _create_family()
        client.get(f"/api/v1/family-contributions/outstanding/{family['id']}")
        before = _family_totals(family["id"])
        assert before["masavari_outstanding"] == 1400
        assert before["festival_outstanding"] == 0
        assert before["drf_outstanding"] == 2000

        pay = _pay(family["id"], masavari["id"], 700)
        assert pay.status_code == 200, pay.text

        after = _family_totals(family["id"])
        assert after["masavari_outstanding"] == 700
        assert after["festival_outstanding"] == before["festival_outstanding"]
        assert after["drf_outstanding"] == before["drf_outstanding"]


def test_festival_payment_only_decreases_festival():
    """Pay ₹700 festival — only festival outstanding decreases."""
    family = _create_family()
    fest = _cat("festival-1")
    with billing_date(date(2026, 2, 28)):
        client.get(f"/api/v1/family-contributions/outstanding/{family['id']}")
    _apply_festival("festival-1", 1000, [family["id"]])

    before = _family_totals(family["id"])
    pay = _pay(family["id"], fest["id"], 700)
    assert pay.status_code == 200, pay.text

    after = _family_totals(family["id"])
    assert after["festival_outstanding"] == 300
    assert after["masavari_outstanding"] == before["masavari_outstanding"]
    assert after["drf_outstanding"] == before["drf_outstanding"]


def test_drf_payment_only_decreases_drf():
    """Pay ₹500 DRF — only DRF outstanding decreases."""
    family = _create_family()
    drf = _cat("drf")
    with billing_date(date(2026, 2, 28)):
        client.get(f"/api/v1/family-contributions/outstanding/{family['id']}")

    before = _family_totals(family["id"])
    pay = _pay(family["id"], drf["id"], 500)
    assert pay.status_code == 200, pay.text

    after = _family_totals(family["id"])
    assert after["drf_outstanding"] == 1500
    assert after["masavari_outstanding"] == before["masavari_outstanding"]
    assert after["festival_outstanding"] == before["festival_outstanding"]


def test_api_returns_per_category_outstanding():
    """Category outstanding API returns correct amounts per category."""
    masavari = _cat("masavari")
    fest = _cat("festival-1")
    drf = _cat("drf")

    with billing_date(date(2026, 3, 31)):
        family = _create_family()
        client.get(f"/api/v1/family-contributions/outstanding/{family['id']}")
        _apply_festival("festival-1", 1000, [family["id"]])

        assert _category_outstanding(family["id"], masavari["id"]) == 2100
        assert _category_outstanding(family["id"], fest["id"]) == 1000
        assert _category_outstanding(family["id"], drf["id"]) == 2000

        r = client.get(f"/api/v1/family-contributions/families/{family['id']}/outstanding/{masavari['id']}")
        assert r.status_code == 200
        payload = r.json()
        assert payload["family_id"] == family["id"]
        assert payload["category_slug"] == "masavari"
        assert payload["outstanding"] == 2100


def test_fifo_partial_masavari_payment():
    """3×₹700 masavari dues; pay ₹800 → ₹1,300 remaining (FIFO)."""
    masavari = _cat("masavari")
    with billing_date(date(2026, 3, 31)):
        family = _create_family()
        client.get(f"/api/v1/family-contributions/outstanding/{family['id']}")

        assert _category_outstanding(family["id"], masavari["id"]) == 2100

        pay = _pay(family["id"], masavari["id"], 800)
        assert pay.status_code == 200, pay.text
        assert _category_outstanding(family["id"], masavari["id"]) == 1300

    db = SessionLocal()
    try:
        dues = (
            db.query(FamilyDue)
            .filter(FamilyDue.family_id == family["id"], FamilyDue.category_id == masavari["id"])
            .order_by(FamilyDue.billing_year, FamilyDue.billing_month)
            .all()
        )
        assert dues[0].amount_paid == 700
        assert dues[1].amount_paid == 100
        assert dues[2].amount_paid == 0
    finally:
        db.close()


def test_overpayment_rejected():
    """Outstanding ₹700; pay ₹1,000 → rejected with clear error."""
    masavari = _cat("masavari")
    with billing_date(date(2026, 1, 31)):
        family = _create_family(joining_date="2026-01-01")
        client.get(f"/api/v1/family-contributions/outstanding/{family['id']}")

        assert _category_outstanding(family["id"], masavari["id"]) == 700

        pay = _pay(family["id"], masavari["id"], 1000)
        assert pay.status_code == 400
        assert "cannot exceed" in pay.json()["detail"].lower()
        assert "700" in pay.json()["detail"]
        assert _category_outstanding(family["id"], masavari["id"]) == 700
