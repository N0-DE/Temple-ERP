"""Admin-triggered festival charge events — create, apply, and report."""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models.family_contribution import (
    ContributionCategory,
    Family,
    FamilyDue,
    FestivalChargeEvent,
    LedgerEntry,
)
from services import billing_service as billing


def _parse_family_ids(raw: str) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return [str(x) for x in data] if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _serialize_family_ids(ids: list[str]) -> str:
    return json.dumps(ids)


def get_applicable_families(db: Session, event: FestivalChargeEvent) -> list[Family]:
    query = db.query(Family).filter(Family.is_deleted.is_(False), Family.status == "Active")
    if not event.apply_to_all:
        family_ids = _parse_family_ids(event.selected_family_ids)
        if not family_ids:
            return []
        query = query.filter(Family.id.in_(family_ids))
    return query.order_by(Family.family_number.asc()).all()


def preview_apply(db: Session, event: FestivalChargeEvent) -> dict:
    families = get_applicable_families(db, event)
    already = (
        db.query(FamilyDue.family_id)
        .filter(FamilyDue.festival_charge_event_id == event.id, FamilyDue.is_deleted.is_(False))
        .count()
    )
    return {
        "applicable_families": len(families),
        "amount_per_family": event.amount,
        "total_charge": round(len(families) * event.amount, 2),
        "already_charged_families": already,
    }


def create_festival_charge_event(
    db: Session,
    *,
    name: str,
    category_id: str,
    amount: float,
    charge_date: date,
    description: str = "",
    apply_to_all: bool = True,
    family_ids: Optional[list[str]] = None,
) -> FestivalChargeEvent:
    if amount <= 0:
        raise ValueError("Festival charge amount must be greater than zero")
    category = (
        db.query(ContributionCategory)
        .filter(
            ContributionCategory.id == category_id,
            ContributionCategory.is_deleted.is_(False),
            ContributionCategory.category_type == "festival",
        )
        .first()
    )
    if not category:
        raise ValueError("Invalid festival charge category")

    event = FestivalChargeEvent(
        name=name.strip(),
        category_id=category_id,
        amount=amount,
        charge_date=charge_date,
        description=description or "",
        status="draft",
        apply_to_all=apply_to_all,
        selected_family_ids=_serialize_family_ids(family_ids or []),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def _festival_billing_month(event: FestivalChargeEvent) -> int:
    """Unique negative slot per event — avoids collisions between events on the same date."""
    return -(abs(hash(event.id)) % 999_999) - 1


def record_festival_charge_ledger(
    db: Session,
    due: FamilyDue,
    category: ContributionCategory,
    event: FestivalChargeEvent,
) -> None:
    db.add(
        LedgerEntry(
            family_id=due.family_id,
            category_id=due.category_id,
            entry_date=event.charge_date,
            description=f"Festival charge — {event.name} ({category.name})",
            debit=due.amount_due,
            credit=0.0,
            balance=0.0,
            entry_type="due",
            remarks=event.description or "",
        )
    )


def apply_festival_charge_event(db: Session, event_id: str) -> dict:
    """Apply a festival charge to all applicable families. Idempotent — safe to call twice."""
    event = (
        db.query(FestivalChargeEvent)
        .filter(FestivalChargeEvent.id == event_id, FestivalChargeEvent.is_deleted.is_(False))
        .first()
    )
    if not event:
        raise ValueError("Festival charge not found")
    if event.status == "cancelled":
        raise ValueError("This festival charge has been cancelled")
    if event.amount <= 0:
        raise ValueError("Festival charge amount must be greater than zero")

    category = db.query(ContributionCategory).filter(ContributionCategory.id == event.category_id).first()
    if not category:
        raise ValueError("Festival category not found")

    if event.status == "applied":
        existing = (
            db.query(FamilyDue)
            .filter(FamilyDue.festival_charge_event_id == event.id, FamilyDue.is_deleted.is_(False))
            .count()
        )
        return _event_apply_stats(db, event, newly_charged=0, skipped_duplicates=existing, already_applied=True)

    families = get_applicable_families(db, event)
    if not families:
        raise ValueError("No applicable families found for this festival charge")

    newly_charged = 0
    skipped_duplicates = 0

    try:
        for family in families:
            exists = (
                db.query(FamilyDue)
                .filter(
                    FamilyDue.family_id == family.id,
                    FamilyDue.festival_charge_event_id == event.id,
                    FamilyDue.is_deleted.is_(False),
                )
                .first()
            )
            if exists:
                skipped_duplicates += 1
                continue

            due = FamilyDue(
                family_id=family.id,
                category_id=event.category_id,
                festival_charge_event_id=event.id,
                billing_month=_festival_billing_month(event),
                billing_year=event.charge_date.year,
                amount_due=event.amount,
                amount_paid=0.0,
                status="pending",
            )
            db.add(due)
            db.flush()
            record_festival_charge_ledger(db, due, category, event)
            billing.rebuild_ledger_balances(db, family.id, event.category_id, commit=False)
            newly_charged += 1

        total_families = (
            db.query(FamilyDue)
            .filter(FamilyDue.festival_charge_event_id == event.id, FamilyDue.is_deleted.is_(False))
            .count()
        )
        event.status = "applied"
        event.families_charged = total_families
        event.total_amount_generated = round(total_families * event.amount, 2)
        event.applied_at = datetime.utcnow()
        db.commit()
    except IntegrityError:
        db.rollback()
        # Idempotent retry — return current stats if already applied
        db.refresh(event)
        if event.status == "applied":
            return _event_apply_stats(db, event, newly_charged=0, skipped_duplicates=event.families_charged, already_applied=True)
        raise ValueError("Duplicate festival charge detected — operation rolled back")

    return _event_apply_stats(db, event, newly_charged=newly_charged, skipped_duplicates=skipped_duplicates, already_applied=False)


def _event_apply_stats(
    db: Session,
    event: FestivalChargeEvent,
    *,
    newly_charged: int,
    skipped_duplicates: int,
    already_applied: bool,
) -> dict:
    dues = (
        db.query(FamilyDue)
        .filter(FamilyDue.festival_charge_event_id == event.id, FamilyDue.is_deleted.is_(False))
        .all()
    )
    total_collected = round(sum(d.amount_paid for d in dues), 2)
    total_outstanding = round(sum(max(0.0, d.amount_due - d.amount_paid) for d in dues), 2)
    category = db.query(ContributionCategory).filter(ContributionCategory.id == event.category_id).first()
    return {
        "event_id": event.id,
        "families_charged": event.families_charged,
        "newly_charged": newly_charged,
        "skipped_duplicates": skipped_duplicates,
        "total_amount_generated": event.total_amount_generated,
        "total_collected": total_collected,
        "total_outstanding": total_outstanding,
        "already_applied": already_applied,
        "status": event.status,
        "category_name": category.name if category else "",
    }


def get_festival_charge_detail(db: Session, event_id: str) -> dict:
    event = (
        db.query(FestivalChargeEvent)
        .filter(FestivalChargeEvent.id == event_id, FestivalChargeEvent.is_deleted.is_(False))
        .first()
    )
    if not event:
        return {}

    category = db.query(ContributionCategory).filter(ContributionCategory.id == event.category_id).first()
    dues = (
        db.query(FamilyDue, Family)
        .join(Family, Family.id == FamilyDue.family_id)
        .filter(FamilyDue.festival_charge_event_id == event.id, FamilyDue.is_deleted.is_(False))
        .order_by(Family.family_number.asc())
        .all()
    )

    families = []
    total_collected = 0.0
    total_outstanding = 0.0
    for due, family in dues:
        remaining = max(0.0, due.amount_due - due.amount_paid)
        total_collected += due.amount_paid
        total_outstanding += remaining
        families.append({
            "family_id": family.id,
            "family_number": family.family_number,
            "family_name": family.head_of_family,
            "amount_due": due.amount_due,
            "amount_paid": due.amount_paid,
            "remaining": round(remaining, 2),
            "status": due.status,
        })

    return {
        "id": event.id,
        "name": event.name,
        "category_id": event.category_id,
        "category_name": category.name if category else "",
        "category_slug": category.slug if category else "",
        "amount": event.amount,
        "charge_date": event.charge_date.isoformat(),
        "description": event.description,
        "status": event.status,
        "apply_to_all": event.apply_to_all,
        "families_charged": event.families_charged,
        "total_amount_generated": event.total_amount_generated,
        "total_collected": round(total_collected, 2),
        "total_outstanding": round(total_outstanding, 2),
        "applied_at": event.applied_at.isoformat() if event.applied_at else None,
        "created_at": event.created_at.isoformat() if event.created_at else None,
        "families": families,
    }


def list_festival_charges(db: Session, skip: int = 0, limit: int = 50) -> tuple[list[dict], int]:
    query = db.query(FestivalChargeEvent).filter(FestivalChargeEvent.is_deleted.is_(False))
    total = query.count()
    events = query.order_by(FestivalChargeEvent.charge_date.desc(), FestivalChargeEvent.created_at.desc()).offset(skip).limit(limit).all()

    rows = []
    for event in events:
        category = db.query(ContributionCategory).filter(ContributionCategory.id == event.category_id).first()
        dues = (
            db.query(FamilyDue)
            .filter(FamilyDue.festival_charge_event_id == event.id, FamilyDue.is_deleted.is_(False))
            .all()
        )
        total_collected = round(sum(d.amount_paid for d in dues), 2)
        total_outstanding = round(sum(max(0.0, d.amount_due - d.amount_paid) for d in dues), 2)
        rows.append({
            "id": event.id,
            "name": event.name,
            "category_id": event.category_id,
            "category_name": category.name if category else "",
            "amount": event.amount,
            "charge_date": event.charge_date.isoformat(),
            "description": event.description,
            "status": event.status,
            "families_charged": event.families_charged,
            "total_amount_generated": event.total_amount_generated,
            "total_collected": total_collected,
            "total_outstanding": total_outstanding,
            "applied_at": event.applied_at.isoformat() if event.applied_at else None,
        })
    return rows, total
