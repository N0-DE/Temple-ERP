"""Masavari core rules — global fixed rate, monthly accumulation, FIFO payments."""

from __future__ import annotations

import sys
import uuid
from contextlib import contextmanager
from datetime import date
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

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


def _set_global_masavari(amount: float, effective_from: str = "2026-01-01") -> str:
    settings = client.get("/api/v1/family-contributions/settings").json()
    client.put(
        "/api/v1/family-contributions/settings",
        json={
            **settings,
            "masavari_amount": amount,
            "drf_amount": 0,
            "drf_is_monthly": False,
            "amount_effective_from": effective_from,
        },
    )
    return next(c["id"] for c in client.get("/api/v1/family-contributions/categories").json() if c["slug"] == "masavari")


def _create_family(as_of: date, joining: str = "2026-01-01") -> tuple[str, str]:
    cat_id = _set_global_masavari(700, joining)
    with billing_date(as_of):
        fam = client.post(
            "/api/v1/family-contributions/families",
            json={"family_number": f"FAM-{_uid()}", "head_of_family": f"Family {_uid()}", "joining_date": joining},
        ).json()
    return fam["id"], cat_id


def _sync(family_id: str) -> None:
    r = client.get(f"/api/v1/family-contributions/outstanding/{family_id}")
    assert r.status_code == 200


def _masavari_out(family_id: str) -> float:
    r = client.get(f"/api/v1/family-contributions/outstanding/{family_id}")
    return r.json()["outstanding"]["masavari_outstanding"]


def _pay(family_id: str, cat_id: str, amount: float, when: str) -> None:
    r = client.post(
        "/api/v1/family-contributions/payments",
        json={"family_id": family_id, "category_id": cat_id, "amount": amount, "payment_date": when, "payment_mode": "Cash"},
    )
    assert r.status_code == 200, r.text


def _masavari_dues(family_id: str, cat_id: str) -> list[FamilyDue]:
    db = SessionLocal()
    try:
        return (
            db.query(FamilyDue)
            .filter(FamilyDue.family_id == family_id, FamilyDue.category_id == cat_id, FamilyDue.billing_month > 0)
            .order_by(FamilyDue.billing_year, FamilyDue.billing_month)
            .all()
        )
    finally:
        db.close()


def test_family1_pays_january_then_february_starts_fresh():
    """Family 1: Jan ₹700 → pay ₹700 → ₹0; February → ₹700."""
    family_id, cat_id = _create_family(date(2026, 1, 31))
    with billing_date(date(2026, 1, 31)):
        _sync(family_id)
        assert _masavari_out(family_id) == 700
        _pay(family_id, cat_id, 700, "2026-01-20")
        assert _masavari_out(family_id) == 0

    with billing_date(date(2026, 2, 1)):
        _sync(family_id)
        assert _masavari_out(family_id) == 700
        assert len(_masavari_dues(family_id, cat_id)) == 2


def test_family2_unpaid_debt_accumulates_monthly():
    """Family 2: Jan ₹700 → Feb ₹1,400 → Mar ₹2,100 → pay ₹700 → ₹1,400."""
    family_id, cat_id = _create_family(date(2026, 1, 31))

    with billing_date(date(2026, 1, 31)):
        _sync(family_id)
        assert _masavari_out(family_id) == 700

    with billing_date(date(2026, 2, 28)):
        _sync(family_id)
        assert _masavari_out(family_id) == 1400

    with billing_date(date(2026, 3, 31)):
        _sync(family_id)
        assert _masavari_out(family_id) == 2100
        _pay(family_id, cat_id, 700, "2026-03-15")
        assert _masavari_out(family_id) == 1400


def test_global_rate_same_for_all_families():
    """Global rate: every family gets the same monthly Masavari amount."""
    with billing_date(date(2026, 2, 28)):
        cat_id = _set_global_masavari(700)
        ids = []
        for _ in range(3):
            fam = client.post(
                "/api/v1/family-contributions/families",
                json={"family_number": f"FAM-{_uid()}", "head_of_family": "Test", "joining_date": "2026-01-01"},
            ).json()
            ids.append(fam["id"])
            _sync(fam["id"])

        for fid in ids:
            assert _masavari_out(fid) == 1400
            dues = _masavari_dues(fid, cat_id)
            assert [d.amount_due for d in dues] == [700, 700]


def test_rate_change_700_to_800_only_affects_march_onward():
    """Jan/Feb ₹700 unpaid; rate → ₹800 from March → total ₹2,200; Jan/Feb unchanged."""
    family_id, cat_id = _create_family(date(2026, 2, 28))
    with billing_date(date(2026, 2, 28)):
        _sync(family_id)

    settings = client.get("/api/v1/family-contributions/settings").json()
    client.put(
        "/api/v1/family-contributions/settings",
        json={**settings, "masavari_amount": 800, "amount_effective_from": "2026-03-01"},
    )

    with billing_date(date(2026, 3, 31)):
        _sync(family_id)
        assert _masavari_out(family_id) == 2200
        dues = _masavari_dues(family_id, cat_id)
        assert [d.amount_due for d in dues] == [700, 700, 800]


def test_pay_full_balance_then_next_month_adds_fixed_amount():
    """Pay entire ₹2,100 → ₹0; next month adds ₹700."""
    family_id, cat_id = _create_family(date(2026, 3, 31))
    with billing_date(date(2026, 3, 31)):
        _sync(family_id)
        assert _masavari_out(family_id) == 2100
        _pay(family_id, cat_id, 2100, "2026-03-25")
        assert _masavari_out(family_id) == 0

    with billing_date(date(2026, 4, 1)):
        _sync(family_id)
        assert _masavari_out(family_id) == 700


def test_no_duplicate_masavari_per_month_on_repeated_sync():
    """Refreshing 20 times must not duplicate monthly Masavari dues."""
    family_id, cat_id = _create_family(date(2026, 3, 31))
    with billing_date(date(2026, 3, 31)):
        for _ in range(20):
            _sync(family_id)
        assert _masavari_out(family_id) == 2100
        assert len(_masavari_dues(family_id, cat_id)) == 3
