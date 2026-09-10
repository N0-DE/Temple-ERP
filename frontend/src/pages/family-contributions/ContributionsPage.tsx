import { useEffect, useMemo, useState } from "react"
import { Download, Plus, Printer, Search, Trash2 } from "lucide-react"
import { Link } from "react-router-dom"
import * as XLSX from "xlsx"
import { fcApi } from "@/lib/family-contributions-api"
import type { Category, CategoryOutstanding, Family, FamilyDetail, Payment, Settings } from "@/lib/family-contributions-types"
import { formatCurrency } from "@/lib/family-contributions-types"
import { formatCategoryOptionLabel, formatFamilyOption, getCategoryConfiguredAmount, isAutoFillCategory } from "@/lib/family-contributions-utils"
import { ConfirmDialog } from "@/components/family-contributions/ConfirmDialog"
import { FamilySearchSelect } from "@/components/family-contributions/FamilySearchSelect"
import { useToast } from "@/components/family-contributions/Toast"

const PAYMENT_MODES = ["Cash", "UPI", "Cheque", "Bank Transfer", "Card"]

const emptyForm = {
  family_id: "",
  category_id: "",
  amount: "",
  payment_date: new Date().toISOString().slice(0, 10),
  payment_mode: "Cash",
  reference_number: "",
  remarks: "",
  collected_by: "",
}

function formatPaymentDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
      {children}
    </label>
  )
}

export default function ContributionsPage() {
  const { toast } = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [paymentTotal, setPaymentTotal] = useState(0)
  const [registerSearch, setRegisterSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [lastReceipt, setLastReceipt] = useState<Payment | null>(null)
  const [categoryOutstanding, setCategoryOutstanding] = useState<CategoryOutstanding | null>(null)
  const [familyDetail, setFamilyDetail] = useState<FamilyDetail | null>(null)
  const [outstandingLoading, setOutstandingLoading] = useState(false)
  const [familyCache, setFamilyCache] = useState<Record<string, Family>>({})
  const [amountError, setAmountError] = useState("")
  const [familyDropdownOpen, setFamilyDropdownOpen] = useState(false)

  const rememberFamily = (family?: Family) => {
    if (!family) return
    setFamilyCache((current) => (current[family.id] ? current : { ...current, [family.id]: family }))
  }

  const load = async () => {
    setLoading(true)
    try {
      const [cats, sett, pays] = await Promise.all([
        fcApi.getCategories(),
        fcApi.getSettings(),
        fcApi.getPayments({ search: registerSearch, limit: 200 }),
      ])
      setCategories(cats.filter((category) => category.is_active))
      setSettings(sett)
      setPayments(pays.items)
      setPaymentTotal(pays.total)

      const missingIds = [...new Set(pays.items.map((payment) => payment.family_id))]
        .filter((familyId) => !familyCache[familyId])
      if (missingIds.length > 0) {
        const fetched = await Promise.all(
          missingIds.slice(0, 20).map((familyId) => fcApi.getFamily(familyId).catch(() => null)),
        )
        const additions = Object.fromEntries(
          fetched.filter((family): family is Family => family !== null).map((family) => [family.id, family]),
        )
        if (Object.keys(additions).length > 0) {
          setFamilyCache((current) => ({ ...current, ...additions }))
        }
      }
    } catch {
      toast("error", "Failed to load data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [registerSearch])

  useEffect(() => {
    if (!form.family_id) {
      setFamilyDetail(null)
      return
    }
    let cancelled = false
    fcApi.getFamilyDetail(form.family_id)
      .then((detail) => { if (!cancelled) setFamilyDetail(detail) })
      .catch(() => { if (!cancelled) setFamilyDetail(null) })
    return () => { cancelled = true }
  }, [form.family_id, payments])

  useEffect(() => {
    if (!form.family_id || !form.category_id) {
      setCategoryOutstanding(null)
      return
    }
    let cancelled = false
    setOutstandingLoading(true)
    fcApi.getCategoryOutstanding(form.family_id, form.category_id)
      .then((data) => { if (!cancelled) setCategoryOutstanding(data) })
      .catch(() => { if (!cancelled) setCategoryOutstanding(null) })
      .finally(() => { if (!cancelled) setOutstandingLoading(false) })
    return () => { cancelled = true }
  }, [form.family_id, form.category_id, payments])

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === form.category_id),
    [categories, form.category_id],
  )

  const onCategoryChange = (categoryId: string) => {
    const category = categories.find((item) => item.id === categoryId)
    const amount = category && settings ? String(getCategoryConfiguredAmount(category, settings)) : ""
    setCategoryOutstanding(null)
    setAmountError("")
    setForm({
      ...form,
      category_id: categoryId,
      amount: category && isAutoFillCategory(category.slug) ? amount : form.amount,
    })
  }

  const paymentAmount = Number(form.amount) || 0
  const outstandingAmount = categoryOutstanding?.outstanding ?? null
  const remainingAfterPayment = outstandingAmount !== null ? Math.max(0, outstandingAmount - paymentAmount) : null

  const drfBreakdown = useMemo(
    () => (familyDetail?.drf_annual_status ?? []).filter((item) => item.balance > 0),
    [familyDetail],
  )

  const festivalBreakdown = useMemo(() => {
    if (!selectedCategory?.slug.startsWith("festival") || !familyDetail) return []
    return familyDetail.outstanding_timeline.filter(
      (item) => item.balance > 0 && item.category.includes(selectedCategory.name),
    )
  }, [familyDetail, selectedCategory])

  const validateAmount = (amount: number) => {
    if (amount <= 0) return "Enter an amount greater than zero"
    if (outstandingAmount !== null && amount > outstandingAmount) {
      return `Amount cannot exceed outstanding of ${formatCurrency(outstandingAmount)}`
    }
    return ""
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return

    const amount = Number(form.amount)
    const validationError = validateAmount(amount)
    if (validationError) {
      setAmountError(validationError)
      toast("error", validationError)
      return
    }
    if (selectedCategory && !isAutoFillCategory(selectedCategory.slug) && amount <= 0) {
      const message = "Enter a valid payment amount for this category"
      setAmountError(message)
      toast("error", message)
      return
    }

    setSubmitting(true)
    try {
      const payment = await fcApi.createPayment({ ...form, amount })
      setLastReceipt(payment)
      setAmountError("")
      toast("success", `Payment recorded — ${payment.receipt_number}`)
      setForm({ ...emptyForm, family_id: form.family_id, category_id: form.category_id })
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed to record payment"
      toast("error", String(msg))
    } finally {
      setSubmitting(false)
    }
  }

  const remove = async () => {
    if (!deleteId) return
    try {
      await fcApi.deletePayment(deleteId)
      toast("success", "Payment deleted — dues restored")
      setDeleteId(null)
      load()
    } catch {
      toast("error", "Failed to delete payment")
    }
  }

  const exportExcel = () => {
    const rows = payments.map((payment) => ({
      receipt: payment.receipt_number,
      family: familyName(payment.family_id),
      category: categoryName(payment.category_id),
      amount: payment.amount,
      date: payment.payment_date,
      mode: payment.payment_mode,
    }))
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Payments")
    XLSX.writeFile(workbook, "payments.xlsx")
  }

  const familyName = (id: string) => {
    const family = familyCache[id]
    return family ? formatFamilyOption(family) : "—"
  }

  const categoryName = (id: string) => categories.find((category) => category.id === id)?.name || "—"

  const amountPlaceholder = selectedCategory
    ? isAutoFillCategory(selectedCategory.slug)
      ? `Default ${formatCurrency(getCategoryConfiguredAmount(selectedCategory, settings))}`
      : `Min ${formatCurrency(getCategoryConfiguredAmount(selectedCategory, settings))}`
    : "Enter amount"

  const categoryPanelTitle = selectedCategory?.slug === "drf"
    ? "DRF Outstanding"
    : selectedCategory?.slug === "masavari"
      ? "Masavari Outstanding"
      : selectedCategory?.slug.startsWith("festival")
        ? `${selectedCategory.name} Outstanding`
        : "Outstanding"

  return (
    <div className="grid gap-6 overflow-visible xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <form onSubmit={submit} className="h-fit overflow-visible rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold tracking-tight">Record Payment</h2>
        <p className="mt-1 text-xs text-muted-foreground">Enter payment details for the selected family and category.</p>

        <div className="mt-5 space-y-4 overflow-visible">
          <div className={`relative space-y-1.5 ${familyDropdownOpen ? "z-[100]" : ""}`}>
            <FieldLabel>Family</FieldLabel>
            <FamilySearchSelect
              value={form.family_id}
              onOpenChange={setFamilyDropdownOpen}
              onChange={(familyId, family) => {
                rememberFamily(family)
                setCategoryOutstanding(null)
                setAmountError("")
                setForm({ ...form, family_id: familyId })
              }}
              required
            />
          </div>

          <div className={familyDropdownOpen ? "pointer-events-none space-y-4 opacity-30" : "space-y-4"}>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="payment-category">Category</FieldLabel>
            <select
              id="payment-category"
              required
              value={form.category_id}
              onChange={(event) => onCategoryChange(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {formatCategoryOptionLabel(category, settings)}
                </option>
              ))}
            </select>
          </div>

          {form.family_id && form.category_id ? (
            <div className="rounded-lg border border-border/80 bg-muted/20 px-3 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">{categoryPanelTitle}</p>
                <p className="text-lg font-semibold tabular-nums">
                  {outstandingLoading ? "…" : outstandingAmount !== null ? formatCurrency(outstandingAmount) : "—"}
                </p>
              </div>

              {selectedCategory?.slug === "masavari" ? (
                <p className="mt-2 text-xs text-muted-foreground">Oldest unpaid dues will be paid first.</p>
              ) : null}

              {selectedCategory?.slug === "drf" ? (
                <div className="mt-2 space-y-1">
                  {drfBreakdown.length > 0 ? (
                    drfBreakdown.map((item) => (
                      <div key={item.year} className="flex justify-between text-xs text-muted-foreground">
                        <span>{item.year}</span>
                        <span className="tabular-nums">{formatCurrency(item.balance)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No unpaid annual DRF years.</p>
                  )}
                  <p className="pt-1 text-xs text-muted-foreground">Oldest DRF year will be paid first.</p>
                </div>
              ) : null}

              {selectedCategory?.slug.startsWith("festival") ? (
                <div className="mt-2 space-y-1">
                  {festivalBreakdown.length > 0 ? (
                    festivalBreakdown.map((item, index) => (
                      <div key={`${item.category}-${item.billing_year}-${index}`} className="flex justify-between gap-3 text-xs text-muted-foreground">
                        <span className="truncate">{item.category}</span>
                        <span className="shrink-0 tabular-nums">{formatCurrency(item.balance)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No outstanding festival charges for this category.</p>
                  )}
                  <p className="pt-1 text-xs text-muted-foreground">Oldest outstanding charge will be paid first.</p>
                </div>
              ) : null}

              {paymentAmount > 0 && remainingAfterPayment !== null && !outstandingLoading ? (
                <div className="mt-3 flex justify-between border-t border-border/70 pt-2 text-xs">
                  <span className="text-muted-foreground">Remaining after payment</span>
                  <span className={`font-medium tabular-nums ${remainingAfterPayment === 0 ? "text-emerald-600" : ""}`}>
                    {formatCurrency(remainingAfterPayment)}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="payment-amount">Amount</FieldLabel>
              <input
                id="payment-amount"
                type="number"
                min={0}
                step={1}
                required
                value={form.amount}
                onChange={(event) => {
                  setAmountError("")
                  setForm({ ...form, amount: event.target.value })
                }}
                onBlur={() => setAmountError(validateAmount(paymentAmount))}
                placeholder={amountPlaceholder}
                aria-invalid={Boolean(amountError)}
                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring ${amountError ? "border-destructive" : "border-border"}`}
              />
              {outstandingAmount !== null && !outstandingLoading ? (
                <p className="text-xs text-muted-foreground">Outstanding: {formatCurrency(outstandingAmount)}</p>
              ) : null}
              {amountError ? <p className="text-xs text-destructive">{amountError}</p> : null}
            </div>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="payment-date">Payment Date</FieldLabel>
              <input
                id="payment-date"
                type="date"
                required
                value={form.payment_date}
                onChange={(event) => setForm({ ...form, payment_date: event.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="payment-mode">Payment Mode</FieldLabel>
            <select
              id="payment-mode"
              value={form.payment_mode}
              onChange={(event) => setForm({ ...form, payment_mode: event.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {PAYMENT_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="payment-reference">Reference / Cheque / UPI ID</FieldLabel>
            <input
              id="payment-reference"
              value={form.reference_number}
              onChange={(event) => setForm({ ...form, reference_number: event.target.value })}
              placeholder="Optional reference"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="payment-collected-by">Collected By</FieldLabel>
            <input
              id="payment-collected-by"
              value={form.collected_by}
              onChange={(event) => setForm({ ...form, collected_by: event.target.value })}
              placeholder="Staff name"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="payment-remarks">Remarks</FieldLabel>
            <textarea
              id="payment-remarks"
              value={form.remarks}
              onChange={(event) => setForm({ ...form, remarks: event.target.value })}
              placeholder="Optional notes"
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {submitting ? "Recording…" : "Record Payment"}
          </button>
        </div>

        {lastReceipt ? (
          <div className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 print-receipt">
            <p className="text-xs text-muted-foreground">Last receipt</p>
            <p className="font-semibold">{lastReceipt.receipt_number}</p>
            <p className="text-sm">{familyName(lastReceipt.family_id)}</p>
            <p className="text-lg font-bold tabular-nums text-primary">{formatCurrency(lastReceipt.amount)}</p>
            <button type="button" onClick={() => window.print()} className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <Printer className="h-3 w-3" />
              Print
            </button>
          </div>
        ) : null}
      </form>

      <section className="rounded-xl border border-border/80 bg-card/80 p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground">Payment Register</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Showing {payments.length} of {paymentTotal}</p>
          </div>
          <div className="flex gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="sr-only">Search payments</span>
              <input
                value={registerSearch}
                onChange={(event) => setRegisterSearch(event.target.value)}
                placeholder="Search register…"
                className="w-32 bg-transparent outline-none sm:w-40"
              />
            </label>
            <button
              type="button"
              onClick={exportExcel}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted/40"
            >
              <Download className="h-4 w-4" />
              Excel
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-10 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">Receipt</th>
                  <th className="px-3 py-2.5">Family</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5 w-10"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-border/60 hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-mono text-xs">{payment.receipt_number}</td>
                    <td className="px-3 py-2.5">
                      <Link to={`/family-contributions/families/${payment.family_id}`} className="text-primary hover:underline">
                        {familyName(payment.family_id)}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">{categoryName(payment.category_id)}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatCurrency(payment.amount)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{formatPaymentDate(payment.payment_date)}</td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setDeleteId(payment.id)}
                        aria-label={`Delete payment ${payment.receipt_number}`}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Payment"
        message="Deleting will restore outstanding dues for this payment."
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
