import { useEffect, useState } from "react"
import { Download, Printer } from "lucide-react"
import { Link } from "react-router-dom"
import * as XLSX from "xlsx"
import { fcApi } from "@/lib/family-contributions-api"
import type { Category, Family, LedgerEntry, OutstandingFamily, Settings } from "@/lib/family-contributions-types"
import { formatCurrency } from "@/lib/family-contributions-types"
import { formatCategoryOptionLabel, formatFamilyOption } from "@/lib/family-contributions-utils"
import { useToast } from "@/components/family-contributions/Toast"

type ReportTab = "payment-status" | "monthly" | "category" | "ward" | "defaulters" | "register" | "family-ledger" | "category-ledger" | "master-ledger"

export default function ReportsPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState<ReportTab>("payment-status")
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState("")
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState<unknown[]>([])
  const [loading, setLoading] = useState(false)
  const [ledgerCategoryId, setLedgerCategoryId] = useState("")
  const [settings, setSettings] = useState<Settings | null>(null)
  const [families, setFamilies] = useState<Family[]>([])
  const [ledgerFamilyId, setLedgerFamilyId] = useState("")

  useEffect(() => {
    Promise.all([fcApi.getCategories(), fcApi.getSettings(), fcApi.getFamilies({ page: 1, page_size: 100, status: "Active" })])
      .then(([cats, sett, fam]) => {
        setCategories(cats)
        setSettings(sett)
        setFamilies(fam.items)
        if (cats.length) {
          setCategoryId(cats[0].id)
          setLedgerCategoryId(cats[0].id)
        }
        if (fam.items.length) setLedgerFamilyId(fam.items[0].id)
      })
      .catch(() => toast("error", "Failed to load report filters"))
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      let result: unknown[] = []
      switch (tab) {
        case "payment-status":
          result = await fcApi.getPaymentStatusReport({ category_id: categoryId, month, year })
          break
        case "monthly":
          result = await fcApi.getMonthlyCollection(month, year)
          break
        case "category":
          result = await fcApi.getCategoryCollection()
          break
        case "ward":
          result = await fcApi.getWardCollection({ month, year })
          break
        case "defaulters":
          result = (await fcApi.getTopDefaulters(30)).items
          break
        case "register":
          result = (await fcApi.getPaymentRegister()).items
          break
        case "family-ledger":
          result = ledgerFamilyId ? await fcApi.getFamilyLedger(ledgerFamilyId) : []
          break
        case "category-ledger":
          result = ledgerCategoryId ? await fcApi.getCategoryLedger(ledgerCategoryId) : []
          break
        case "master-ledger":
          result = await fcApi.getMasterLedger({ month, year })
          break
      }
      setData(result)
    } catch {
      toast("error", "Failed to load report")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (categoryId || tab !== "payment-status") load() }, [tab, categoryId, month, year, ledgerCategoryId, ledgerFamilyId])

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(data as Record<string, unknown>[])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Report")
    XLSX.writeFile(wb, `${tab}-report.xlsx`)
  }

  const tabs: { key: ReportTab; label: string }[] = [
    { key: "payment-status", label: "Paid / Unpaid" },
    { key: "monthly", label: "Monthly Collection" },
    { key: "category", label: "Category Collection" },
    { key: "ward", label: "Ward Collection" },
    { key: "defaulters", label: "Top Defaulters" },
    { key: "register", label: "Payment Register" },
    { key: "family-ledger", label: "Family Ledger" },
    { key: "category-ledger", label: "Category Ledger" },
    { key: "master-ledger", label: "Master Ledger" },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {tab === "payment-status" && (
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
              {categories.map((c) => <option key={c.id} value={c.id}>{formatCategoryOptionLabel(c, settings)}</option>)}
            </select>
          )}
          {tab === "family-ledger" && (
            <select value={ledgerFamilyId} onChange={(e) => setLedgerFamilyId(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
              {families.map((f) => <option key={f.id} value={f.id}>{formatFamilyOption(f)}</option>)}
            </select>
          )}
          {tab === "category-ledger" && (
            <select value={ledgerCategoryId} onChange={(e) => setLedgerCategoryId(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
              {categories.map((c) => <option key={c.id} value={c.id}>{formatCategoryOptionLabel(c, settings)}</option>)}
            </select>
          )}
          {["payment-status", "monthly", "ward", "master-ledger"].includes(tab) && (
            <>
              <input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </>
          )}
          <button onClick={load} className="rounded-lg border border-border px-3 py-2 text-sm">Refresh</button>
          <button onClick={exportExcel} className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm"><Download className="h-4 w-4" />Excel</button>
          <button onClick={() => window.print()} className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm"><Printer className="h-4 w-4" />Print</button>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}</div>
        ) : (
          <div className="overflow-x-auto print-report">
            {tab === "payment-status" && (
              <div className="grid gap-4 xl:grid-cols-2">
                <ReportTable title="Paid" rows={(data as Array<{ status: string }>).filter((r) => r.status === "Paid")} />
                <ReportTable title="Not Paid" rows={(data as Array<{ status: string }>).filter((r) => r.status === "Not Paid")} />
                <ReportTable title="Underpaid" rows={(data as Array<{ status: string }>).filter((r) => r.status === "Underpaid")} />
              </div>
            )}
            {tab === "defaulters" && <DefaulterTable rows={data as OutstandingFamily[]} />}
            {tab === "register" && <PaymentTable rows={data as Array<{ receipt_number: string; amount: number; payment_date: string; payment_mode: string }>} />}
            {["monthly", "category", "ward"].includes(tab) && <CollectionTable rows={data as Array<{ category?: string; ward?: string; total_collected: number; payment_count?: number; family_count?: number }>} />}
            {["family-ledger", "category-ledger", "master-ledger"].includes(tab) && <LedgerTable rows={data as LedgerEntry[]} />}
          </div>
        )}
      </div>
    </div>
  )
}

function ReportTable({ title, rows }: { title: string; rows: Array<Record<string, unknown>> }) {
  return (
    <div>
      <h3 className={`mb-2 font-semibold ${title === "Paid" ? "text-emerald-700" : "text-amber-700"}`}>{title} ({rows.length})</h3>
      <table className="min-w-full text-sm">
        <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1">Family</th><th>Ward</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60">
              <td className="py-1">{formatFamilyOption({ family_number: String(r.family_number ?? r.family_name), family_name: String(r.family_name) })}</td>
              <td>{String(r.ward)}</td>
              <td>{formatCurrency(Number(r.paid_amount))}</td>
              <td>{formatCurrency(Number(r.balance_due))}</td>
              <td>{String(r.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DefaulterTable({ rows }: { rows: OutstandingFamily[] }) {
  return (
    <table className="min-w-full text-sm">
      <thead className="sticky top-0 bg-card"><tr className="border-b text-left text-muted-foreground"><th className="py-2">Family</th><th>Pending Mo.</th><th>Total Due</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.family_id} className="border-b border-border/60">
          <td className="py-2"><Link to={`/family-contributions/families/${r.family_id}`} className="text-primary hover:underline">{formatFamilyOption(r)}</Link></td>
          <td>{r.pending_months}</td>
          <td className="font-semibold text-destructive">{formatCurrency(r.total_outstanding)}</td>
        </tr>
      ))}</tbody>
    </table>
  )
}

function PaymentTable({ rows }: { rows: Array<{ receipt_number: string; amount: number; payment_date: string; payment_mode: string }> }) {
  return (
    <table className="min-w-full text-sm">
      <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Receipt</th><th>Amount</th><th>Date</th><th>Mode</th></tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i} className="border-b border-border/60"><td className="py-2 font-mono text-xs">{r.receipt_number}</td><td>{formatCurrency(r.amount)}</td><td>{r.payment_date}</td><td>{r.payment_mode}</td></tr>
      ))}</tbody>
    </table>
  )
}

function CollectionTable({ rows }: { rows: Array<{ category?: string; ward?: string; total_collected: number; payment_count?: number; family_count?: number }> }) {
  return (
    <table className="min-w-full text-sm">
      <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Name</th><th>Collected</th><th>Count</th></tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i} className="border-b border-border/60"><td className="py-2">{r.category || r.ward}</td><td>{formatCurrency(r.total_collected)}</td><td>{r.payment_count ?? r.family_count ?? "—"}</td></tr>
      ))}</tbody>
    </table>
  )
}

function LedgerTable({ rows }: { rows: LedgerEntry[] }) {
  return (
    <table className="min-w-full text-sm">
      <thead className="sticky top-0 bg-card"><tr className="border-b text-left text-muted-foreground"><th className="py-2">Date</th><th>Family</th><th>Category</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.id} className="border-b border-border/60">
          <td className="py-2">{r.entry_date}</td>
          <td>{r.family_name || "—"}</td>
          <td>{r.category_name || "—"}</td>
          <td>{r.description}</td>
          <td>{r.debit > 0 ? formatCurrency(r.debit) : "—"}</td>
          <td>{r.credit > 0 ? formatCurrency(r.credit) : "—"}</td>
          <td>{formatCurrency(r.balance)}</td>
        </tr>
      ))}</tbody>
    </table>
  )
}
