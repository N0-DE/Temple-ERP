import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Download, Search } from "lucide-react"
import * as XLSX from "xlsx"
import { fcApi } from "@/lib/family-contributions-api"
import type { OutstandingFamily, OutstandingSummary } from "@/lib/family-contributions-types"
import { formatCurrency } from "@/lib/family-contributions-types"
import { formatFamilyOption } from "@/lib/family-contributions-utils"
import { useToast } from "@/components/family-contributions/Toast"

const defaultSummary: OutstandingSummary = {
  total_masavari: 0,
  total_festival: 0,
  total_drf: 0,
  total_outstanding: 0,
  family_count: 0,
}

export default function OutstandingPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<OutstandingFamily[]>([])
  const [summary, setSummary] = useState<OutstandingSummary>(defaultSummary)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [ward, setWard] = useState("")
  const [sortBy, setSortBy] = useState("highest_due")
  const [category, setCategory] = useState("")
  const [paymentStatus, setPaymentStatus] = useState("")
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page, page_size: 25, sort_by: sortBy }
      if (search) params.search = search
      if (ward) params.ward = ward
      if (category) params.category = category
      if (paymentStatus) params.payment_status = paymentStatus
      const data = await fcApi.getOutstanding(params)
      setItems(data.items)
      setTotal(data.total)
      setSummary(data.summary ?? defaultSummary)
    } catch {
      toast("error", "Failed to load outstanding dues")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [page, search, ward, sortBy, category, paymentStatus])

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(items)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Outstanding")
    XLSX.writeFile(wb, "outstanding-dues.xlsx")
  }

  const totalPages = Math.max(1, Math.ceil(total / 25))

  const setCategoryFilter = (cat: string) => {
    setCategory(cat)
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button type="button" onClick={() => setCategoryFilter(category === "masavari" ? "" : "masavari")} className={`rounded-2xl border p-4 text-left transition ${category === "masavari" ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "border-border bg-card"}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Masavari</p>
          <p className="mt-1 text-xl font-bold text-amber-800">{formatCurrency(summary.total_masavari)}</p>
          <p className="text-xs text-muted-foreground">outstanding</p>
        </button>
        <button type="button" onClick={() => setCategoryFilter(category === "festival" ? "" : "festival")} className={`rounded-2xl border p-4 text-left transition ${category === "festival" ? "border-violet-400 bg-violet-50 dark:bg-violet-950/20" : "border-border bg-card"}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Festival</p>
          <p className="mt-1 text-xl font-bold text-violet-800">{formatCurrency(summary.total_festival)}</p>
          <p className="text-xs text-muted-foreground">outstanding</p>
        </button>
        <button type="button" onClick={() => setCategoryFilter(category === "drf" ? "" : "drf")} className={`rounded-2xl border p-4 text-left transition ${category === "drf" ? "border-blue-400 bg-blue-50 dark:bg-blue-950/20" : "border-border bg-card"}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">DRF</p>
          <p className="mt-1 text-xl font-bold text-blue-800">{formatCurrency(summary.total_drf)}</p>
          <p className="text-xs text-muted-foreground">outstanding</p>
        </button>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</p>
          <p className="mt-1 text-xl font-bold text-destructive">{formatCurrency(summary.total_outstanding)}</p>
          <p className="text-xs text-muted-foreground">{summary.family_count} families with dues</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Family Contributions</h2>
            <p className="text-sm text-muted-foreground">{total} families with outstanding dues</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search family..." className="w-32 bg-transparent outline-none" />
            </label>
            <input value={ward} onChange={(e) => { setWard(e.target.value); setPage(1) }} placeholder="Ward" className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">All categories</option>
              <option value="masavari">Masavari</option>
              <option value="festival">Festival Charges</option>
              <option value="festival-1">Festival Charge 1</option>
              <option value="festival-2">Festival Charge 2</option>
              <option value="festival-3">Festival Charge 3</option>
              <option value="drf">DRF</option>
            </select>
            <select value={paymentStatus} onChange={(e) => { setPaymentStatus(e.target.value); setPage(1) }} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">All statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partially paid</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="highest_due">Highest Total</option>
              <option value="highest_masavari">Highest Masavari</option>
              <option value="highest_festival">Highest Festival</option>
              <option value="highest_drf">Highest DRF</option>
              <option value="oldest_due">Oldest Due</option>
              <option value="family_number">Family Number</option>
              <option value="family_name">Family Name</option>
            </select>
            <button onClick={exportExcel} className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm"><Download className="h-4 w-4" />Export</button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">No outstanding dues — all families are up to date.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-3 py-2">Family</th>
                  <th className="px-3 py-2">Ward</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 font-semibold text-amber-800">Masavari</th>
                  <th className="px-3 py-2 font-semibold text-violet-800">Festival</th>
                  <th className="px-3 py-2 font-semibold text-blue-800">DRF</th>
                  <th className="px-3 py-2">Total Outstanding</th>
                  <th className="px-3 py-2">Last Paid</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.family_id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link to={`/family-contributions/families/${row.family_id}`} className="font-medium text-primary hover:underline">{formatFamilyOption(row)}</Link>
                    </td>
                    <td className="px-3 py-2">{row.ward || "—"}</td>
                    <td className="px-3 py-2 capitalize">{row.payment_status || "unpaid"}</td>
                    <td className="px-3 py-2 font-medium text-amber-800">{formatCurrency(row.masavari_outstanding)}</td>
                    <td className="px-3 py-2 font-medium text-violet-800">{formatCurrency(row.festival_outstanding)}</td>
                    <td className="px-3 py-2 font-medium text-blue-800">{formatCurrency(row.drf_outstanding)}</td>
                    <td className="px-3 py-2 font-semibold text-destructive">{formatCurrency(row.total_outstanding)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.last_payment_date || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-border px-3 py-1 disabled:opacity-40">Prev</button>
          <span className="px-2 py-1">{page}/{totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-border px-3 py-1 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  )
}
