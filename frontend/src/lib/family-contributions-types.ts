export type Family = {
  id: string
  family_number: string
  head_of_family: string
  house_name: string
  address: string
  ward: string
  phone: string
  email: string
  members_count: number
  joining_date?: string
  status: string
  remarks: string
  is_deleted: boolean
}

export type Category = {
  id: string
  name: string
  slug: string
  description: string
  category_type: string
  default_amount: number
  minimum_amount: number
  is_fixed: boolean
  is_monthly: boolean
  is_active: boolean
  is_deleted: boolean
}

export type Settings = {
  id: string
  masavari_amount: number
  festival_1_minimum: number
  festival_2_minimum: number
  festival_3_minimum: number
  drf_amount: number
  drf_is_monthly: boolean
  partial_payment_allowed: boolean
  financial_year: string
  receipt_prefix: string
  amount_effective_from?: string
  is_deleted: boolean
}

export type Payment = {
  id: string
  receipt_number: string
  family_id: string
  category_id: string
  amount: number
  payment_date: string
  month: number
  year: number
  payment_mode: string
  reference_number: string
  remarks: string
  collected_by: string
  is_deleted: boolean
}

export type OutstandingFamily = {
  family_id: string
  family_number: string
  family_name: string
  house_name: string
  ward: string
  pending_months: number
  masavari_outstanding: number
  festival_outstanding: number
  drf_outstanding: number
  total_outstanding: number
  payment_status: string
  last_payment_date: string | null
}

export type OutstandingSummary = {
  total_masavari: number
  total_festival: number
  total_drf: number
  total_outstanding: number
  family_count: number
}

export type FestivalCharge = {
  id: string
  name: string
  category_id: string
  category_name: string
  category_slug?: string
  amount: number
  charge_date: string
  description: string
  status: string
  apply_to_all?: boolean
  families_charged: number
  total_amount_generated: number
  total_collected: number
  total_outstanding: number
  applied_at: string | null
  created_at?: string | null
  families?: Array<{
    family_id: string
    family_number: string
    family_name: string
    amount_due: number
    amount_paid: number
    remaining: number
    status: string
  }>
}

export type FestivalChargeApplyResult = {
  event_id: string
  families_charged: number
  newly_charged: number
  skipped_duplicates: number
  total_amount_generated: number
  total_collected: number
  total_outstanding: number
  already_applied: boolean
  status: string
  category_name: string
}

export type FestivalChargePreview = {
  applicable_families: number
  amount_per_family: number
  total_charge: number
  already_charged_families: number
}

export type LedgerEntry = {
  id: string
  family_id: string
  payment_id?: string
  category_id: string
  entry_date: string
  description: string
  debit: number
  credit: number
  balance: number
  remarks: string
  entry_type: string
  payment_mode?: string
  collected_by?: string
  receipt_number?: string
  family_name?: string
  category_name?: string
}

export type CategoryOutstanding = {
  family_id: string
  family_name: string
  category_id: string
  category_name: string
  category_slug: string
  outstanding: number
}

export type FamilyDetail = {
  family: Family
  outstanding: OutstandingFamily
  monthly_status: Array<{
    month: number
    year: number
    label: string
    amount_due: number
    amount_paid: number
    status: string
  }>
  outstanding_timeline: Array<{
    category: string
    billing_month: number
    billing_year: number
    amount_due: number
    amount_paid: number
    balance: number
    status: string
  }>
  recent_payments: Array<{
    id: string
    receipt_number: string
    amount: number
    payment_date: string
    payment_mode: string
  }>
}

export function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`
}
