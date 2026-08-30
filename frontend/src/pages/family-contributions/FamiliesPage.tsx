import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Eye, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { fcApi } from "@/lib/family-contributions-api"
import type { Family } from "@/lib/family-contributions-types"
import { useToast } from "@/components/family-contributions/Toast"
import { ConfirmDialog } from "@/components/family-contributions/ConfirmDialog"
import { formatFamilyLabel } from "@/lib/family-contributions-utils"

const emptyForm = {
  family_number: "",
  head_of_family: "",
  house_name: "",
  address: "",
  ward: "",
  phone: "",
  email: "",
  members_count: 1,
  joining_date: new Date().toISOString().slice(0, 10),
  status: "Active",
  remarks: "",
}

export default function FamiliesPage() {
  const { toast } = useToast()
  const [families, setFamilies] = useState<Family[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("All")
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await fcApi.getFamilies({ search, status, page, page_size: 12 })
      setFamilies(data.items)
      setTotal(data.total)
    } catch {
      toast("error", "Failed to load families")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [page, search, status])

  const prepareNewFamily = async () => {
    try {
      const next = await fcApi.getNextFamilyNumber()
      setForm({ ...emptyForm, family_number: next.family_number, head_of_family: next.head_of_family })
      setEditingId(null)
    } catch {
      setForm(emptyForm)
      setEditingId(null)
    }
  }

  useEffect(() => {
    if (!editingId) prepareNewFamily()
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingId) {
        await fcApi.updateFamily(editingId, form)
        toast("success", "Family updated")
      } else {
        await fcApi.createFamily(form)
        toast("success", "Family added")
      }
      setForm(emptyForm)
      setEditingId(null)
      prepareNewFamily()
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed to save family"
      toast("error", String(msg))
    }
  }

  const edit = (family: Family) => {
    setEditingId(family.id)
    setForm({
      family_number: family.family_number,
      head_of_family: family.head_of_family,
      house_name: family.house_name,
      address: family.address,
      ward: family.ward,
      phone: family.phone,
      email: family.email,
      members_count: family.members_count,
      joining_date: family.joining_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      status: family.status,
      remarks: family.remarks,
    })
  }

  const remove = async () => {
    if (!deleteId) return
    try {
      await fcApi.deleteFamily(deleteId)
      toast("success", "Family removed")
      setDeleteId(null)
      load()
    } catch {
      toast("error", "Failed to delete family")
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 12))

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-lg font-semibold">Family Directory</h2>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search..." className="w-36 bg-transparent outline-none" />
            </label>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="All">All</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-2">Family</th>
                  <th className="px-2 py-2">Head</th>
                  <th className="px-2 py-2">Ward</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {families.map((f) => (
                  <tr key={f.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="px-2 py-2 font-medium">{formatFamilyLabel(f)}</td>
                    <td className="px-2 py-2">{f.head_of_family !== f.family_number ? f.head_of_family : "—"}</td>
                    <td className="px-2 py-2">{f.ward || "—"}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${f.status === "Active" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>{f.status}</span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        <Link to={`/family-contributions/families/${f.id}`} className="rounded-lg border border-border p-1.5 text-primary" title="View details"><Eye className="h-4 w-4" /></Link>
                        <button onClick={() => edit(f)} className="rounded-lg border border-border p-1.5"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => setDeleteId(f.id)} className="rounded-lg border border-border p-1.5 text-destructive"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} families</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-border px-3 py-1 disabled:opacity-40">Prev</button>
            <span>{page}/{totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-border px-3 py-1 disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>

      <form onSubmit={save} className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3 h-fit">
        <h2 className="text-lg font-semibold">{editingId ? "Edit Family" : "Add Family"}</h2>
        <input
          required
          value={form.family_number}
          onChange={(e) => {
            const family_number = e.target.value
            setForm((prev) => ({
              ...prev,
              family_number,
              head_of_family: !prev.head_of_family || prev.head_of_family === prev.family_number ? family_number : prev.head_of_family,
            }))
          }}
          placeholder="Family 1"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <input required value={form.head_of_family} onChange={(e) => setForm({ ...form, head_of_family: e.target.value })} placeholder="Head of Family (optional — defaults to family name)" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        <input value={form.house_name} onChange={(e) => setForm({ ...form, house_name: e.target.value })} placeholder="House Name" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" className="w-full min-h-16 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <input value={form.ward} onChange={(e) => setForm({ ...form, ward: e.target.value })} placeholder="Ward" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <input type="number" value={form.members_count} onChange={(e) => setForm({ ...form, members_count: Number(e.target.value) })} placeholder="Members" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <input type="date" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Remarks" className="w-full min-h-16 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <button type="submit" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
            <Plus className="h-4 w-4" />{editingId ? "Save" : "Add Family"}
          </button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); prepareNewFamily() }} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>}
        </div>
      </form>

      <ConfirmDialog open={!!deleteId} title="Delete Family" message="This will soft-delete the family. Continue?" onConfirm={remove} onCancel={() => setDeleteId(null)} />
    </div>
  )
}
