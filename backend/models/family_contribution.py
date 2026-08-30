import uuid
from datetime import datetime, date

from sqlalchemy import Boolean, Column, Date, DateTime, Integer, String, Text, Float, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from core.database import Base


class ContributionCategory(Base):
    __tablename__ = "contribution_categories"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    name = Column(String, nullable=False, unique=True, index=True)
    slug = Column(String, nullable=False, unique=True, index=True)
    description = Column(Text, default="")
    category_type = Column(String, nullable=False, default="festival")  # monthly | festival | relief
    default_amount = Column(Float, default=0.0)
    minimum_amount = Column(Float, default=0.0)
    is_fixed = Column(Boolean, default=False)
    is_monthly = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String, default="system")
    updated_by = Column(String, default="system")

    rates = relationship("ContributionRate", back_populates="category")
    family_dues = relationship("FamilyDue", back_populates="category")
    payments = relationship("Payment", back_populates="category")
    ledger_entries = relationship("LedgerEntry", back_populates="category")


class ContributionRate(Base):
    __tablename__ = "contribution_rates"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    category_id = Column(String, ForeignKey("contribution_categories.id"), nullable=False)
    amount = Column(Float, nullable=False, default=0.0)
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    category = relationship("ContributionCategory", back_populates="rates")


class ContributionSetting(Base):
    __tablename__ = "contribution_settings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    masavari_amount = Column(Float, default=0.0)
    festival_1_minimum = Column(Float, default=0.0)
    festival_2_minimum = Column(Float, default=0.0)
    festival_3_minimum = Column(Float, default=0.0)
    drf_amount = Column(Float, default=0.0)
    drf_is_monthly = Column(Boolean, default=True)
    partial_payment_allowed = Column(Boolean, default=True)
    financial_year = Column(String, default="2026-2027")
    receipt_prefix = Column(String, default="RCPT")
    amount_effective_from = Column(Date, default=date.today)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String, default="system")
    updated_by = Column(String, default="system")


class Family(Base):
    __tablename__ = "families"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    family_number = Column(String, nullable=False, unique=True, index=True)
    head_of_family = Column(String, nullable=False, index=True)
    house_name = Column(String, default="")
    address = Column(Text, default="")
    ward = Column(String, default="", index=True)
    phone = Column(String, default="")
    email = Column(String, default="")
    members_count = Column(Integer, default=1)
    joining_date = Column(Date, default=date.today)
    status = Column(String, default="Active", index=True)
    remarks = Column(Text, default="")
    is_deleted = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String, default="system")
    updated_by = Column(String, default="system")

    family_dues = relationship("FamilyDue", back_populates="family")
    payments = relationship("Payment", back_populates="family")
    ledger_entries = relationship("LedgerEntry", back_populates="family")
    payment_history = relationship("PaymentHistory", back_populates="family")


class FamilyDue(Base):
    __tablename__ = "family_dues"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    family_id = Column(String, ForeignKey("families.id"), nullable=False, index=True)
    category_id = Column(String, ForeignKey("contribution_categories.id"), nullable=False, index=True)
    festival_charge_event_id = Column(String, ForeignKey("festival_charge_events.id"), nullable=True, index=True)
    billing_month = Column(Integer, nullable=False)
    billing_year = Column(Integer, nullable=False)
    amount_due = Column(Float, nullable=False, default=0.0)
    amount_paid = Column(Float, nullable=False, default=0.0)
    contribution_rate_id = Column(String, ForeignKey("contribution_rates.id"), nullable=True)
    status = Column(String, default="pending", index=True)  # pending | partial | paid
    generated_on = Column(DateTime, default=datetime.utcnow)
    is_deleted = Column(Boolean, default=False)

    family = relationship("Family", back_populates="family_dues")
    category = relationship("ContributionCategory", back_populates="family_dues")
    payment_items = relationship("PaymentItem", back_populates="family_due")
    festival_charge_event = relationship("FestivalChargeEvent", back_populates="family_dues")


class FestivalChargeEvent(Base):
    """Admin-created festival charge event — applied manually to families."""

    __tablename__ = "festival_charge_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    name = Column(String, nullable=False, index=True)
    category_id = Column(String, ForeignKey("contribution_categories.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False, default=0.0)
    charge_date = Column(Date, nullable=False, index=True)
    description = Column(Text, default="")
    status = Column(String, default="draft", index=True)  # draft | applied | cancelled
    apply_to_all = Column(Boolean, default=True)
    selected_family_ids = Column(Text, default="")  # JSON array when apply_to_all is False
    families_charged = Column(Integer, default=0)
    total_amount_generated = Column(Float, default=0.0)
    applied_at = Column(DateTime, nullable=True)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String, default="admin")

    category = relationship("ContributionCategory")
    family_dues = relationship("FamilyDue", back_populates="festival_charge_event")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    receipt_number = Column(String, nullable=False, unique=True, index=True)
    family_id = Column(String, ForeignKey("families.id"), nullable=False, index=True)
    category_id = Column(String, ForeignKey("contribution_categories.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False, default=0.0)
    payment_date = Column(Date, default=date.today, index=True)
    month = Column(Integer, default=date.today().month)
    year = Column(Integer, default=date.today().year)
    payment_mode = Column(String, default="Cash")
    reference_number = Column(String, default="")
    remarks = Column(Text, default="")
    collected_by = Column(String, default="")
    is_deleted = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String, default="system")
    updated_by = Column(String, default="system")

    family = relationship("Family", back_populates="payments")
    category = relationship("ContributionCategory", back_populates="payments")
    items = relationship("PaymentItem", back_populates="payment")
    ledger_entries = relationship("LedgerEntry", back_populates="payment")
    payment_history = relationship("PaymentHistory", back_populates="payment")


class PaymentItem(Base):
    __tablename__ = "payment_items"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    payment_id = Column(String, ForeignKey("payments.id"), nullable=False, index=True)
    family_due_id = Column(String, ForeignKey("family_dues.id"), nullable=False, index=True)
    amount_paid = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    payment = relationship("Payment", back_populates="items")
    family_due = relationship("FamilyDue", back_populates="payment_items")


class Receipt(Base):
    __tablename__ = "receipts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    receipt_number = Column(String, nullable=False, unique=True, index=True)
    payment_id = Column(String, ForeignKey("payments.id"), nullable=False)
    file_path = Column(String, default="")
    print_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    family_id = Column(String, ForeignKey("families.id"), nullable=False, index=True)
    payment_id = Column(String, ForeignKey("payments.id"), nullable=True)
    category_id = Column(String, ForeignKey("contribution_categories.id"), nullable=False, index=True)
    entry_date = Column(Date, default=date.today, index=True)
    description = Column(Text, default="")
    debit = Column(Float, default=0.0)
    credit = Column(Float, default=0.0)
    balance = Column(Float, default=0.0)
    remarks = Column(Text, default="")
    entry_type = Column(String, default="payment")
    payment_mode = Column(String, default="")
    collected_by = Column(String, default="")
    receipt_number = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    family = relationship("Family", back_populates="ledger_entries")
    payment = relationship("Payment", back_populates="ledger_entries")
    category = relationship("ContributionCategory", back_populates="ledger_entries")


class PaymentHistory(Base):
    __tablename__ = "payment_history"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    family_id = Column(String, ForeignKey("families.id"), nullable=False)
    payment_id = Column(String, ForeignKey("payments.id"), nullable=True)
    action = Column(String, default="created")
    details = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    family = relationship("Family", back_populates="payment_history")
    payment = relationship("Payment", back_populates="payment_history")
