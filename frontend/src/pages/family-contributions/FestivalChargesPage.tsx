import { useEffect, useState } from "react"
import { CheckCircle2, Plus, Sparkles } from "lucide-react"
import { fcApi } from "@/lib/family-contributions-api"
import type { Category, FestivalCharge, FestivalChargeApplyResult, FestivalChargePreview } from "@/lib/family-contributions-types"
import { formatCurrency } from "@/lib/family-contributions-types"
import { ConfirmDialog } from "@/components/family-contributions/ConfirmDialog"
import { useToast } from "@/components/family-contributions/Toast"

const emptyForm = {
  name: "",
  category_id: "",
  amount: "",
  charge_date: new Date().toISOString().slice(0, 10),
  description: "",
}

export default function FestivalChargesPage() {
  const { toast } = useToast()
  const [charges, setCharges] = useState<FestivalCharge[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<FestivalCharge | null>(null)
  const [preview, setPreview] = useState<FestivalChargePreview | null>(null)
  const [confirmApply, setConfirmApply] = useState<FestivalCharge | null>(null)
  const [applyResult, setApplyResult] = useState<FestivalChargeApplyResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const festivalCategories = categories.filter((c) => c.category_type === "festival" && c.is_active)

  const load = async () => {
    setLoading(true)
    try {
      const [chargeData, cats] = await Promise.all([fcApi.getFestivalCharges(), fcApi.getCategories()])
      setCharges(chargeData.items)
      setCategories(cats)
    } catch {
      toast("error", "Failed to load festival charges")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openDetail = async (charge: FestivalCharge) => {
    try {
      const detail = await fcApi.getFestivalCharge(charge.id)
      setSelected(detail)
    } catch {
      toast("error", "Failed to load festival charge detail")
    }
  }

  const createCharge = async () => {
    if (!form.name.trim() || !form.category_id || !form.amount) {
      toast("error", "Please fill festival name, charge type, and amount")
      return
    }
    setSaving(true)
    try {
      const created = await fcApi.createFestivalCharge({
        name: form.name.trim(),
        category_id: form.category_id,
        amount: Number(form.amount),
        charge_date: form.charge_date,
        description: form.description,
        apply_to_all: true,
      })
      toast("success", "Festival charge created — ready to apply")
      setForm(emptyForm)
      setShowForm(false)
      await load()
      setSelected(created)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast("error", msg || "Failed to create festival charge")
    } finally {
      setSaving(false)
    }
  }

  const startApply = async (charge: FestivalCharge) => {
    try {
      const p = await fcApi.previewFestivalCharge(charge.id)
      setPreview(p)
      setConfirmApply(charge)
    } catch {
      toast("error", "Failed to preview festival charge")
    }
  }

  const doApply = async () => {
    if (!confirmApply) return
    setSaving(true)
    try {
      const result = await fcApi.applyFestivalCharge(confirmApply.id)
      setApplyResult(result)
      setConfirmApply(null)
      setPreview(null)
      await load()
      if (selected?.id === confirmApply.id) {
        const detail = await fcApi.getFestivalCharge(confirmApply.id)
        setSelected(detail)
      }
      toast("success", result.already_applied
        ? `Already applied — ${result.families_charged} families charged`
        : `Applied to ${result.newly_charged} families`)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast("error", msg || "Failed to apply festival charge")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Festival Charges</h2>
          <p className="text-sm text-muted-foreground">Create admin-triggered festival charges and apply them to families</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> New Festival Charge
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-4 font-semibold">Create Festival Charge</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              Festival / charge name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Onam" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" />
            </label>
            <label className="text-sm">
              Charge type
              <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2">
                <option value="">Select type</option>
                {festivalCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Amount (₹)
              <input type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" />
            </label>
            <label className="text-sm">
              Date
              <input type="date" value={form.charge_date} onChange={(e) => setForm({ ...form, charge_date: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" />
            </label>
            <label className="col-span-full text-sm">
              Description / notes
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={createCharge} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">Create Charge</button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {applyResult && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-5 w-5" /> Festival charge applied successfully
          </div>
          <p className="mt-2">{applyResult.families_charged} families charged · {formatCurrency(applyResult.total_amount_generated)} total generated</p>
          <button onClick={() => setApplyResult(null)} className="mt-2 text-primary hover:underline">Dismiss</button>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">Festival Charge History</h3>
        {loading ? (
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
        ) : charges.length === 0 ? (
          <p className="text-sm text-muted-foreground">No festival charges created yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-2">Festival</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Amount</th>
                  <th className="px-2 py-2">Families</th>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="px-2 py-2 font-medium">{c.name}</td>
                    <td className="px-2 py-2">{c.category_name}</td>
                    <td className="px-2 py-2">{formatCurrency(c.amount)}</td>
                    <td className="px-2 py-2">{c.families_charged || "—"}</td>
                    <td className="px-2 py-2">{c.charge_date}</td>
                    <td className="px-2 py-2 capitalize">{c.status}</td>
                    <td className="px-2 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => openDetail(c)} className="text-primary hover:underline">View</button>
                        {c.status !== "applied" && (
                          <button onClick={() => startApply(c)} className="font-medium text-amber-700 hover:underline">Apply to All</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold">{selected.name}</h3>
              <p className="text-sm text-muted-foreground">{selected.category_name} · {formatCurrency(selected.amount)} · {selected.charge_date}</p>
            </div>
            {selected.status !== "applied" && (
              <button onClick={() => startApply(selected)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                <Sparkles className="h-4 w-4" /> Apply to All Families
              </button>
            )}
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border/60 p-3"><p className="text-xs text-muted-foreground">Families charged</p><p className="text-lg font-semibold">{selected.families_charged}</p></div>
            <div className="rounded-lg border border-border/60 p-3"><p className="text-xs text-muted-foreground">Total generated</p><p className="text-lg font-semibold">{formatCurrency(selected.total_amount_generated)}</p></div>
            <div className="rounded-lg border border-border/60 p-3"><p className="text-xs text-muted-foreground">Collected</p><p className="text-lg font-semibold text-emerald-700">{formatCurrency(selected.total_collected)}</p></div>
            <div className="rounded-lg border border-border/60 p-3"><p className="text-xs text-muted-foreground">Outstanding</p><p className="text-lg font-semibold text-amber-700">{formatCurrency(selected.total_outstanding)}</p></div>
          </div>
          {selected.families && selected.families.length > 0 && (
            <div className="max-h-64 overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-2 py-2">Family</th>
                    <th className="px-2 py-2">Due</th>
                    <th className="px-2 py-2">Paid</th>
                    <th className="px-2 py-2">Remaining</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.families.map((f) => (
                    <tr key={f.family_id} className="border-b border-border/60">
                      <td className="px-2 py-2">{f.family_number} — {f.family_name}</td>
                      <td className="px-2 py-2">{formatCurrency(f.amount_due)}</td>
                      <td className="px-2 py-2">{formatCurrency(f.amount_paid)}</td>
                      <td className="px-2 py-2">{formatCurrency(f.remaining)}</td>
                      <td className="px-2 py-2 capitalize">{f.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button onClick={() => setSelected(null)} className="mt-4 text-sm text-muted-foreground hover:underline">Close detail</button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmApply}
        title="Apply Festival Charge?"
        message={preview && confirmApply
          ? `${confirmApply.category_name}\nAmount: ${formatCurrency(confirmApply.amount)}\nApplicable families: ${preview.applicable_families}\nTotal charge: ${formatCurrency(preview.total_charge)}\n\nThis will create an outstanding charge for all applicable families.`
          : "Apply this festival charge to all applicable families?"}
        confirmLabel={saving ? "Applying…" : "Apply to All Families"}
        variant="primary"
        onConfirm={doApply}
        onCancel={() => { setConfirmApply(null); setPreview(null) }}
      />
    </div>
  )
}
