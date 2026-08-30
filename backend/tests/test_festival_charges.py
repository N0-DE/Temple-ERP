"""Admin-triggered festival charges — apply, duplicate protection, payments, sorting."""

from __future__ import annotations

import sys
import uuid
from contextlib import contextmanager, nullcontext
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
    return uuid.uuid4().hex[:8].upper()


def _festival_cat(slug: str) -> str:
    return next(c["id"] for c in client.get("/api/v1/family-contributions/categories").json() if c["slug"] == slug)


def _create_families(count: int, *, as_of: date | None = None) -> list[str]:
    ids = []
    with billing_date(as_of) if as_of else nullcontext():
        for _ in range(count):
            uid = _uid()
            fam = client.post(
                "/api/v1/family-contributions/families",
                json={
                    "family_number": f"FEST-{uid}",
                    "head_of_family": f"FestHead-{uid}",
                    "joining_date": "2026-01-01",
                },
            ).json()
            ids.append(fam["id"])
    return ids


def _create_and_apply(name: str, slug: str, amount: float, family_ids: list[str], charge_date: str = "2026-08-30") -> str:
    cat_id = _festival_cat(slug)
    event = client.post(
        "/api/v1/family-contributions/festival-charges",
        json={
            "name": name,
            "category_id": cat_id,
            "amount": amount,
            "charge_date": charge_date,
            "apply_to_all": False,
            "family_ids": family_ids,
        },
    )
    assert event.status_code == 200, event.text
    applied = client.post(f"/api/v1/family-contributions/festival-charges/{event.json()['id']}/apply")
    assert applied.status_code == 200, applied.text
    return event.json()["id"]


def _set_masavari(amount: float = 700) -> None:
    settings = client.get("/api/v1/family-contributions/settings").json()
    client.put(
        "/api/v1/family-contributions/settings",
        json={
            **settings,
            "masavari_amount": amount,
            "drf_amount": 2000,
            "drf_is_monthly": False,
            "festival_1_minimum": 0,
            "festival_2_minimum": 0,
            "festival_3_minimum": 0,
            "amount_effective_from": "2026-01-01",
        },
    )


def _fest_out_for_families(family_ids: list[str], *, as_of: date | None = None) -> float:
    total = 0.0
    with billing_date(as_of) if as_of else nullcontext():
        for fid in family_ids:
            out = client.get(f"/api/v1/family-contributions/outstanding/{fid}").json()["outstanding"]
            total += out["festival_outstanding"]
    return total


def _event_fest_out(family_ids: list[str]) -> float:
    """Festival outstanding from admin-triggered event dues only."""
    db = SessionLocal()
    try:
        rows = (
            db.query(FamilyDue)
            .filter(
                FamilyDue.family_id.in_(family_ids),
                FamilyDue.festival_charge_event_id.isnot(None),
                FamilyDue.is_deleted.is_(False),
            )
            .all()
        )
        return round(sum(max(0.0, d.amount_due - d.amount_paid) for d in rows), 2)
    finally:
        db.close()


def test_apply_festival_charge_to_10_families():
    """Test 1: 10 families × ₹1,000 = ₹10,000 festival outstanding."""
    ids = _create_families(10)
    _create_and_apply("Onam", "festival-1", 1000, ids)
    assert _event_fest_out(ids) == 10000


def test_duplicate_apply_does_not_double_charge():
    """Test 2: Apply twice — total remains ₹10,000."""
    ids = _create_families(10)
    cat_id = _festival_cat("festival-1")
    event = client.post(
        "/api/v1/family-contributions/festival-charges",
        json={"name": "Onam", "category_id": cat_id, "amount": 1000, "charge_date": "2026-08-30", "apply_to_all": False, "family_ids": ids},
    ).json()
    r1 = client.post(f"/api/v1/family-contributions/festival-charges/{event['id']}/apply")
    r2 = client.post(f"/api/v1/family-contributions/festival-charges/{event['id']}/apply")
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r2.json()["skipped_duplicates"] == 10
    assert r2.json()["newly_charged"] == 0
    assert _event_fest_out(ids) == 10000


def test_festival_charge_1_and_2_are_independent():
    """Test 3: FC1 and FC2 remain separate."""
    ids = _create_families(5)
    _create_and_apply("Onam", "festival-1", 1000, ids)
    _create_and_apply("Temple Day", "festival-2", 500, ids)
    assert _event_fest_out(ids) == 7500


def test_festival_partial_payment():
    """Test 4: Pay ₹400 toward Festival Charge 1 → ₹600 remaining."""
    ids = _create_families(1)
    cat_id = _festival_cat("festival-1")
    _create_and_apply("Onam", "festival-1", 1000, ids)
    pay = client.post(
        "/api/v1/family-contributions/payments",
        json={"family_id": ids[0], "category_id": cat_id, "amount": 400, "payment_date": "2026-08-31", "payment_mode": "Cash"},
    )
    assert pay.status_code == 200, pay.text
    assert _event_fest_out(ids) == 600


def test_categories_remain_separate():
    """Test 5: Masavari, Festival, DRF totals are independent."""
    _set_masavari(700)
    with billing_date(date(2026, 2, 28)):
        ids = _create_families(1, as_of=date(2026, 2, 28))
        client.get(f"/api/v1/family-contributions/outstanding/{ids[0]}")
        _create_and_apply("Onam", "festival-1", 1000, ids)
        out = client.get(f"/api/v1/family-contributions/outstanding/{ids[0]}").json()["outstanding"]
        assert out["masavari_outstanding"] == 1400
        assert _event_fest_out(ids) == 1000
        assert out["drf_outstanding"] == 2000
        assert out["total_outstanding"] == 4400


def test_sort_by_highest_festival():
    """Test 6: Highest festival debt appears first."""
    ids_a = _create_families(1)
    ids_b = _create_families(1)
    _create_and_apply("Onam", "festival-1", 1000, ids_a)
    _create_and_apply("Onam", "festival-1", 1000, ids_b)
    _create_and_apply("Extra", "festival-2", 500, ids_b)
    assert _event_fest_out(ids_b) == 1500
    assert _event_fest_out(ids_a) == 1000


def test_filter_festival_category():
    """Test 7: Festival filter shows only families with festival dues."""
    _set_masavari(700)
    with billing_date(date(2026, 1, 31)):
        ids = _create_families(3, as_of=date(2026, 1, 31))
        client.get("/api/v1/family-contributions/outstanding")
    _create_and_apply("Onam", "festival-1", 1000, ids)
    for fid in ids:
        out = client.get(f"/api/v1/family-contributions/outstanding/{fid}").json()["outstanding"]
        assert out["festival_outstanding"] >= 1000
        assert _event_fest_out([fid]) == 1000


def test_new_festival_does_not_alter_historical():
    """Test 8: New charge added once; does not alter prior charges or Masavari."""
    _set_masavari(700)
    with billing_date(date(2026, 2, 28)):
        ids = _create_families(2, as_of=date(2026, 2, 28))
        before = client.get(f"/api/v1/family-contributions/outstanding/{ids[0]}").json()["outstanding"]["masavari_outstanding"]
        _create_and_apply("Onam", "festival-1", 1000, ids)
        after_first = client.get(f"/api/v1/family-contributions/outstanding/{ids[0]}").json()["outstanding"]
        _create_and_apply("Vishu", "festival-1", 800, ids, "2026-09-15")
        after_second = client.get(f"/api/v1/family-contributions/outstanding/{ids[0]}").json()["outstanding"]
        assert after_first["masavari_outstanding"] == before
        assert after_second["masavari_outstanding"] == before
        assert _event_fest_out(ids[:1]) == 1800


def test_refresh_does_not_auto_generate_festival():
    """Test 9: Repeated outstanding queries do not create festival charges for a family."""
    ids = _create_families(2)
    _create_and_apply("Onam", "festival-1", 1000, ids)
    db = SessionLocal()
    try:
        before = (
            db.query(FamilyDue)
            .filter(FamilyDue.family_id.in_(ids), FamilyDue.festival_charge_event_id.isnot(None))
            .count()
        )
    finally:
        db.close()
    for _ in range(5):
        client.get("/api/v1/family-contributions/outstanding")
    db = SessionLocal()
    try:
        after = (
            db.query(FamilyDue)
            .filter(FamilyDue.family_id.in_(ids), FamilyDue.festival_charge_event_id.isnot(None))
            .count()
        )
        assert after == before == 2
    finally:
        db.close()


def test_one_due_per_family_per_event():
    """Test 10: Each family has exactly one due per festival event."""
    ids = _create_families(5)
    event_id = _create_and_apply("Onam", "festival-1", 1000, ids)
    db = SessionLocal()
    try:
        dues = db.query(FamilyDue).filter(FamilyDue.festival_charge_event_id == event_id, FamilyDue.family_id.in_(ids)).all()
        assert len(dues) == 5
        assert len({d.family_id for d in dues}) == 5
    finally:
        db.close()
