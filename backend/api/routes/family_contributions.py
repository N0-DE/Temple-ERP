from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from api.deps import get_db
from models.family_contribution import (
    ContributionCategory,
    ContributionSetting,
    Family,
    FamilyDue,
    LedgerEntry,
    Payment,
)
from schemas.family_contribution import (
    CollectionReportRow,
    ContributionCategoryCreate,
    ContributionCategoryOut,
    ContributionCategoryUpdate,
    ContributionSettingOut,
    ContributionSettingUpdate,
    FamilyCreate,
    FamilyDetailOut,
    FamilyListResponse,
    FamilyOut,
    FamilyUpdate,
    FestivalChargeApplyResult,
    FestivalChargeCreate,
    FestivalChargeListResponse,
    FestivalChargeOut,
    FestivalChargePreview,
    LedgerEntryOut,
    OutstandingListResponse,
    OutstandingFamilyOut,
    OutstandingSummary,
    PaymentCreate,
    PaymentListResponse,
    PaymentOut,
    PaymentStatusRow,
    PaymentUpdate,
    WardCollectionRow,
    CategoryOutstandingOut,
)
from services import billing_service as billing
from services import festival_charge_service as festival

router = APIRouter()


def _ledger_to_out(entry: LedgerEntry, db: Session) -> LedgerEntryOut:
    family = db.query(Family).filter(Family.id == entry.family_id).first()
    category = db.query(ContributionCategory).filter(ContributionCategory.id == entry.category_id).first()
    return LedgerEntryOut(
        id=entry.id,
        family_id=entry.family_id,
        payment_id=entry.payment_id,
        category_id=entry.category_id,
        entry_date=entry.entry_date,
        description=entry.description,
        debit=entry.debit,
        credit=entry.credit,
        balance=entry.balance,
        remarks=entry.remarks,
        entry_type=entry.entry_type,
        payment_mode=entry.payment_mode or "",
        collected_by=entry.collected_by or "",
        receipt_number=entry.receipt_number or "",
        family_name=family.head_of_family if family else None,
        category_name=category.name if category else None,
    )


# ── Categories ──────────────────────────────────────────────────────────────

@router.get("/categories", response_model=List[ContributionCategoryOut])
def read_categories(db: Session = Depends(get_db)):
    billing.ensure_default_categories(db)
    return db.query(ContributionCategory).filter(ContributionCategory.is_deleted.is_(False)).all()


@router.post("/categories", response_model=ContributionCategoryOut)
def create_category(payload: ContributionCategoryCreate, db: Session = Depends(get_db)):
    existing = (
        db.query(ContributionCategory)
        .filter(or_(ContributionCategory.slug == payload.slug, ContributionCategory.name == payload.name))
        .filter(ContributionCategory.is_deleted.is_(False))
        .first()
    )
    if existing:
        return existing
    category = ContributionCategory(**payload.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.put("/categories/{category_id}", response_model=ContributionCategoryOut)
def update_category(category_id: str, payload: ContributionCategoryUpdate, db: Session = Depends(get_db)):
    category = db.query(ContributionCategory).filter(ContributionCategory.id == category_id, ContributionCategory.is_deleted.is_(False)).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}")
def delete_category(category_id: str, db: Session = Depends(get_db)):
    category = db.query(ContributionCategory).filter(ContributionCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    category.is_deleted = True
    db.commit()
    return {"message": "Category deleted"}


# ── Settings ────────────────────────────────────────────────────────────────

@router.get("/contribution-settings", response_model=ContributionSettingOut)
@router.get("/settings", response_model=ContributionSettingOut)
def read_settings(db: Session = Depends(get_db)):
    billing.ensure_default_categories(db)
    return billing.get_settings(db)


@router.put("/contribution-settings", response_model=ContributionSettingOut)
@router.put("/settings", response_model=ContributionSettingOut)
def update_settings(payload: ContributionSettingUpdate, db: Session = Depends(get_db)):
    settings = billing.get_settings(db)
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(settings, field, value)
    if not settings.amount_effective_from:
        settings.amount_effective_from = date.today()
    db.commit()
    db.refresh(settings)
    billing.sync_settings_rates(db, settings)
    return settings


# ── Families ────────────────────────────────────────────────────────────────

@router.get("/families/next-number")
def read_next_family_number(db: Session = Depends(get_db)):
    label = billing.next_family_label(db)
    return {"family_number": label, "head_of_family": label}


@router.get("/families", response_model=FamilyListResponse)
def read_families(
    search: Optional[str] = None,
    status: Optional[str] = None,
    ward: Optional[str] = None,
    include_deleted: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(Family)
    if not include_deleted:
        query = query.filter(Family.is_deleted.is_(False))
    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                Family.head_of_family.ilike(term),
                Family.family_number.ilike(term),
                Family.house_name.ilike(term),
                Family.phone.ilike(term),
            )
        )
    if status and status != "All":
        query = query.filter(Family.status == status)
    if ward:
        query = query.filter(Family.ward == ward)

    total = query.count()
    all_items = query.all()
    all_items.sort(
        key=lambda f: (
            int(m.group(1))
            if (m := billing.FAMILY_LABEL_RE.match((f.family_number or "").strip()))
            else 9999
        )
    )
    items = all_items[(page - 1) * page_size : page * page_size]
    return FamilyListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/families/{family_id}", response_model=FamilyOut)
def read_family(family_id: str, db: Session = Depends(get_db)):
    family = db.query(Family).filter(Family.id == family_id, Family.is_deleted.is_(False)).first()
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    if family.status == "Active":
        billing.ensure_monthly_dues_for_family(db, family)
    return family


@router.post("/families", response_model=FamilyOut)
def create_family(payload: FamilyCreate, db: Session = Depends(get_db)):
    existing = db.query(Family).filter(Family.family_number == payload.family_number, Family.is_deleted.is_(False)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Family number already exists")

    data = payload.model_dump()
    if not data.get("joining_date"):
        data["joining_date"] = date.today()
    if not (data.get("head_of_family") or "").strip():
        data["head_of_family"] = data["family_number"]

    # Reuse a soft-deleted row for the same slot if present (avoids unique constraint errors).
    recycled = (
        db.query(Family)
        .filter(Family.family_number == payload.family_number, Family.is_deleted.is_(True))
        .first()
    )
    if not recycled:
        recycled = (
            db.query(Family)
            .filter(Family.family_number.like(f"{payload.family_number}__deleted__%"), Family.is_deleted.is_(True))
            .first()
        )

    if recycled:
        for field, value in data.items():
            setattr(recycled, field, value)
        recycled.is_deleted = False
        recycled.family_number = payload.family_number
        db.commit()
        db.refresh(recycled)
        billing.ensure_family_all_dues(db, recycled)
        return recycled

    family = Family(**data)
    db.add(family)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Family number already exists") from exc
    db.refresh(family)
    billing.ensure_family_all_dues(db, family)
    return family


@router.put("/families/{family_id}", response_model=FamilyOut)
def update_family(family_id: str, payload: FamilyUpdate, db: Session = Depends(get_db)):
    family = db.query(Family).filter(Family.id == family_id, Family.is_deleted.is_(False)).first()
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    if payload.family_number and payload.family_number != family.family_number:
        dup = db.query(Family).filter(Family.family_number == payload.family_number, Family.is_deleted.is_(False), Family.id != family_id).first()
        if dup:
            raise HTTPException(status_code=400, detail="Family number already exists")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(family, field, value)
    db.commit()
    db.refresh(family)
    if family.status == "Active":
        billing.ensure_monthly_dues_for_family(db, family)
    return family


@router.delete("/families/{family_id}")
def delete_family(family_id: str, db: Session = Depends(get_db)):
    family = db.query(Family).filter(Family.id == family_id, Family.is_deleted.is_(False)).first()
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    family.is_deleted = True
    family.family_number = f"{family.family_number}__deleted__{family.id[:8]}"
    db.commit()
    return {"message": "Family deleted successfully"}


@router.post("/families/{family_id}/restore", response_model=FamilyOut)
def restore_family(family_id: str, db: Session = Depends(get_db)):
    family = db.query(Family).filter(Family.id == family_id, Family.is_deleted.is_(True)).first()
    if not family:
        raise HTTPException(status_code=404, detail="Deleted family not found")
    family.is_deleted = False
    db.commit()
    db.refresh(family)
    billing.ensure_monthly_dues_for_family(db, family)
    return family


# ── Payments ──────────────────────────────────────────────────────────────

@router.get("/payments", response_model=PaymentListResponse)
def read_payments(
    search: Optional[str] = None,
    family_id: Optional[str] = None,
    category_id: Optional[str] = None,
    skip: int = 0,
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(Payment).filter(Payment.is_deleted.is_(False))
    if family_id:
        query = query.filter(Payment.family_id == family_id)
    if category_id:
        query = query.filter(Payment.category_id == category_id)
    if search:
        term = f"%{search}%"
        query = query.join(Family).filter(
            or_(Family.head_of_family.ilike(term), Payment.receipt_number.ilike(term))
        )
    total = query.count()
    items = query.order_by(Payment.payment_date.desc()).offset(skip).limit(limit).all()
    return PaymentListResponse(items=items, total=total)


@router.get("/payments/{payment_id}", response_model=PaymentOut)
def read_payment(payment_id: str, db: Session = Depends(get_db)):
    payment = db.query(Payment).filter(Payment.id == payment_id, Payment.is_deleted.is_(False)).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    return payment


@router.post("/payments", response_model=PaymentOut)
def create_payment(payload: PaymentCreate, db: Session = Depends(get_db)):
    if payload.amount < 0:
        raise HTTPException(status_code=400, detail="Payment amount cannot be negative")

    family = db.query(Family).filter(Family.id == payload.family_id, Family.is_deleted.is_(False)).first()
    category = db.query(ContributionCategory).filter(
        ContributionCategory.id == payload.category_id,
        ContributionCategory.is_deleted.is_(False),
        ContributionCategory.is_active.is_(True),
    ).first()
    if not family or not category:
        raise HTTPException(status_code=404, detail="Family or category not found")
    if family.status != "Active":
        raise HTTPException(status_code=400, detail="Cannot record payment for inactive family")

    settings = billing.get_settings(db)
    amount = payload.amount
    if category.slug in ("masavari", "drf") and amount <= 0:
        amount = billing.get_rate_for_date(db, category, payload.payment_date)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")

    if category.slug == "drf" and not settings.drf_is_monthly:
        billing.ensure_festival_due(db, family, category, payload.payment_date.year)

    if category.is_monthly:
        billing.ensure_monthly_dues_for_family(db, family, up_to=payload.payment_date)

    category_outstanding = billing.compute_category_outstanding(db, family.id, category.id)
    if amount > category_outstanding:
        raise HTTPException(
            status_code=400,
            detail=f"Payment cannot exceed the selected category's outstanding amount of {billing.format_inr(category_outstanding)}",
        )

    receipt_number = billing.generate_receipt_number(db, settings)
    payment = Payment(
        receipt_number=receipt_number,
        family_id=payload.family_id,
        category_id=payload.category_id,
        amount=amount,
        payment_date=payload.payment_date,
        month=payload.payment_date.month,
        year=payload.payment_date.year,
        payment_mode=payload.payment_mode,
        reference_number=payload.reference_number,
        remarks=payload.remarks,
        collected_by=payload.collected_by,
    )
    db.add(payment)
    db.flush()

    try:
        billing.apply_payment_fifo(db, payment, category, amount, settings.partial_payment_allowed)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.refresh(payment)
    return payment


@router.put("/payments/{payment_id}", response_model=PaymentOut)
def update_payment(payment_id: str, payload: PaymentUpdate, db: Session = Depends(get_db)):
    payment = db.query(Payment).filter(Payment.id == payment_id, Payment.is_deleted.is_(False)).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    allowed = {"payment_mode", "reference_number", "remarks", "collected_by"}
    update_data = payload.model_dump(exclude_unset=True)
    blocked = set(update_data.keys()) - allowed
    if blocked:
        raise HTTPException(
            status_code=400,
            detail="Only payment mode, reference, remarks, and collected-by can be updated. Delete and re-record to change amount.",
        )
    for field, value in update_data.items():
        setattr(payment, field, value)
    db.commit()
    db.refresh(payment)
    return payment


@router.delete("/payments/{payment_id}")
def delete_payment(payment_id: str, db: Session = Depends(get_db)):
    payment = db.query(Payment).filter(Payment.id == payment_id, Payment.is_deleted.is_(False)).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    billing.reverse_payment(db, payment)
    payment.is_deleted = True
    db.commit()
    return {"message": "Payment deleted and dues restored"}


# ── Outstanding ───────────────────────────────────────────────────────────

@router.get("/outstanding", response_model=OutstandingListResponse)
def read_outstanding(
    search: Optional[str] = None,
    ward: Optional[str] = None,
    min_amount: Optional[float] = None,
    min_months: Optional[int] = None,
    category: Optional[str] = None,
    payment_status: Optional[str] = Query(None, pattern="^(paid|unpaid|partial)$"),
    sort_by: str = Query(
        "highest_due",
        pattern="^(highest_due|highest_masavari|highest_festival|highest_drf|oldest_due|family_number|family_name)$",
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    items, total, summary = billing.list_outstanding_families(
        db,
        search=search,
        ward=ward,
        min_amount=min_amount,
        min_months=min_months,
        category_slug=category,
        payment_status=payment_status,
        sort_by=sort_by,
        skip=(page - 1) * page_size,
        limit=page_size,
    )
    return OutstandingListResponse(items=items, total=total, summary=OutstandingSummary(**summary))


@router.get("/outstanding/{family_id}")
def read_family_outstanding_detail(family_id: str, db: Session = Depends(get_db)):
    detail = billing.get_family_detail(db, family_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Family not found")
    return detail


@router.get("/families/{family_id}/outstanding/{category_id}", response_model=CategoryOutstandingOut)
def read_category_outstanding(family_id: str, category_id: str, db: Session = Depends(get_db)):
    family = db.query(Family).filter(Family.id == family_id, Family.is_deleted.is_(False)).first()
    category = db.query(ContributionCategory).filter(
        ContributionCategory.id == category_id,
        ContributionCategory.is_deleted.is_(False),
    ).first()
    if not family or not category:
        raise HTTPException(status_code=404, detail="Family or category not found")

    if family.status == "Active":
        billing.ensure_monthly_dues_for_family(db, family)
        settings = billing.get_settings(db)
        if category.slug == "drf" and not settings.drf_is_monthly:
            billing.ensure_festival_due(db, family, category, date.today().year)

    outstanding = billing.compute_category_outstanding(db, family_id, category_id)
    return CategoryOutstandingOut(
        family_id=family.id,
        family_name=family.head_of_family,
        category_id=category.id,
        category_name=category.name,
        category_slug=category.slug,
        outstanding=outstanding,
    )


# ── Ledgers ───────────────────────────────────────────────────────────────

@router.get("/ledger/family/{family_id}", response_model=List[LedgerEntryOut])
def read_family_ledger(
    family_id: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(LedgerEntry).filter(LedgerEntry.family_id == family_id)
    if start_date:
        query = query.filter(LedgerEntry.entry_date >= start_date)
    if end_date:
        query = query.filter(LedgerEntry.entry_date <= end_date)
    if category_id:
        query = query.filter(LedgerEntry.category_id == category_id)
    billing.rebuild_ledger_balances(db, family_id, category_id)
    entries = query.order_by(LedgerEntry.entry_date.asc(), LedgerEntry.created_at.asc()).all()
    return [_ledger_to_out(e, db) for e in entries]


@router.get("/ledger/category/{category_id}", response_model=List[LedgerEntryOut])
def read_category_ledger(category_id: str, db: Session = Depends(get_db)):
    entries = db.query(LedgerEntry).filter(LedgerEntry.category_id == category_id).order_by(LedgerEntry.entry_date.asc()).all()
    return [_ledger_to_out(e, db) for e in entries]


@router.get("/ledger/master", response_model=List[LedgerEntryOut])
@router.get("/ledger/full", response_model=List[LedgerEntryOut])
def read_master_ledger(
    family_id: Optional[str] = None,
    ward: Optional[str] = None,
    category_id: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    query = db.query(LedgerEntry)
    if family_id:
        query = query.filter(LedgerEntry.family_id == family_id)
    if category_id:
        query = query.filter(LedgerEntry.category_id == category_id)
    if month:
        query = query.filter(func.extract("month", LedgerEntry.entry_date) == month)
    if year:
        query = query.filter(func.extract("year", LedgerEntry.entry_date) == year)
    if start_date:
        query = query.filter(LedgerEntry.entry_date >= start_date)
    if end_date:
        query = query.filter(LedgerEntry.entry_date <= end_date)
    if ward:
        query = query.join(Family).filter(Family.ward == ward)
    entries = query.order_by(LedgerEntry.entry_date.asc()).all()
    return [_ledger_to_out(e, db) for e in entries]


# ── Reports ───────────────────────────────────────────────────────────────

@router.get("/reports/payment-status", response_model=List[PaymentStatusRow])
def report_payment_status(
    category_id: str,
    month: int,
    year: int,
    db: Session = Depends(get_db),
):
    category = db.query(ContributionCategory).filter(ContributionCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    billing.ensure_all_monthly_dues(db)
    required = billing.get_rate_for_date(db, category, date(year, month, 1))
    families = db.query(Family).filter(Family.is_deleted.is_(False), Family.status == "Active").all()
    rows = []
    for family in families:
        if category.is_monthly:
            due = (
                db.query(FamilyDue)
                .filter(
                    FamilyDue.family_id == family.id,
                    FamilyDue.category_id == category_id,
                    FamilyDue.billing_month == month,
                    FamilyDue.billing_year == year,
                )
                .first()
            )
            paid = due.amount_paid if due else 0.0
            req = due.amount_due if due else required
        else:
            due = (
                db.query(FamilyDue)
                .filter(FamilyDue.family_id == family.id, FamilyDue.category_id == category_id, FamilyDue.billing_year == year)
                .first()
            )
            paid = due.amount_paid if due else 0.0
            req = due.amount_due if due else required

        if paid >= req:
            status = "Paid"
        elif paid > 0:
            status = "Underpaid"
        else:
            status = "Not Paid"
        rows.append(PaymentStatusRow(
            family_id=family.id,
            family_number=family.family_number,
            family_name=family.head_of_family,
            ward=family.ward or "",
            paid_amount=paid,
            required_amount=req,
            balance_due=max(0, req - paid),
            status=status,
        ))
    return rows


@router.get("/reports/monthly-collection")
def report_monthly_collection(month: int, year: int, db: Session = Depends(get_db)):
    payments = (
        db.query(Payment, ContributionCategory)
        .join(ContributionCategory)
        .filter(Payment.is_deleted.is_(False), Payment.month == month, Payment.year == year)
        .all()
    )
    by_cat: dict[str, dict] = {}
    for payment, cat in payments:
        if cat.name not in by_cat:
            by_cat[cat.name] = {"total": 0.0, "count": 0}
        by_cat[cat.name]["total"] += payment.amount
        by_cat[cat.name]["count"] += 1
    return [CollectionReportRow(category=k, total_collected=v["total"], payment_count=v["count"]) for k, v in by_cat.items()]


@router.get("/reports/category-collection")
def report_category_collection(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Payment, ContributionCategory).join(ContributionCategory).filter(Payment.is_deleted.is_(False))
    if start_date:
        query = query.filter(Payment.payment_date >= start_date)
    if end_date:
        query = query.filter(Payment.payment_date <= end_date)
    by_cat: dict[str, dict] = {}
    for payment, cat in query.all():
        if cat.name not in by_cat:
            by_cat[cat.name] = {"total": 0.0, "count": 0}
        by_cat[cat.name]["total"] += payment.amount
        by_cat[cat.name]["count"] += 1
    return [CollectionReportRow(category=k, total_collected=v["total"], payment_count=v["count"]) for k, v in by_cat.items()]


@router.get("/reports/ward-collection")
def report_ward_collection(month: Optional[int] = None, year: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Payment, Family).join(Family).filter(Payment.is_deleted.is_(False))
    if month:
        query = query.filter(Payment.month == month)
    if year:
        query = query.filter(Payment.year == year)
    by_ward: dict[str, dict] = {}
    for payment, family in query.all():
        ward = family.ward or "Unassigned"
        if ward not in by_ward:
            by_ward[ward] = {"total": 0.0, "families": set()}
        by_ward[ward]["total"] += payment.amount
        by_ward[ward]["families"].add(family.id)
    return [WardCollectionRow(ward=k, total_collected=v["total"], family_count=len(v["families"])) for k, v in by_ward.items()]


@router.get("/reports/top-defaulters", response_model=OutstandingListResponse)
def report_top_defaulters(limit: int = Query(20, le=100), db: Session = Depends(get_db)):
    items, total, summary = billing.list_outstanding_families(db, sort_by="highest_due", limit=limit)
    return OutstandingListResponse(items=items, total=total, summary=OutstandingSummary(**summary))


@router.get("/reports/payment-register", response_model=PaymentListResponse)
def report_payment_register(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Payment).filter(Payment.is_deleted.is_(False))
    if start_date:
        query = query.filter(Payment.payment_date >= start_date)
    if end_date:
        query = query.filter(Payment.payment_date <= end_date)
    total = query.count()
    items = query.order_by(Payment.payment_date.desc()).all()
    return PaymentListResponse(items=items, total=total)


@router.get("/reports/outstanding", response_model=OutstandingListResponse)
def report_outstanding(db: Session = Depends(get_db)):
    items, total, summary = billing.list_outstanding_families(db, limit=500)
    return OutstandingListResponse(items=items, total=total, summary=OutstandingSummary(**summary))


# ── Festival Charges ──────────────────────────────────────────────────────

@router.get("/festival-charges", response_model=FestivalChargeListResponse)
def read_festival_charges(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    items, total = festival.list_festival_charges(db, skip=(page - 1) * page_size, limit=page_size)
    return FestivalChargeListResponse(items=items, total=total)


@router.post("/festival-charges", response_model=FestivalChargeOut)
def create_festival_charge(payload: FestivalChargeCreate, db: Session = Depends(get_db)):
    try:
        event = festival.create_festival_charge_event(
            db,
            name=payload.name,
            category_id=payload.category_id,
            amount=payload.amount,
            charge_date=payload.charge_date,
            description=payload.description,
            apply_to_all=payload.apply_to_all,
            family_ids=payload.family_ids if not payload.apply_to_all else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    detail = festival.get_festival_charge_detail(db, event.id)
    return FestivalChargeOut(**detail)


@router.get("/festival-charges/{event_id}", response_model=FestivalChargeOut)
def read_festival_charge(event_id: str, db: Session = Depends(get_db)):
    detail = festival.get_festival_charge_detail(db, event_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Festival charge not found")
    return FestivalChargeOut(**detail)


@router.get("/festival-charges/{event_id}/preview", response_model=FestivalChargePreview)
def preview_festival_charge(event_id: str, db: Session = Depends(get_db)):
    from models.family_contribution import FestivalChargeEvent
    event = db.query(FestivalChargeEvent).filter(FestivalChargeEvent.id == event_id, FestivalChargeEvent.is_deleted.is_(False)).first()
    if not event:
        raise HTTPException(status_code=404, detail="Festival charge not found")
    return FestivalChargePreview(**festival.preview_apply(db, event))


@router.post("/festival-charges/{event_id}/apply", response_model=FestivalChargeApplyResult)
def apply_festival_charge(event_id: str, db: Session = Depends(get_db)):
    try:
        result = festival.apply_festival_charge_event(db, event_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return FestivalChargeApplyResult(**result)
