import { useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { fcApi } from "@/lib/family-contributions-api"
import type { Category, Settings } from "@/lib/family-contributions-types"
import { formatCategoryOptionLabel } from "@/lib/family-contributions-utils"
import { formatCurrency } from "@/lib/family-contributions-types"
import { useToast } from "@/components/family-contributions/Toast"

export default function SettingsPage() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [newCategory, setNewCategory] = useState({ name: "", slug: "", category_type: "festival", is_monthly: false, is_fixed: false, default_amount: 0, minimum_amount: 0 })

  const [loadError, setLoadError] = useState(false)

  const load = async () => {
    try {
      setLoadError(false)
      const [s, c] = await Promise.all([fcApi.getSettings(), fcApi.getCategories()])
      setSettings(s)
      setCategories(c)
    } catch {
      setLoadError(true)
      toast("error", "Failed to load settings")
    }
  }

  useEffect(() => { load() }, [])

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settings) return
    try {
      await fcApi.updateSettings(settings)
      toast("success", "Settings saved — new rates apply from effective date")
      load()
    } catch {
      toast("error", "Failed to save settings")
    }
  }

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const slug = newCategory.slug || newCategory.name.toLowerCase().replace(/\s+/g, "-")
      await fcApi.createCategory({ ...newCategory, slug, is_active: true })
      toast("success", "Category added")
      setNewCategory({ name: "", slug: "", category_type: "festival", is_monthly: false, is_fixed: false, default_amount: 0, minimum_amount: 0 })
      load()
    } catch {
      toast("error", "Failed to add category")
    }
  }

  if (loadError) return <p className="text-sm text-destructive">Could not load settings. Check that the backend is running.</p>
  if (!settings) return <div className="h-40 animate-pulse rounded-xl bg-muted" />

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
      <form onSubmit={saveSettings} className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Contribution Settings</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm md:col-span-2">
            <span>Masavari Amount (global — same for every family)</span>
            <input type="number" value={settings.masavari_amount} onChange={(e) => setSettings({ ...settings, masavari_amount: Number(e.target.value) })} className="w-full rounded-lg border border-border bg-background px-3 py-2" />
            <p className="text-xs text-muted-foreground">Each active family receives this amount every month. Changes apply from the effective date forward — past months are not changed.</p>
          </label>
          <label className="space-y-1 text-sm"><span>Festival 1 Minimum</span><input type="number" value={settings.festival_1_minimum} onChange={(e) => setSettings({ ...settings, festival_1_minimum: Number(e.target.value) })} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
          <label className="space-y-1 text-sm"><span>Festival 2 Minimum</span><input type="number" value={settings.festival_2_minimum} onChange={(e) => setSettings({ ...settings, festival_2_minimum: Number(e.target.value) })} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
          <label className="space-y-1 text-sm"><span>Festival 3 Minimum</span><input type="number" value={settings.festival_3_minimum} onChange={(e) => setSettings({ ...settings, festival_3_minimum: Number(e.target.value) })} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span>DRF Amount (global — annual contribution)</span>
            <input type="number" value={settings.drf_amount} onChange={(e) => setSettings({ ...settings, drf_amount: Number(e.target.value) })} className="w-full rounded-lg border border-border bg-background px-3 py-2" />
            <p className="text-xs text-muted-foreground">Each active family receives one DRF charge per calendar year. Changes apply to newly generated years only — existing annual dues are not changed.</p>
          </label>
          <label className="space-y-1 text-sm"><span>Financial Year</span><input value={settings.financial_year} onChange={(e) => setSettings({ ...settings, financial_year: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
          <label className="space-y-1 text-sm"><span>Receipt Prefix</span><input value={settings.receipt_prefix} onChange={(e) => setSettings({ ...settings, receipt_prefix: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
          <label className="space-y-1 text-sm"><span>Effective Date</span><input type="date" value={settings.amount_effective_from?.slice(0, 10) || ""} onChange={(e) => setSettings({ ...settings, amount_effective_from: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.partial_payment_allowed} onChange={(e) => setSettings({ ...settings, partial_payment_allowed: e.target.checked })} />Allow Partial Payments</label>
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">Save Settings</button>
      </form>

      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="font-semibold mb-2">Current Rates</h3>
          <p className="text-sm text-muted-foreground">Masavari: {formatCurrency(settings.masavari_amount)}</p>
          <p className="text-sm text-muted-foreground">DRF: {formatCurrency(settings.drf_amount)} / year</p>
          <p className="text-sm text-muted-foreground">FY: {settings.financial_year}</p>
        </div>

        <form onSubmit={addCategory} className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          <h3 className="font-semibold">Add Category</h3>
          <input required value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} placeholder="Category Name" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <input value={newCategory.slug} onChange={(e) => setNewCategory({ ...newCategory, slug: e.target.value })} placeholder="Slug (auto)" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <select value={newCategory.category_type} onChange={(e) => setNewCategory({ ...newCategory, category_type: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="monthly">Monthly</option>
            <option value="festival">Festival</option>
            <option value="relief">Relief</option>
          </select>
          <button type="submit" className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm"><Plus className="h-4 w-4" />Add Category</button>
        </form>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="font-semibold mb-2">Categories ({categories.length})</h3>
          <ul className="space-y-1 text-sm">
            {categories.map((c) => (
              <li key={c.id} className="flex justify-between rounded-lg border border-border/60 px-3 py-2">
                <span>{formatCategoryOptionLabel(c, settings)}</span>
                <span className="text-muted-foreground">{c.category_type}{c.is_monthly ? " · monthly" : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
