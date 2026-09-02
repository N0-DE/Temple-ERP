"""Family contribution billing engine — due generation, FIFO allocation, outstanding calculation."""

from __future__ import annotations

import re
from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models.family_contribution import (
    ContributionCategory,
    ContributionRate,
    ContributionSetting,
    Family,
    FamilyDue,
    FestivalChargeEvent,
    LedgerEntry,
    Payment,
    PaymentHistory,
    PaymentItem,
)

DEFAULT_CATEGORIES = [
    {"name": "Masavari", "slug": "masavari", "description": "Fixed monthly contribution", "category_type": "monthly", "is_fixed": True, "is_monthly": True},
    {"name": "Festival Charge 1", "slug": "festival-1", "description": "Festival contribution", "category_type": "festival", "is_fixed": False, "is_monthly": False},
    {"name": "Festival Charge 2", "slug": "festival-2", "description": "Festival contribution", "category_type": "festival", "is_fixed": False, "is_monthly": False},
    {"name": "Festival Charge 3", "slug": "festival-3", "description": "Festival contribution", "category_type": "festival", "is_fixed": False, "is_monthly": False},
    {"name": "Death Relief Fund", "slug": "drf", "description": "Death relief fund", "category_type": "relief", "is_fixed": True, "is_monthly": False},
]

SLUG_SETTING_MAP = {
    "masavari": "masavari_amount",
    "festival-1": "festival_1_minimum",
    "festival-2": "festival_2_minimum",
    "festival-3": "festival_3_minimum",
    "drf": "drf_amount",
}


def format_inr(amount: float) -> str:
    """Format amount as Indian rupees for user-facing messages."""
    if float(amount).is_integer():
        return f"₹{int(amount):,}"
    return f"₹{amount:,.2f}"


def get_settings(db: Session) -> ContributionSetting:
    settings = db.query(ContributionSetting).filter(ContributionSetting.is_deleted.is_(False)).first()
    if not settings:
        settings = ContributionSetting()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def ensure_default_categories(db: Session) -> None:
    for item in DEFAULT_CATEGORIES:
        existing = db.query(ContributionCategory).filter(ContributionCategory.slug == item["slug"]).first()
        if not existing:
            db.add(ContributionCategory(**item, is_active=True))
    drf = get_category_by_slug(db, "drf")
    if drf:
        drf.is_monthly = False
        drf.category_type = "relief"
    db.commit()


def get_category_by_slug(db: Session, slug: str) -> Optional[ContributionCategory]:
    return (
        db.query(ContributionCategory)
        .filter(ContributionCategory.slug == slug, ContributionCategory.is_deleted.is_(False))
        .first()
    )


def get_amount_for_category(settings: ContributionSetting, category: ContributionCategory) -> float:
    field = SLUG_SETTING_MAP.get(category.slug)
    if field:
        return float(getattr(settings, field, 0) or 0)
    return float(category.default_amount or category.minimum_amount or 0)


def get_rate_record_for_date(db: Session, category: ContributionCategory, as_of: date) -> tuple[float, Optional[str]]:
    """Return (amount, rate_id) for a category on a given date."""
    rate = (
        db.query(ContributionRate)
        .filter(
            ContributionRate.category_id == category.id,
            ContributionRate.effective_from <= as_of,
            or_(ContributionRate.effective_to.is_(None), ContributionRate.effective_to > as_of),
        )
        .order_by(ContributionRate.effective_from.desc())
        .first()
    )
    if rate:
        return float(rate.amount), rate.id
    settings = get_settings(db)
    return get_amount_for_category(settings, category), None


def get_rate_for_date(db: Session, category: ContributionCategory, as_of: date) -> float:
    amount, _ = get_rate_record_for_date(db, category, as_of)
    return amount


def _due_status(amount_due: float, amount_paid: float) -> str:
    if amount_paid >= amount_due:
        return "paid"
    if amount_paid > 0:
        return "partial"
    return "pending"


def _month_start(year: int, month: int) -> date:
    return date(year, month, 1)


def is_billing_period_due(billing_year: int, billing_month: int, as_of: Optional[date] = None) -> bool:
    """True when the calendar month (or festival year/event date) has begun and should count toward outstanding."""
    as_of = as_of or date.today()
    if billing_month == 0:
        return billing_year <= as_of.year
    if billing_month < 0:
        return billing_year <= as_of.year
    if billing_month > 12:
        month, day = divmod(billing_month, 100)
        try:
            return date(billing_year, month, day) <= as_of
        except ValueError:
            return billing_year <= as_of.year
    return (billing_year, billing_month) <= (as_of.year, as_of.month)


def due_balance(due: FamilyDue, as_of: Optional[date] = None) -> float:
    if not is_billing_period_due(due.billing_year, due.billing_month, as_of):
        return 0.0
    return max(0.0, due.amount_due - due.amount_paid)


def compute_category_outstanding(db: Session, family_id: str, category_id: str, as_of: Optional[date] = None) -> float:
    """Cumulative unpaid balance for one category (source of truth from family_dues)."""
    today = as_of or date.today()
    dues = (
        db.query(FamilyDue)
        .filter(
            FamilyDue.family_id == family_id,
            FamilyDue.category_id == category_id,
            FamilyDue.is_deleted.is_(False),
        )
        .all()
    )
    return round(sum(due_balance(d, today) for d in dues), 2)


def rebuild_ledger_balances(
    db: Session,
    family_id: str,
    category_id: Optional[str] = None,
    *,
    commit: bool = True,
) -> None:
    """Recalculate running cumulative balance per category from ledger debits/credits."""
    query = db.query(LedgerEntry).filter(LedgerEntry.family_id == family_id)
    if category_id:
        query = query.filter(LedgerEntry.category_id == category_id)
    entries = query.order_by(LedgerEntry.entry_date.asc(), LedgerEntry.created_at.asc()).all()
    running: dict[str, float] = {}
    for entry in entries:
        running[entry.category_id] = round(running.get(entry.category_id, 0.0) + entry.debit - entry.credit, 2)
        entry.balance = running[entry.category_id]
    if commit:
        db.commit()


def _iter_months(start: date, end: date):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield y, m
        m += 1
        if m > 12:
            m = 1
            y += 1


def _family_start_date(family: Family) -> date:
    return family.joining_date or (family.created_at.date() if family.created_at else date.today())


def reconcile_monthly_due_amount(db: Session, due: FamilyDue, category: ContributionCategory) -> bool:
    """Align an existing monthly due with the rate schedule for its billing month."""
    if due.billing_month <= 0:
        return False
    period_date = _month_start(due.billing_year, due.billing_month)
    amount, rate_id = get_rate_record_for_date(db, category, period_date)
    if amount <= 0:
        return False
    corrected = max(amount, due.amount_paid)
    if due.amount_due == corrected and due.contribution_rate_id == rate_id:
        return False
    due.amount_due = corrected
    due.contribution_rate_id = rate_id
    due.status = _due_status(due.amount_due, due.amount_paid)

    entry_date = date(due.billing_year, due.billing_month, 1)
    ledger = (
        db.query(LedgerEntry)
        .filter(
            LedgerEntry.family_id == due.family_id,
            LedgerEntry.category_id == due.category_id,
            LedgerEntry.entry_type == "due",
            LedgerEntry.entry_date == entry_date,
        )
        .first()
    )
    if ledger:
        ledger.debit = due.amount_due
    return True


def ensure_monthly_dues_for_family(db: Session, family: Family, up_to: Optional[date] = None) -> None:
    """Generate one Masavari due per month per family using the GLOBAL rate schedule.

    Rules:
    - Rate comes from contribution_settings / contribution_rates (never per-family).
    - Exactly one due row per (family, category, year, month) — duplicates skipped.
    - Months from joining_date through the current calendar month are generated.
    """
    if family.status != "Active" or family.is_deleted:
        return

    up_to = up_to or date.today()
    start = _family_start_date(family)
    settings = get_settings(db)

    masavari = get_category_by_slug(db, "masavari")

    monthly_categories = []
    if masavari and masavari.is_active:
        monthly_categories.append(masavari)

    for category in monthly_categories:
        for year, month in _iter_months(start, up_to):
            exists = (
                db.query(FamilyDue)
                .filter(
                    FamilyDue.family_id == family.id,
                    FamilyDue.category_id == category.id,
                    FamilyDue.billing_year == year,
                    FamilyDue.billing_month == month,
                    FamilyDue.festival_charge_event_id.is_(None),
                    FamilyDue.is_deleted.is_(False),
                )
                .first()
            )
            if exists:
                if reconcile_monthly_due_amount(db, exists, category):
                    rebuild_ledger_balances(db, family.id, category.id, commit=False)
                continue

            period_date = _month_start(year, month)
            amount, rate_id = get_rate_record_for_date(db, category, period_date)
            if amount <= 0:
                continue

            db.add(
                FamilyDue(
                    family_id=family.id,
                    category_id=category.id,
                    billing_month=month,
                    billing_year=year,
                    amount_due=amount,
                    amount_paid=0.0,
                    contribution_rate_id=rate_id,
                    status="pending",
                )
            )
            db.flush()
            due = (
                db.query(FamilyDue)
                .filter(
                    FamilyDue.family_id == family.id,
                    FamilyDue.category_id == category.id,
                    FamilyDue.billing_year == year,
                    FamilyDue.billing_month == month,
                )
                .first()
            )
            if due:
                record_due_ledger(db, due, category)
        rebuild_ledger_balances(db, family.id, category.id, commit=False)
    db.commit()


def ensure_all_monthly_dues(db: Session, up_to: Optional[date] = None) -> None:
    families = db.query(Family).filter(Family.is_deleted.is_(False), Family.status == "Active").all()
    for family in families:
        ensure_monthly_dues_for_family(db, family, up_to)


def _annual_drf_start_year(family: Family) -> int:
    return _family_start_date(family).year


def ensure_annual_drf_for_family(db: Session, family: Family, up_to: Optional[date] = None) -> None:
    """Generate one annual DRF due per calendar year from joining year through up_to year.

    Uses billing_month=0 as the annual marker. Existing dues are never modified (immutable amounts).
    """
    if family.status != "Active" or family.is_deleted:
        return

    drf = get_category_by_slug(db, "drf")
    if not drf or not drf.is_active:
        return

    up_to = up_to or date.today()
    start_year = _annual_drf_start_year(family)
    end_year = up_to.year

    created_any = False
    for year in range(start_year, end_year + 1):
        exists = (
            db.query(FamilyDue)
            .filter(
                FamilyDue.family_id == family.id,
                FamilyDue.category_id == drf.id,
                FamilyDue.billing_year == year,
                FamilyDue.billing_month == 0,
                FamilyDue.festival_charge_event_id.is_(None),
                FamilyDue.is_deleted.is_(False),
            )
            .first()
        )
        if exists:
            continue

        amount, rate_id = get_rate_record_for_date(db, drf, date(year, 1, 1))
        if amount <= 0:
            continue

        due = FamilyDue(
            family_id=family.id,
            category_id=drf.id,
            billing_month=0,
            billing_year=year,
            amount_due=amount,
            amount_paid=0.0,
            contribution_rate_id=rate_id,
            status="pending",
        )
        nested = db.begin_nested()
        try:
            db.add(due)
            db.flush()
            record_due_ledger(db, due, drf)
            nested.commit()
            created_any = True
        except IntegrityError:
            nested.rollback()

    if created_any:
        rebuild_ledger_balances(db, family.id, drf.id, commit=False)
    db.commit()


def ensure_all_annual_drf_dues(db: Session, up_to: Optional[date] = None) -> None:
    families = db.query(Family).filter(Family.is_deleted.is_(False), Family.status == "Active").all()
    for family in families:
        ensure_annual_drf_for_family(db, family, up_to)


def ensure_festival_due(db: Session, family: Family, category: ContributionCategory, year: int) -> Optional[FamilyDue]:
    """One festival due per family per financial year (billing_month=0 marker)."""
    exists = (
        db.query(FamilyDue)
        .filter(
            FamilyDue.family_id == family.id,
            FamilyDue.category_id == category.id,
            FamilyDue.billing_year == year,
            FamilyDue.billing_month == 0,
            FamilyDue.is_deleted.is_(False),
        )
        .first()
    )
    if exists:
        return exists

    amount, rate_id = get_rate_record_for_date(db, category, date(year, 1, 1))
    if amount <= 0:
        return None

    due = FamilyDue(
        family_id=family.id,
        category_id=category.id,
        billing_month=0,
        billing_year=year,
        amount_due=amount,
        amount_paid=0.0,
        contribution_rate_id=rate_id,
        status="pending",
    )
    db.add(due)
    db.flush()
    record_due_ledger(db, due, category)
    rebuild_ledger_balances(db, family.id, category.id, commit=False)
    db.commit()
    db.refresh(due)
    return due


def ensure_festival_dues_for_all(db: Session, year: Optional[int] = None) -> None:
    year = year or date.today().year
    families = db.query(Family).filter(Family.is_deleted.is_(False), Family.status == "Active").all()
    categories = (
        db.query(ContributionCategory)
        .filter(ContributionCategory.category_type == "festival", ContributionCategory.is_deleted.is_(False), ContributionCategory.is_active.is_(True))
        .all()
    )
    for family in families:
        for category in categories:
            ensure_festival_due(db, family, category, year)


def get_unpaid_dues(db: Session, family_id: str, category_id: str):
    today = date.today()
    dues = (
        db.query(FamilyDue)
        .filter(
            FamilyDue.family_id == family_id,
            FamilyDue.category_id == category_id,
            FamilyDue.is_deleted.is_(False),
            FamilyDue.status.in_(["pending", "partial"]),
        )
        .order_by(FamilyDue.billing_year.asc(), FamilyDue.billing_month.asc())
        .all()
    )
    return [d for d in dues if is_billing_period_due(d.billing_year, d.billing_month, today)]


def apply_payment_fifo(
    db: Session,
    payment: Payment,
    category: ContributionCategory,
    amount: float,
    partial_allowed: bool,
) -> list[PaymentItem]:
    """Apply payment to oldest unpaid dues first (FIFO). Returns created payment items."""
    remaining = amount
    items: list[PaymentItem] = []

    if category.slug.startswith("festival"):
        pass  # Festival dues are admin-triggered only — no auto-create on payment

    unpaid = get_unpaid_dues(db, payment.family_id, payment.category_id)
    if not unpaid and category.is_monthly:
        family = db.query(Family).filter(Family.id == payment.family_id).first()
        if family:
            ensure_monthly_dues_for_family(db, family, up_to=payment.payment_date)
            unpaid = get_unpaid_dues(db, payment.family_id, payment.category_id)

    if not unpaid and category.slug == "drf":
        family = db.query(Family).filter(Family.id == payment.family_id).first()
        if family:
            ensure_annual_drf_for_family(db, family, up_to=payment.payment_date)
            unpaid = get_unpaid_dues(db, payment.family_id, payment.category_id)

    if not unpaid:
        if amount > 0:
            raise ValueError("No outstanding dues found for this category")
        return items

    for due in unpaid:
        if remaining <= 0:
            break
        balance = due.amount_due - due.amount_paid
        if balance <= 0:
            continue
        applied = min(remaining, balance)
        due.amount_paid += applied
        due.status = _due_status(due.amount_due, due.amount_paid)
        remaining -= applied

        pay_label = category.name
        if due.festival_charge_event_id:
            fest = db.query(FestivalChargeEvent).filter(FestivalChargeEvent.id == due.festival_charge_event_id).first()
            if fest:
                pay_label = fest.name
        elif due.billing_month == 0:
            pay_label = f"{category.name} {due.billing_year}"
        elif due.billing_month:
            pay_label = f"{category.name} {due.billing_month:02d}/{due.billing_year}"

        item = PaymentItem(payment_id=payment.id, family_due_id=due.id, amount_paid=applied)
        db.add(item)
        items.append(item)

        db.add(
            LedgerEntry(
                family_id=payment.family_id,
                payment_id=payment.id,
                category_id=payment.category_id,
                entry_date=payment.payment_date,
                description=f"Payment applied to {pay_label}",
                debit=0.0,
                credit=applied,
                balance=0.0,
                remarks=payment.remarks,
                entry_type="payment",
                payment_mode=payment.payment_mode,
                collected_by=payment.collected_by,
                receipt_number=payment.receipt_number,
            )
        )

    db.flush()
    rebuild_ledger_balances(db, payment.family_id, payment.category_id, commit=False)
    if remaining > 0:
        outstanding = compute_category_outstanding(db, payment.family_id, payment.category_id)
        raise ValueError(
            f"Payment cannot exceed the selected category's outstanding amount of {format_inr(outstanding)}"
        )

    if amount > 0 and not items:
        raise ValueError("Payment was not allocated to any outstanding due")

    allocated = sum(i.amount_paid for i in items)
    if allocated <= 0 and amount > 0:
        raise ValueError("Payment amount must be greater than zero")

    return items


def reverse_payment(db: Session, payment: Payment) -> None:
    """Restore outstanding dues when a payment is deleted."""
    items = db.query(PaymentItem).filter(PaymentItem.payment_id == payment.id).all()
    for item in items:
        due = db.query(FamilyDue).filter(FamilyDue.id == item.family_due_id).first()
        if due:
            due.amount_paid = max(0.0, due.amount_paid - item.amount_paid)
            due.status = _due_status(due.amount_due, due.amount_paid)
        db.delete(item)

    db.query(LedgerEntry).filter(LedgerEntry.payment_id == payment.id).delete()
    rebuild_ledger_balances(db, payment.family_id, payment.category_id)
    db.add(
        PaymentHistory(
            family_id=payment.family_id,
            payment_id=payment.id,
            action="deleted",
            details=f"Payment {payment.receipt_number} reversed",
        )
    )
    db.commit()


def generate_receipt_number(db: Session, settings: ContributionSetting) -> str:
    prefix = (settings.receipt_prefix or "RCPT").upper()
    count = db.query(Payment).count() + 1
    today = date.today()
    return f"{prefix}-{today.year}-{today.month:02d}-{count:04d}"


def record_due_ledger(db: Session, due: FamilyDue, category: ContributionCategory) -> None:
    """Create debit ledger entry when a due is generated."""
    if due.billing_month == 0:
        period_label = str(due.billing_year)
        entry_date = date(due.billing_year, 1, 1)
    else:
        period_label = f"{due.billing_month:02d}/{due.billing_year}"
        entry_date = date(due.billing_year, due.billing_month, 1)
    db.add(
        LedgerEntry(
            family_id=due.family_id,
            category_id=due.category_id,
            entry_date=entry_date,
            description=f"Due generated — {category.name} {period_label}",
            debit=due.amount_due,
            credit=0.0,
            balance=0.0,
            entry_type="due",
        )
    )


def compute_family_outstanding(db: Session, family: Family, *, ensure_monthly: bool = True) -> dict:
    if ensure_monthly:
        ensure_monthly_dues_for_family(db, family)
    drf_cat = get_category_by_slug(db, "drf")
    if drf_cat:
        ensure_annual_drf_for_family(db, family)

    dues = (
        db.query(FamilyDue)
        .join(ContributionCategory)
        .filter(
            FamilyDue.family_id == family.id,
            FamilyDue.is_deleted.is_(False),
            FamilyDue.status.in_(["pending", "partial"]),
        )
        .all()
    )

    masavari_out = festival_out = drf_out = 0.0
    pending_months = 0
    masavari_cat = get_category_by_slug(db, "masavari")
    drf_cat = get_category_by_slug(db, "drf")
    today = date.today()

    for due in dues:
        balance = due_balance(due, today)
        if balance <= 0:
            continue
        cat = db.query(ContributionCategory).filter(ContributionCategory.id == due.category_id).first()
        if not cat:
            continue
        if cat.slug == "masavari":
            masavari_out += balance
            if due.billing_month:
                pending_months += 1
        elif cat.slug == "drf":
            drf_out += balance
        elif cat.category_type == "festival":
            festival_out += balance

    last_payment = (
        db.query(Payment)
        .filter(Payment.family_id == family.id, Payment.is_deleted.is_(False))
        .order_by(Payment.payment_date.desc())
        .first()
    )

    return {
        "family_id": family.id,
        "family_number": family.family_number,
        "family_name": family.head_of_family,
        "house_name": family.house_name,
        "ward": family.ward,
        "pending_months": pending_months,
        "masavari_outstanding": round(masavari_out, 2),
        "festival_outstanding": round(festival_out, 2),
        "drf_outstanding": round(drf_out, 2),
        "total_outstanding": round(masavari_out + festival_out + drf_out, 2),
        "last_payment_date": last_payment.payment_date.isoformat() if last_payment else None,
    }


def _family_payment_status(db: Session, family_id: str) -> str:
    dues = (
        db.query(FamilyDue)
        .filter(FamilyDue.family_id == family_id, FamilyDue.is_deleted.is_(False))
        .all()
    )
    has_partial = any(d.status == "partial" for d in dues)
    has_pending = any(d.status == "pending" and (d.amount_due - d.amount_paid) > 0 for d in dues)
    if has_partial:
        return "partial"
    if has_pending:
        return "unpaid"
    return "paid"


def list_outstanding_families(
    db: Session,
    search: Optional[str] = None,
    ward: Optional[str] = None,
    min_amount: Optional[float] = None,
    min_months: Optional[int] = None,
    category_slug: Optional[str] = None,
    payment_status: Optional[str] = None,
    sort_by: str = "highest_due",
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[dict], int, dict]:
    ensure_all_monthly_dues(db)

    families = db.query(Family).filter(Family.is_deleted.is_(False), Family.status == "Active")
    if search:
        term = f"%{search}%"
        families = families.filter(
            or_(
                Family.head_of_family.ilike(term),
                Family.family_number.ilike(term),
                Family.house_name.ilike(term),
            )
        )
    if ward:
        families = families.filter(Family.ward == ward)

    results = []
    for family in families.all():
        row = compute_family_outstanding(db, family, ensure_monthly=False)
        row["payment_status"] = _family_payment_status(db, family.id)
        if row["total_outstanding"] <= 0:
            continue
        if min_amount and row["total_outstanding"] < min_amount:
            continue
        if min_months and row["pending_months"] < min_months:
            continue
        if payment_status and row["payment_status"] != payment_status:
            continue
        if category_slug:
            if category_slug == "masavari" and row["masavari_outstanding"] <= 0:
                continue
            if category_slug == "drf" and row["drf_outstanding"] <= 0:
                continue
            if category_slug == "festival" and row["festival_outstanding"] <= 0:
                continue
            if category_slug in ("festival-1", "festival-2", "festival-3"):
                cat = get_category_by_slug(db, category_slug)
                if not cat or compute_category_outstanding(db, family.id, cat.id) <= 0:
                    continue
        results.append(row)

    summary = {
        "total_masavari": round(sum(r["masavari_outstanding"] for r in results), 2),
        "total_festival": round(sum(r["festival_outstanding"] for r in results), 2),
        "total_drf": round(sum(r["drf_outstanding"] for r in results), 2),
        "total_outstanding": round(sum(r["total_outstanding"] for r in results), 2),
        "family_count": len(results),
    }

    sort_key_map = {
        "highest_due": lambda r: r["total_outstanding"],
        "highest_masavari": lambda r: r["masavari_outstanding"],
        "highest_festival": lambda r: r["festival_outstanding"],
        "highest_drf": lambda r: r["drf_outstanding"],
        "oldest_due": lambda r: r["pending_months"],
        "family_number": lambda r: r["family_number"],
        "family_name": lambda r: r["family_name"],
    }
    key_fn = sort_key_map.get(sort_by, sort_key_map["highest_due"])
    reverse = sort_by not in ("family_number", "family_name")
    results.sort(key=key_fn, reverse=reverse)

    total = len(results)
    return results[skip : skip + limit], total, summary


def get_family_detail(db: Session, family_id: str) -> dict:
    family = db.query(Family).filter(Family.id == family_id, Family.is_deleted.is_(False)).first()
    if not family:
        return {}

    ensure_monthly_dues_for_family(db, family)
    outstanding = compute_family_outstanding(db, family, ensure_monthly=False)
    today = date.today()

    masavari = get_category_by_slug(db, "masavari")
    monthly_status = []
    if masavari:
        dues = (
            db.query(FamilyDue)
            .filter(
                FamilyDue.family_id == family_id,
                FamilyDue.category_id == masavari.id,
                FamilyDue.billing_month > 0,
                FamilyDue.billing_month <= 12,
                FamilyDue.is_deleted.is_(False),
            )
            .order_by(FamilyDue.billing_year.desc(), FamilyDue.billing_month.desc())
            .limit(12)
            .all()
        )
        for due in reversed(dues):
            monthly_status.append({
                "month": due.billing_month,
                "year": due.billing_year,
                "label": f"{date(due.billing_year, due.billing_month, 1).strftime('%b %Y')}",
                "amount_due": due.amount_due,
                "amount_paid": due.amount_paid,
                "status": due.status,
            })

    drf = get_category_by_slug(db, "drf")
    drf_annual_status = []
    if drf:
        drf_dues = (
            db.query(FamilyDue)
            .filter(
                FamilyDue.family_id == family_id,
                FamilyDue.category_id == drf.id,
                FamilyDue.billing_month == 0,
                FamilyDue.festival_charge_event_id.is_(None),
                FamilyDue.is_deleted.is_(False),
            )
            .order_by(FamilyDue.billing_year.asc())
            .all()
        )
        for due in drf_dues:
            balance = due_balance(due, today)
            drf_annual_status.append({
                "year": due.billing_year,
                "label": str(due.billing_year),
                "amount_due": due.amount_due,
                "amount_paid": due.amount_paid,
                "balance": balance,
                "status": due.status,
            })

    timeline = (
        db.query(FamilyDue)
        .join(ContributionCategory)
        .filter(FamilyDue.family_id == family_id, FamilyDue.is_deleted.is_(False))
        .order_by(FamilyDue.billing_year.asc(), FamilyDue.billing_month.asc())
        .all()
    )
    outstanding_timeline = []
    for due in timeline:
        balance = due_balance(due, today)
        if balance <= 0:
            continue
        cat = db.query(ContributionCategory).filter(ContributionCategory.id == due.category_id).first()
        label = cat.name if cat else ""
        if due.festival_charge_event_id:
            fest = db.query(FestivalChargeEvent).filter(FestivalChargeEvent.id == due.festival_charge_event_id).first()
            if fest:
                label = f"{fest.name} ({cat.name if cat else 'Festival'})"
        elif cat and cat.slug == "drf" and due.billing_month == 0:
            label = f"DRF {due.billing_year}"
        outstanding_timeline.append({
            "category": label,
            "billing_month": due.billing_month,
            "billing_year": due.billing_year,
            "amount_due": due.amount_due,
            "amount_paid": due.amount_paid,
            "balance": balance,
            "status": due.status,
        })

    payments = (
        db.query(Payment)
        .filter(Payment.family_id == family_id, Payment.is_deleted.is_(False))
        .order_by(Payment.payment_date.desc())
        .limit(20)
        .all()
    )

    return {
        "family": {
            "id": family.id,
            "family_number": family.family_number,
            "head_of_family": family.head_of_family,
            "house_name": family.house_name,
            "address": family.address,
            "ward": family.ward,
            "phone": family.phone,
            "email": family.email,
            "members_count": family.members_count,
            "joining_date": family.joining_date.isoformat() if family.joining_date else None,
            "status": family.status,
            "remarks": family.remarks,
        },
        "outstanding": outstanding,
        "monthly_status": monthly_status,
        "drf_annual_status": drf_annual_status,
        "outstanding_timeline": outstanding_timeline,
        "recent_payments": [
            {
                "id": p.id,
                "receipt_number": p.receipt_number,
                "amount": p.amount,
                "payment_date": p.payment_date.isoformat(),
                "payment_mode": p.payment_mode,
            }
            for p in payments
        ],
    }


def apply_rate_to_pending_monthly_dues(
    db: Session,
    category: ContributionCategory,
    new_amount: float,
    effective: date,
    rate_id: Optional[str],
) -> None:
    """Raise fully-unpaid monthly dues from the effective month onward to the new rate.

    Paid and partially-paid months are never changed — only pending dues with zero payments.
    """
    if not category.is_monthly:
        return
    dues = (
        db.query(FamilyDue)
        .filter(
            FamilyDue.category_id == category.id,
            FamilyDue.is_deleted.is_(False),
            FamilyDue.billing_month > 0,
            FamilyDue.status == "pending",
            FamilyDue.amount_paid == 0,
        )
        .all()
    )
    for due in dues:
        if (due.billing_year, due.billing_month) >= (effective.year, effective.month):
            due.amount_due = new_amount
            due.contribution_rate_id = rate_id


def sync_settings_rates(db: Session, settings: ContributionSetting) -> None:
    """Create new rate rows when settings change; close prior open-ended rates."""
    effective = settings.amount_effective_from or date.today()
    for slug, field in SLUG_SETTING_MAP.items():
        category = get_category_by_slug(db, slug)
        if not category:
            continue
        amount = float(getattr(settings, field, 0) or 0)

        # Drop future rate rows superseded by this effective date (e.g. test resets / backdated changes).
        db.query(ContributionRate).filter(
            ContributionRate.category_id == category.id,
            ContributionRate.effective_from > effective,
        ).delete(synchronize_session=False)

        open_rates = (
            db.query(ContributionRate)
            .filter(
                ContributionRate.category_id == category.id,
                ContributionRate.effective_from < effective,
                or_(ContributionRate.effective_to.is_(None), ContributionRate.effective_to >= effective),
            )
            .all()
        )
        for old in open_rates:
            old.effective_to = effective - timedelta(days=1)

        same_day = (
            db.query(ContributionRate)
            .filter(
                ContributionRate.category_id == category.id,
                ContributionRate.effective_from == effective,
            )
            .first()
        )
        if same_day:
            same_day.amount = amount
            same_day.effective_to = None
            rate_id = same_day.id
        else:
            new_rate = ContributionRate(category_id=category.id, amount=amount, effective_from=effective)
            db.add(new_rate)
            db.flush()
            rate_id = new_rate.id

        apply_rate_to_pending_monthly_dues(db, category, amount, effective, rate_id)
    db.commit()


def ensure_family_all_dues(db: Session, family: Family) -> None:
    """Generate monthly Masavari dues and annual DRF. Festival charges are admin-triggered."""
    ensure_monthly_dues_for_family(db, family)
    ensure_annual_drf_for_family(db, family)


# ── Family display names ───────────────────────────────────────────────────

FAMILY_LABEL_RE = re.compile(r"^Family\s+(\d+)$", re.IGNORECASE)
GENERIC_HEAD_RE = re.compile(
    r"^(FAM-|SIM-|TEST|SCENARIO|AUTO|RECURRING|FIFO)",
    re.IGNORECASE,
)


def free_deleted_family_numbers(db: Session) -> None:
    """Rename soft-deleted families so their numbers can be reused."""
    deleted = db.query(Family).filter(Family.is_deleted.is_(True)).all()
    for family in deleted:
        if "__deleted__" in (family.family_number or ""):
            continue
        family.family_number = f"{family.family_number}__deleted__{family.id[:8]}"
    db.commit()


def next_family_label(db: Session) -> str:
    """Return the next simple label: Family 1, Family 2, …"""
    max_n = 0
    for family in db.query(Family).filter(Family.is_deleted.is_(False)).all():
        match = FAMILY_LABEL_RE.match((family.family_number or "").strip())
        if match:
            max_n = max(max_n, int(match.group(1)))
    return f"Family {max_n + 1}"


def _is_generic_head(head: str, old_number: str = "") -> bool:
    head = (head or "").strip()
    if not head:
        return True
    if old_number and head == old_number:
        return True
    return bool(GENERIC_HEAD_RE.match(head))


def normalize_family_labels(db: Session) -> None:
    """Rename cryptic family codes (FAM-*, SIM-*, etc.) to Family 1, Family 2, …"""
    families = (
        db.query(Family)
        .filter(Family.is_deleted.is_(False))
        .order_by(Family.created_at.asc())
        .all()
    )
    if not families:
        return
    needs_rename = any(not FAMILY_LABEL_RE.match((f.family_number or "").strip()) for f in families)
    if not needs_rename:
        return

    for index, family in enumerate(families, start=1):
        label = f"Family {index}"
        old_number = family.family_number
        family.family_number = label
        if _is_generic_head(family.head_of_family, old_number):
            family.head_of_family = label
    db.commit()
