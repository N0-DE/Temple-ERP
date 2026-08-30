from datetime import date
from typing import Optional, List

from pydantic import BaseModel, Field


# ── Categories ──────────────────────────────────────────────────────────────

class ContributionCategoryBase(BaseModel):
    name: str
    slug: str
    description: str = ""
    category_type: str = "festival"
    default_amount: float = 0.0
    minimum_amount: float = 0.0
    is_fixed: bool = False
    is_monthly: bool = True
    is_active: bool = True


class ContributionCategoryCreate(ContributionCategoryBase):
    pass


class ContributionCategoryUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    category_type: Optional[str] = None
    default_amount: Optional[float] = None
    minimum_amount: Optional[float] = None
    is_fixed: Optional[bool] = None
    is_monthly: Optional[bool] = None
    is_active: Optional[bool] = None


class ContributionCategoryOut(ContributionCategoryBase):
    id: str
    is_deleted: bool

    class Config:
        from_attributes = True


# ── Settings ────────────────────────────────────────────────────────────────

class ContributionSettingBase(BaseModel):
    masavari_amount: float = 0.0
    festival_1_minimum: float = 0.0
    festival_2_minimum: float = 0.0
    festival_3_minimum: float = 0.0
    drf_amount: float = 0.0
    drf_is_monthly: bool = True
    partial_payment_allowed: bool = True
    financial_year: str = "2026-2027"
    receipt_prefix: str = "RCPT"
    amount_effective_from: Optional[date] = None


class ContributionSettingUpdate(ContributionSettingBase):
    pass


class ContributionSettingOut(ContributionSettingBase):
    id: str
    is_deleted: bool

    class Config:
        from_attributes = True


# ── Families ────────────────────────────────────────────────────────────────

class FamilyBase(BaseModel):
    family_number: str
    head_of_family: str
    house_name: str = ""
    address: str = ""
    ward: str = ""
    phone: str = ""
    email: str = ""
    members_count: int = 1
    joining_date: Optional[date] = None
    status: str = "Active"
    remarks: str = ""


class FamilyCreate(FamilyBase):
    pass


class FamilyUpdate(BaseModel):
    family_number: Optional[str] = None
    head_of_family: Optional[str] = None
    house_name: Optional[str] = None
    address: Optional[str] = None
    ward: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    members_count: Optional[int] = None
    joining_date: Optional[date] = None
    status: Optional[str] = None
    remarks: Optional[str] = None


class FamilyOut(FamilyBase):
    id: str
    is_deleted: bool

    class Config:
        from_attributes = True


class FamilyListResponse(BaseModel):
    items: List[FamilyOut]
    total: int
    page: int
    page_size: int


# ── Payments ──────────────────────────────────────────────────────────────

class PaymentBase(BaseModel):
    family_id: str
    category_id: str
    amount: float
    payment_date: date
    payment_mode: str = "Cash"
    reference_number: str = ""
    remarks: str = ""
    collected_by: str = ""


class PaymentCreate(PaymentBase):
    pass


class PaymentUpdate(BaseModel):
    family_id: Optional[str] = None
    category_id: Optional[str] = None
    amount: Optional[float] = None
    payment_date: Optional[date] = None
    payment_mode: Optional[str] = None
    reference_number: Optional[str] = None
    remarks: Optional[str] = None
    collected_by: Optional[str] = None


class PaymentOut(PaymentBase):
    id: str
    receipt_number: str
    month: int
    year: int
    is_deleted: bool

    class Config:
        from_attributes = True


class PaymentListResponse(BaseModel):
    items: List[PaymentOut]
    total: int


# ── Outstanding ───────────────────────────────────────────────────────────

class OutstandingFamilyOut(BaseModel):
    family_id: str
    family_number: str
    family_name: str
    house_name: str
    ward: str
    pending_months: int
    masavari_outstanding: float
    festival_outstanding: float
    drf_outstanding: float
    total_outstanding: float
    payment_status: str = "unpaid"
    last_payment_date: Optional[str] = None


class OutstandingSummary(BaseModel):
    total_masavari: float = 0.0
    total_festival: float = 0.0
    total_drf: float = 0.0
    total_outstanding: float = 0.0
    family_count: int = 0


class OutstandingListResponse(BaseModel):
    items: List[OutstandingFamilyOut]
    total: int
    summary: OutstandingSummary


class MonthlyStatusItem(BaseModel):
    month: int
    year: int
    label: str
    amount_due: float
    amount_paid: float
    status: str


class OutstandingTimelineItem(BaseModel):
    category: str
    billing_month: int
    billing_year: int
    amount_due: float
    amount_paid: float
    balance: float
    status: str


class FamilyDetailOut(BaseModel):
    family: FamilyOut
    outstanding: OutstandingFamilyOut
    monthly_status: List[MonthlyStatusItem]
    outstanding_timeline: List[OutstandingTimelineItem]
    recent_payments: List[dict]


class CategoryOutstandingOut(BaseModel):
    family_id: str
    family_name: str
    category_id: str
    category_name: str
    category_slug: str
    outstanding: float


# ── Ledger ────────────────────────────────────────────────────────────────

class LedgerEntryOut(BaseModel):
    id: str
    family_id: str
    payment_id: Optional[str] = None
    category_id: str
    entry_date: date
    description: str
    debit: float
    credit: float
    balance: float
    remarks: str
    entry_type: str
    payment_mode: str = ""
    collected_by: str = ""
    receipt_number: str = ""
    family_name: Optional[str] = None
    category_name: Optional[str] = None

    class Config:
        from_attributes = True


# ── Reports ───────────────────────────────────────────────────────────────

class PaymentStatusRow(BaseModel):
    family_id: str
    family_number: str
    family_name: str
    ward: str
    paid_amount: float
    required_amount: float
    balance_due: float
    status: str


class CollectionReportRow(BaseModel):
    category: str
    total_collected: float
    payment_count: int


class WardCollectionRow(BaseModel):
    ward: str
    total_collected: float
    family_count: int


# ── Festival Charges ──────────────────────────────────────────────────────

class FestivalChargeCreate(BaseModel):
    name: str
    category_id: str
    amount: float = Field(gt=0)
    charge_date: date
    description: str = ""
    apply_to_all: bool = True
    family_ids: List[str] = Field(default_factory=list)


class FestivalChargeApplyResult(BaseModel):
    event_id: str
    families_charged: int
    newly_charged: int
    skipped_duplicates: int
    total_amount_generated: float
    total_collected: float = 0.0
    total_outstanding: float = 0.0
    already_applied: bool = False
    status: str
    category_name: str = ""


class FestivalChargePreview(BaseModel):
    applicable_families: int
    amount_per_family: float
    total_charge: float
    already_charged_families: int = 0


class FestivalChargeFamilyRow(BaseModel):
    family_id: str
    family_number: str
    family_name: str
    amount_due: float
    amount_paid: float
    remaining: float
    status: str


class FestivalChargeOut(BaseModel):
    id: str
    name: str
    category_id: str
    category_name: str = ""
    category_slug: str = ""
    amount: float
    charge_date: str
    description: str = ""
    status: str
    apply_to_all: bool = True
    families_charged: int = 0
    total_amount_generated: float = 0.0
    total_collected: float = 0.0
    total_outstanding: float = 0.0
    applied_at: Optional[str] = None
    created_at: Optional[str] = None
    families: List[FestivalChargeFamilyRow] = Field(default_factory=list)


class FestivalChargeListResponse(BaseModel):
    items: List[FestivalChargeOut]
    total: int
