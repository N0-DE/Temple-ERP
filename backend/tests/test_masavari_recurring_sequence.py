"""
End-to-end Masavari recurring-debt simulation — exact sequence from requirements.

Uses frozen billing.date.today() to simulate Jan → May 2026 without waiting for real time.
"""

from __future__ import annotations

import sys
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any
from unittest.mock import patch

# Allow `python tests/test_masavari_recurring_sequence.py` from backend folder
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

from core.database import SessionLocal
from main import app
from models.family_contribution import FamilyDue
from services import billing_service as billing

client = TestClient(app)

FROZEN_TODAY = date(2026, 5, 31)


@pytest.fixture(autouse=True)
def freeze_billing_today():
    with patch.object(billing, "date") as mock_date:
        mock_date.today.return_value = FROZEN_TODAY
        mock_date.side_effect = lambda *args, **kw: date(*args, **kw)
        yield


@contextmanager
def billing_date(day: date):
    with patch.object(billing, "date") as mock_date:
        mock_date.today.return_value = day
        mock_date.side_effect = lambda *args, **kw: date(*args, **kw)
        yield


def _uid() -> str:
    return uuid.uuid4().hex[:8].upper()


def _sync_dues(family_id: str) -> None:
    """Trigger backend due generation the same way the app does (outstanding API)."""
    r = client.get(f"/api/v1/family-contributions/outstanding/{family_id}")
    assert r.status_code == 200, r.text


def _outstanding(family_id: str) -> float:
    r = client.get(f"/api/v1/family-contributions/outstanding/{family_id}")
    assert r.status_code == 200, r.text
    return r.json()["outstanding"]["masavari_outstanding"]


def _fetch_dues(family_id: str, category_id: str) -> list[dict[str, Any]]:
    db = SessionLocal()
    try:
        rows = (
            db.query(FamilyDue)
            .filter(
                FamilyDue.family_id == family_id,
                FamilyDue.category_id == category_id,
                FamilyDue.is_deleted.is_(False),
                FamilyDue.festival_charge_event_id.is_(None),
                FamilyDue.billing_month > 0,
                FamilyDue.billing_month <= 12,
            )
            .order_by(FamilyDue.billing_year, FamilyDue.billing_month)
            .all()
        )
        return [
            {
                "month": f"{r.billing_year}-{r.billing_month:02d}",
                "amount_due": r.amount_due,
                "amount_paid": r.amount_paid,
                "balance": round(r.amount_due - r.amount_paid, 2),
                "status": r.status,
            }
            for r in rows
        ]
    finally:
        db.close()


def _assert_one_due_per_month(dues: list[dict[str, Any]]) -> None:
    months = [d["month"] for d in dues]
    assert len(months) == len(set(months)), f"Duplicate billing months found: {months}"


@dataclass
class StepResult:
    step: int
    description: str
    expected: str
    actual: str
    passed: bool
    db_records: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class SimulationReport:
    results: list[StepResult] = field(default_factory=list)

    def record(self, step: int, description: str, expected: str, actual: str, passed: bool, dues: list[dict] | None = None):
        self.results.append(StepResult(step, description, expected, actual, passed, dues or []))


def run_masavari_sequence_simulation() -> SimulationReport:
    report = SimulationReport()
    family_id: str | None = None
    cat_id: str | None = None

    # Step 1: Create family @ ₹500/month
    with billing_date(date(2026, 1, 15)):
        settings = client.get("/api/v1/family-contributions/settings").json()
        client.put(
            "/api/v1/family-contributions/settings",
            json={
                **settings,
                "masavari_amount": 500,
                "drf_amount": 0,
                "drf_is_monthly": False,
                "amount_effective_from": "2026-01-01",
            },
        )
        masavari = next(c for c in client.get("/api/v1/family-contributions/categories").json() if c["slug"] == "masavari")
        cat_id = masavari["id"]
        fam = client.post(
            "/api/v1/family-contributions/families",
            json={
                "family_number": f"REC-{_uid()}",
                "head_of_family": "Recurring Debt Simulation",
                "joining_date": "2026-01-01",
            },
        ).json()
        family_id = fam["id"]

    assert family_id and cat_id

    # Step 2–3: January 2026
    with billing_date(date(2026, 1, 31)):
        _sync_dues(family_id)
        out = _outstanding(family_id)
        dues = _fetch_dues(family_id, cat_id)
        _assert_one_due_per_month(dues)
        report.record(3, "January outstanding", "Rs.500", f"Rs.{out}", out == 500, dues)

    # Step 4–5: February 2026
    with billing_date(date(2026, 2, 28)):
        _sync_dues(family_id)
        out = _outstanding(family_id)
        dues = _fetch_dues(family_id, cat_id)
        _assert_one_due_per_month(dues)
        ok = out == 1000 and len(dues) == 2
        report.record(5, "February outstanding + due count", "Rs.1,000, 2 dues (Jan+Feb)", f"Rs.{out}, {len(dues)} dues", ok, dues)

    # Step 6–7: Jump to May 2026
    with billing_date(date(2026, 5, 15)):
        _sync_dues(family_id)
        out = _outstanding(family_id)
        dues = _fetch_dues(family_id, cat_id)
        _assert_one_due_per_month(dues)
        months = [d["month"] for d in dues]
        expected_months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]
        ok = out == 2500 and months == expected_months
        report.record(7, "May catch-up outstanding", "Rs.2,500, 5 months Jan-May", f"Rs.{out}, months={months}", ok, dues)

    # Step 8: Multiple refreshes — no duplicates
    with billing_date(date(2026, 5, 15)):
        for _ in range(10):
            _sync_dues(family_id)
            client.get("/api/v1/family-contributions/outstanding")
            client.get(f"/api/v1/family-contributions/families/{family_id}")
        out = _outstanding(family_id)
        dues = _fetch_dues(family_id, cat_id)
        _assert_one_due_per_month(dues)
        ok = out == 2500 and len(dues) == 5
        report.record(8, "10 refreshes — stable outstanding", "Rs.2,500, 5 dues, no duplicates", f"Rs.{out}, {len(dues)} dues", ok, dues)

    # Step 9: ₹700 payment — FIFO
    with billing_date(date(2026, 5, 20)):
        r = client.post(
            "/api/v1/family-contributions/payments",
            json={
                "family_id": family_id,
                "category_id": cat_id,
                "amount": 700,
                "payment_date": "2026-05-20",
                "payment_mode": "Cash",
            },
        )
        assert r.status_code == 200, r.text
        out = _outstanding(family_id)
        all_dues = _fetch_dues(family_id, cat_id)
        dues = [d for d in all_dues if d["month"] <= "2026-05"]
        assert len(dues) == 5, f"Expected 5 masavari dues through May, got {len(all_dues)}: {all_dues}"
        jan, feb, mar, apr, may = dues
        fifo_ok = (
            jan["amount_paid"] == 500 and jan["balance"] == 0
            and feb["amount_paid"] == 200 and feb["balance"] == 300
            and mar["balance"] == 500 and apr["balance"] == 500 and may["balance"] == 500
            and out == 1800
        )
        report.record(
            9,
            "Rs.700 FIFO payment",
            "Jan paid, Feb Rs.300 left, Mar-May Rs.500 each, total Rs.1,800",
            f"out=Rs.{out}, balances={[d['balance'] for d in dues]}",
            fifo_ok,
            dues,
        )

    # Step 10: Rate change to ₹700 from March
    settings = client.get("/api/v1/family-contributions/settings").json()
    client.put(
        "/api/v1/family-contributions/settings",
        json={**settings, "masavari_amount": 700, "amount_effective_from": "2026-03-01"},
    )
    with billing_date(date(2026, 5, 20)):
        _sync_dues(family_id)
        dues = _fetch_dues(family_id, cat_id)
        rate_ok = (
            dues[0]["amount_due"] == 500
            and dues[1]["amount_due"] == 500
            and dues[2]["amount_due"] == 700
            and dues[3]["amount_due"] == 700
            and dues[4]["amount_due"] == 700
        )
        report.record(
            10,
            "Rate Rs.700 from March",
            "Jan/Feb Rs.500, Mar-May Rs.700",
            f"amounts_due={[d['amount_due'] for d in dues]}",
            rate_ok,
            dues,
        )

    return report


def test_masavari_recurring_debt_full_sequence():
    """Pytest wrapper — all steps must pass."""
    report = run_masavari_sequence_simulation()
    failures = [r for r in report.results if not r.passed]
    if failures:
        msgs = "\n".join(f"Step {f.step}: expected {f.expected}, got {f.actual}" for f in failures)
        pytest.fail(f"Masavari sequence failures:\n{msgs}")


if __name__ == "__main__":
    rep = run_masavari_sequence_simulation()
    print("\n=== MASAVARI RECURRING DEBT SIMULATION ===\n")
    all_pass = True
    for r in rep.results:
        status = "PASS" if r.passed else "FAIL"
        if not r.passed:
            all_pass = False
        print(f"[{status}] Step {r.step}: {r.description}")
        print(f"       Expected: {r.expected}")
        print(f"       Actual:   {r.actual}")
        if r.db_records:
            print("       DB records:")
            for row in r.db_records:
                print(f"         {row}")
        print()
    print("OVERALL:", "ALL PASSED" if all_pass else "SOME FAILED")
