"""Family ledger cumulative balance — per-category running outstanding."""

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
from models.family_contribution import FamilyDue, LedgerEntry
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


def _set_settings(*, masavari: float = 700, drf: float = 0, drf_monthly: bool = False, effective_from: str = "2026-01-01") -> dict:
    settings = client.get("/api/v1/family-contributions/settings").json()
    client.put(
        "/api/v1/family-contributions/settings",
        json={
            **settings,
            "masavari_amount": masavari,
            "drf_amount": drf,
            "drf_is_monthly": drf_monthly,
            "festival_1_minimum": 0,
            "festival_2_minimum": 0,
            "festival_3_minimum": 0,
            "amount_effective_from": effective_from,
        },
    )
    cats = client.get("/api/v1/family-contributions/categories").json()
    masavari_id = next(c["id"] for c in cats if c["slug"] == "masavari")
    drf_id = next(c["id"] for c in cats if c["slug"] == "drf")
    return {"masavari": masavari_id, "drf": drf_id}


def _create_family(as_of: date, joining: str = "2026-01-01") -> str:
    with billing_date(as_of):
        fam = client.post(
            "/api/v1/family-contributions/families",
            json={"family_number": f"FAM-{_uid()}", "head_of_family": f"Family {_uid()}", "joining_date": joining},
        ).json()
    return fam["id"]


def _sync(family_id: str) -> None:
    r = client.get(f"/api/v1/family-contributions/outstanding/{family_id}")
    assert r.status_code == 200


def _outstanding(family_id: str) -> dict:
    return client.get(f"/api/v1/family-contributions/outstanding/{family_id}").json()["outstanding"]


def _pay(family_id: str, cat_id: str, amount: float, when: str) -> None:
    r = client.post(
        "/api/v1/family-contributions/payments",
        json={"family_id": family_id, "category_id": cat_id, "amount": amount, "payment_date": when, "payment_mode": "Cash"},
    )
    assert r.status_code == 200, r.text


def _ledger(family_id: str, category_id: str | None = None) -> list[dict]:
    params = {}
    if category_id:
        params["category_id"] = category_id
    r = client.get(f"/api/v1/family-contributions/ledger/family/{family_id}", params=params)
    assert r.status_code == 200
    return r.json()


def _masavari_balances(family_id: str, cat_id: str) -> list[float]:
    return [e["balance"] for e in _ledger(family_id, cat_id) if e["category_id"] == cat_id]


def _due_count(family_id: str, cat_id: str) -> int:
    db = SessionLocal()
    try:
        return (
            db.query(FamilyDue)
            .filter(
                FamilyDue.family_id == family_id,
                FamilyDue.category_id == cat_id,
                FamilyDue.billing_month > 0,
                FamilyDue.is_deleted.is_(False),
            )
            .count()
        )
    finally:
        db.close()


def test_one_month_unpaid_balance_700():
    cats = _set_settings()
    family_id = _create_family(date(2026, 1, 31))
    with billing_date(date(2026, 1, 31)):
        _sync(family_id)
        assert _outstanding(family_id)["masavari_outstanding"] == 700
        assert _masavari_balances(family_id, cats["masavari"]) == [700]


def test_two_months_unpaid_balance_1400():
    cats = _set_settings()
    family_id = _create_family(date(2026, 1, 31))
    with billing_date(date(2026, 2, 28)):
        _sync(family_id)
        assert _outstanding(family_id)["masavari_outstanding"] == 1400
        assert _masavari_balances(family_id, cats["masavari"]) == [700, 1400]


def test_seven_months_unpaid_balance_4900():
    cats = _set_settings()
    family_id = _create_family(date(2026, 1, 31))
    with billing_date(date(2026, 7, 31)):
        _sync(family_id)
        assert _outstanding(family_id)["masavari_outstanding"] == 4900
        assert _masavari_balances(family_id, cats["masavari"]) == [700, 1400, 2100, 2800, 3500, 4200, 4900]


def test_partial_payment_499_leaves_4401():
    cats = _set_settings()
    family_id = _create_family(date(2026, 1, 31))
    with billing_date(date(2026, 7, 31)):
        _sync(family_id)
        _pay(family_id, cats["masavari"], 499, "2026-07-15")
        assert _outstanding(family_id)["masavari_outstanding"] == 4401
        balances = _masavari_balances(family_id, cats["masavari"])
        assert balances[-1] == 4401
        assert balances[-1] != 499


def test_pay_remaining_clears_balance():
    cats = _set_settings()
    family_id = _create_family(date(2026, 1, 31))
    with billing_date(date(2026, 7, 31)):
        _sync(family_id)
        _pay(family_id, cats["masavari"], 499, "2026-07-15")
        _pay(family_id, cats["masavari"], 4401, "2026-07-20")
        assert _outstanding(family_id)["masavari_outstanding"] == 0
        assert _masavari_balances(family_id, cats["masavari"])[-1] == 0


def test_next_month_after_full_payment_is_700():
    cats = _set_settings()
    family_id = _create_family(date(2026, 1, 31))
    with billing_date(date(2026, 7, 31)):
        _sync(family_id)
        _pay(family_id, cats["masavari"], 4900, "2026-07-20")
    with billing_date(date(2026, 8, 1)):
        _sync(family_id)
        assert _outstanding(family_id)["masavari_outstanding"] == 700
        assert _masavari_balances(family_id, cats["masavari"])[-1] == 700


def test_drf_separate_from_masavari():
    cats = _set_settings(drf=2000, drf_monthly=False)
    family_id = _create_family(date(2026, 7, 31))
    with billing_date(date(2026, 7, 31)):
        _sync(family_id)
        _pay(family_id, cats["masavari"], 499, "2026-07-15")
        out = _outstanding(family_id)
        assert out["masavari_outstanding"] == 4401
        assert out["drf_outstanding"] == 2000
        assert out["total_outstanding"] == 6401
        masavari_last = [e for e in _ledger(family_id, cats["masavari"]) if e["category_id"] == cats["masavari"]][-1]["balance"]
        drf_last = [e for e in _ledger(family_id, cats["drf"]) if e["category_id"] == cats["drf"]][-1]["balance"]
        assert masavari_last == 4401
        assert drf_last == 2000


def test_refresh_does_not_duplicate_masavari():
    cats = _set_settings()
    family_id = _create_family(date(2026, 3, 31))
    with billing_date(date(2026, 3, 31)):
        for _ in range(5):
            _sync(family_id)
        assert _due_count(family_id, cats["masavari"]) == 3
        assert _outstanding(family_id)["masavari_outstanding"] == 2100


def test_catch_up_missing_months():
    cats = _set_settings()
    family_id = _create_family(date(2026, 1, 31))
    with billing_date(date(2026, 1, 31)):
        _sync(family_id)
    with billing_date(date(2026, 10, 31)):
        _sync(family_id)
        assert _due_count(family_id, cats["masavari"]) == 10
        assert _outstanding(family_id)["masavari_outstanding"] == 7000
        assert _masavari_balances(family_id, cats["masavari"])[-1] == 7000


def test_fifo_partial_payment_allocates_oldest_first():
    cats = _set_settings()
    family_id = _create_family(date(2026, 1, 31))
    with billing_date(date(2026, 3, 31)):
        _sync(family_id)
        _pay(family_id, cats["masavari"], 499, "2026-03-15")
        db = SessionLocal()
        try:
            dues = (
                db.query(FamilyDue)
                .filter(FamilyDue.family_id == family_id, FamilyDue.category_id == cats["masavari"], FamilyDue.billing_month > 0)
                .order_by(FamilyDue.billing_year, FamilyDue.billing_month)
                .all()
            )
            assert len(dues) == 3
            assert dues[0].amount_due - dues[0].amount_paid == 201
            assert dues[1].amount_due - dues[1].amount_paid == 700
            assert dues[2].amount_due - dues[2].amount_paid == 700
        finally:
            db.close()
        assert _outstanding(family_id)["masavari_outstanding"] == 1601
        assert _masavari_balances(family_id, cats["masavari"])[-1] == 1601


def test_ledger_running_balance_matches_category_outstanding_after_each_entry():
    cats = _set_settings()
    family_id = _create_family(date(2026, 1, 31))
    with billing_date(date(2026, 7, 31)):
        _sync(family_id)
        _pay(family_id, cats["masavari"], 499, "2026-07-15")
        entries = _ledger(family_id, cats["masavari"])
        running = 0.0
        for entry in entries:
            running = round(running + entry["debit"] - entry["credit"], 2)
            assert entry["balance"] == running
        assert running == 4401
        assert _outstanding(family_id)["masavari_outstanding"] == 4401
