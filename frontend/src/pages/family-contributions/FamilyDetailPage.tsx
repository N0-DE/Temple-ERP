import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { fcApi } from "@/lib/family-contributions-api"
import type { FamilyDetail, LedgerEntry } from "@/lib/family-contributions-types"
import { formatCurrency } from "@/lib/family-contributions-types"
import { formatFamilyLabel } from "@/lib/family-contributions-utils"
import { useToast } from "@/components/family-contributions/Toast"

export default function FamilyDetailPage() {
  const { familyId } = useParams<{ familyId: string }>()
  const { toast } = useToast()
  const [detail, setDetail] = useState<FamilyDetail | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!familyId) return
    setLoading(true)
    Promise.all([
      fcApi.getFamilyDetail(familyId),
      fcApi.getFamilyLedger(familyId),
    ])
      .then(([d, l]) => { setDetail(d); setLedger(l) })
      .catch(() => toast("error", "Failed to load family details"))
      .finally(() => setLoading(false))
  }, [familyId])

  if (loading) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
  }

  if (!detail) return <p className="text-muted-foreground">Family not found.</p>

  const { family, outstanding, monthly_status, drf_annual_status = [], outstanding_timeline, recent_payments } = detail

  return (
    <div className="space-y-6">
      <Link to="/family-contributions/outstanding" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" />Back to Outstanding
      </Link>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-semibold">{formatFamilyLabel(family)}</h2>
          <p className="text-sm text-muted-foreground">
            {family.head_of_family !== family.family_number ? `${family.head_of_family} · ` : ""}
            {family.ward || "No ward"}
          </p>
          <div className="mt-3 grid gap-1 text-sm">
            <p>{family.house_name}</p>
            <p>{family.address}</p>
            <p>{family.phone} · {family.email}</p>
            <p>Members: {family.members_count} · Joined: {family.joining_date || "—"}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-sm">
          <p className="text-sm font-medium text-amber-800">Masavari Outstanding</p>
          <p className="mt-1 text-4xl font-bold text-amber-900">{formatCurrency(outstanding.masavari_outstanding)}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Global monthly rate applies to all families. Payments reduce this balance (oldest month first).
          </p>
          {(outstanding.festival_outstanding > 0 || outstanding.drf_outstanding > 0) && (
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-amber-500/20 pt-3 text-sm">
              {outstanding.festival_outstanding > 0 && (
                <div><p className="text-muted-foreground">Festival</p><p className="font-medium">{formatCurrency(outstanding.festival_outstanding)}</p></div>
              )}
              {outstanding.drf_outstanding > 0 && (
                <div><p className="text-muted-foreground">DRF</p><p className="font-medium">{formatCurrency(outstanding.drf_outstanding)}</p></div>
              )}
            </div>
          )}
          {outstanding.total_outstanding !== outstanding.masavari_outstanding && (
            <p className="mt-2 text-sm text-muted-foreground">All categories total: {formatCurrency(outstanding.total_outstanding)}</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">Monthly Due Status (Masavari)</h3>
        <div className="flex flex-wrap gap-2">
          {monthly_status.map((m) => (
            <div key={`${m.year}-${m.month}`} className={`rounded-lg border px-3 py-2 text-sm ${m.status === "paid" ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
              <p className="font-medium">{m.label}</p>
              <p className="text-xs text-muted-foreground">{m.status === "paid" ? "Paid" : m.status === "partial" ? "Partial" : "Pending"}</p>
            </div>
          ))}
        </div>
      </div>

      {(outstanding.drf_outstanding > 0 || drf_annual_status.length > 0) && (
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 shadow-sm">
          <p className="text-sm font-medium text-blue-800">DRF Outstanding (Annual)</p>
          <p className="mt-1 text-3xl font-bold text-blue-900">{formatCurrency(outstanding.drf_outstanding)}</p>
          <div className="mt-3 space-y-1">
            {drf_annual_status.filter((d) => d.balance > 0).map((d) => (
              <div key={d.year} className="flex justify-between rounded-lg border border-blue-500/20 bg-background/50 px-3 py-2 text-sm">
                <span>{d.year}</span>
                <span className="font-medium">{formatCurrency(d.balance)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-3 font-semibold">Outstanding Timeline</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {outstanding_timeline.length === 0 ? <p className="text-sm text-muted-foreground">No outstanding items</p> : outstanding_timeline.map((t, i) => (
              <div key={i} className="flex justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                <span>{t.category} {t.billing_month ? `${t.billing_month}/${t.billing_year}` : t.billing_year}</span>
                <span className="font-medium text-amber-700">{formatCurrency(t.balance)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-3 font-semibold">Recent Payments</h3>
          <div className="space-y-2">
            {recent_payments.map((p) => (
              <div key={p.id} className="flex justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                <span>{p.receipt_number} · {p.payment_date}</span>
                <span className="font-medium text-emerald-700">{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">Family Ledger</h3>
        <div className="overflow-x-auto max-h-96">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Category</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2">Debit</th>
                <th className="px-2 py-2">Credit</th>
                <th className="px-2 py-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((e) => (
                <tr key={e.id} className="border-b border-border/60">
                  <td className="px-2 py-2">{e.entry_date}</td>
                  <td className="px-2 py-2">{e.category_name ?? "—"}</td>
                  <td className="px-2 py-2">{e.description}</td>
                  <td className="px-2 py-2">{e.debit > 0 ? formatCurrency(e.debit) : "—"}</td>
                  <td className="px-2 py-2">{e.credit > 0 ? formatCurrency(e.credit) : "—"}</td>
                  <td className="px-2 py-2">{formatCurrency(e.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
