import { useEffect, useMemo, useState } from "react"
import { Download, Plus, Printer, Search, Trash2 } from "lucide-react"
import { Link } from "react-router-dom"
import * as XLSX from "xlsx"
import { fcApi } from "@/lib/family-contributions-api"
import type { Category, CategoryOutstanding, Family, Payment, Settings } from "@/lib/family-contributions-types"
import { formatCurrency } from "@/lib/family-contributions-types"
import { formatCategoryOptionLabel, formatFamilyOption, getCategoryConfiguredAmount, isAutoFillCategory } from "@/lib/family-contributions-utils"
import { useToast } from "@/components/family-contributions/Toast"
import { ConfirmDialog } from "@/components/family-contributions/ConfirmDialog"

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

export default function ContributionsPage() {
  const { toast } = useToast()
  const [families, setFamilies] = useState<Family[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [paymentTotal, setPaymentTotal] = useState(0)
  const [familySearch, setFamilySearch] = useState("")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [lastReceipt, setLastReceipt] = useState<Payment | null>(null)
  const [categoryOutstanding, setCategoryOutstanding] = useState<CategoryOutstanding | null>(null)
  const [outstandingLoading, setOutstandingLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [fam, cats, sett, pays] = await Promise.all([
        fcApi.getFamilies({
          page: 1,
          page_size: 100,
          status: "Active",
          ...(familySearch ? { search: familySearch } : {}),
        }),
        fcApi.getCategories(),
        fcApi.getSettings(),
        fcApi.getPayments({ search, limit: 200 }),
      ])
      setFamilies(fam.items)
      setCategories(cats.filter((c) => c.is_active))
      setSettings(sett)
      setPayments(pays.items)
      setPaymentTotal(pays.total)
    } catch {
      toast("error", "Failed to load data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [search])

  useEffect(() => {
    const t = setTimeout(() => load(), 300)
    return () => clearTimeout(t)
  }, [familySearch])

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
    () => categories.find((c) => c.id === form.category_id),
    [categories, form.category_id],
  )

  const onCategoryChange = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId)
    const amount = cat && settings ? String(getCategoryConfiguredAmount(cat, settings)) : ""
    setCategoryOutstanding(null)
    setForm({ ...form, category_id: categoryId, amount: cat && isAutoFillCategory(cat.slug) ? amount : form.amount })
  }

  const paymentAmount = Number(form.amount) || 0
  const outstandingAmount = categoryOutstanding?.outstanding ?? null
  const remainingAfterPayment = outstandingAmount !== null ? Math.max(0, outstandingAmount - paymentAmount) : null

  const selectedFamily = useMemo(
    () => families.find((f) => f.id === form.family_id),
    [families, form.family_id],
  )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const amount = Number(form.amount)
    if (selectedCategory && !isAutoFillCategory(selectedCategory.slug) && amount <= 0) {
      toast("error", "Enter a valid payment amount for this category")
      return
    }
    setSubmitting(true)
    try {
      const payment = await fcApi.createPayment({ ...form, amount: amount || 0 })
      setLastReceipt(payment)
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
    const rows = payments.map((p) => ({
      receipt: p.receipt_number,
      family: families.find((f) => f.id === p.family_id) ? formatFamilyOption(families.find((f) => f.id === p.family_id)!) : "",
      category: categories.find((c) => c.id === p.category_id)?.name || "",
      amount: p.amount,
      date: p.payment_date,
      mode: p.payment_mode,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Payments")
    XLSX.writeFile(wb, "payments.xlsx")
  }

  const familyName = (id: string) => {
    const f = families.find((x) => x.id === id)
    return f ? formatFamilyOption(f) : "—"
  }
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name || "—"

  const amountPlaceholder = selectedCategory
    ? isAutoFillCategory(selectedCategory.slug)
      ? `Default ${formatCurrency(getCategoryConfiguredAmount(selectedCategory, settings))}`
      : `Min ${formatCurrency(getCategoryConfiguredAmount(selectedCategory, settings))}`
    : "Amount"

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <form onSubmit={submit} className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3 h-fit">
        <h2 className="text-lg font-semibold">Record Payment</h2>
        <p className="text-xs text-muted-foreground">Masavari payments apply to oldest unpaid months first (FIFO).</p>

        <input
          value={familySearch}
          onChange={(e) => setFamilySearch(e.target.value)}
          placeholder="Search family to add..."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <select required value={form.family_id} onChange={(e) => { setCategoryOutstanding(null); setForm({ ...form, family_id: e.target.value }) }} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="">Select family</option>
          {families.map((f) => <option key={f.id} value={f.id}>{formatFamilyOption(f)}</option>)}
        </select>

        <select required value={form.category_id} onChange={(e) => onCategoryChange(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="">Select category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{formatCategoryOptionLabel(c, settings)}</option>
          ))}
        </select>

        {form.family_id && form.category_id && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Family</span>
              <span className="font-medium">{selectedFamily ? formatFamilyOption(selectedFamily) : "—"}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Payment Category</span>
              <span className="font-medium">{categoryOutstanding?.category_name || selectedCategory?.name || "—"}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-medium text-amber-800">Outstanding</span>
              <span className="text-xl font-bold text-amber-900">
                {outstandingLoading ? "…" : outstandingAmount !== null ? formatCurrency(outstandingAmount) : "—"}
              </span>
            </div>
            {paymentAmount > 0 && remainingAfterPayment !== null && !outstandingLoading && (
              <div className="flex justify-between text-xs border-t border-amber-500/20 pt-2">
                <span className="text-muted-foreground">Remaining After Payment</span>
                <span className={`font-semibold ${remainingAfterPayment === 0 ? "text-emerald-700" : "text-amber-900"}`}>
                  {formatCurrency(remainingAfterPayment)}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <input type="number" min={0} step={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={amountPlaceholder} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>

        <select value={form.payment_mode} onChange={(e) => setForm({ ...form, payment_mode: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
          {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} placeholder="Reference / Cheque / UPI ID" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        <input value={form.collected_by} onChange={(e) => setForm({ ...form, collected_by: e.target.value })} placeholder="Collected By" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Remarks" className="w-full min-h-16 rounded-lg border border-border bg-background px-3 py-2 text-sm" />

        <button type="submit" disabled={submitting} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
          <Plus className="h-4 w-4" />{submitting ? "Recording..." : "Record Payment"}
        </button>

        {lastReceipt && (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 print-receipt">
            <p className="text-xs text-muted-foreground">Last Receipt</p>
            <p className="font-semibold">{lastReceipt.receipt_number}</p>
            <p className="text-sm">{familyName(lastReceipt.family_id)}</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(lastReceipt.amount)}</p>
            <button type="button" onClick={() => window.print()} className="mt-2 flex items-center gap-1 text-xs text-primary"><Printer className="h-3 w-3" />Print</button>
          </div>
        )}
      </form>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Payment Register</h2>
            <p className="text-xs text-muted-foreground">Showing {payments.length} of {paymentTotal}</p>
          </div>
          <div className="flex gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-28 bg-transparent outline-none" />
            </label>
            <button onClick={exportExcel} className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm"><Download className="h-4 w-4" />Excel</button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}</div>
        ) : payments.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto max-h-[600px]">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-2">Receipt</th>
                  <th className="px-2 py-2">Family</th>
                  <th className="px-2 py-2">Category</th>
                  <th className="px-2 py-2">Amount</th>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-border/60">
                    <td className="px-2 py-2 font-mono text-xs">{p.receipt_number}</td>
                    <td className="px-2 py-2">
                      <Link to={`/family-contributions/families/${p.family_id}`} className="text-primary hover:underline">{familyName(p.family_id)}</Link>
                    </td>
                    <td className="px-2 py-2">{categoryName(p.category_id)}</td>
                    <td className="px-2 py-2">{formatCurrency(p.amount)}</td>
                    <td className="px-2 py-2">{p.payment_date}</td>
                    <td className="px-2 py-2">
                      <button onClick={() => setDeleteId(p.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog open={!!deleteId} title="Delete Payment" message="Deleting will restore outstanding dues for this payment." onConfirm={remove} onCancel={() => setDeleteId(null)} />
    </div>
  )
}
