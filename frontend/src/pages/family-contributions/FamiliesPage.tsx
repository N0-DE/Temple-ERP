import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import {
  Eye,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
  Users,
  MapPin,
  Phone,
  Home,
  UserCheck,
  Calendar,
  Loader2,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  Wallet,
} from "lucide-react"
import { fcApi } from "@/lib/family-contributions-api"
import type { Family } from "@/lib/family-contributions-types"
import { useToast } from "@/components/family-contributions/Toast"
import { ConfirmDialog } from "@/components/family-contributions/ConfirmDialog"
import { formatFamilyLabel } from "@/lib/family-contributions-utils"
import { HighlightMatch } from "@/lib/search-utils"
import { cn } from "@/lib/utils"

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
  const formRef = useRef<HTMLDivElement>(null)
  const headInputRef = useRef<HTMLInputElement>(null)
  const [families, setFamilies] = useState<Family[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("All")
  const [ward, setWard] = useState("All")
  const [wardOptions, setWardOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Fetch unique wards for filter
  useEffect(() => {
    fcApi
      .getFamilies({ page: 1, page_size: 100 })
      .then((data) => {
        const wards = Array.from(
          new Set(data.items.map((f) => f.ward?.trim()).filter(Boolean) as string[]),
        ).sort()
        setWardOptions(wards)
      })
      .catch(() => {})
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page, page_size: 10 }
      if (search.trim()) params.search = search.trim()
      if (status !== "All") params.status = status
      if (ward !== "All") params.ward = ward
      const data = await fcApi.getFamilies(params)
      setFamilies(data.items)
      setTotal(data.total)
    } catch {
      toast("error", "Failed to load families")
    } finally {
      setLoading(false)
    }
  }

  // Debounced search & filter reload
  useEffect(() => {
    const timer = setTimeout(() => {
      load()
    }, 200)
    return () => clearTimeout(timer)
  }, [page, search, status, ward])

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

  const startNewFamily = () => {
    setEditingId(null)
    prepareNewFamily()
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    setTimeout(() => headInputRef.current?.focus(), 150)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editingId) {
        await fcApi.updateFamily(editingId, form)
        toast("success", "Family updated successfully")
      } else {
        await fcApi.createFamily(form)
        toast("success", "Family registered successfully")
      }
      setForm(emptyForm)
      setEditingId(null)
      prepareNewFamily()
      load()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed to save family"
      toast("error", String(msg))
    } finally {
      setSaving(false)
    }
  }

  const edit = (family: Family) => {
    setEditingId(family.id)
    setForm({
      family_number: family.family_number,
      head_of_family: family.head_of_family,
      house_name: family.house_name || "",
      address: family.address || "",
      ward: family.ward || "",
      phone: family.phone || "",
      email: family.email || "",
      members_count: family.members_count || 1,
      joining_date: family.joining_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      status: family.status || "Active",
      remarks: family.remarks || "",
    })
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    setTimeout(() => headInputRef.current?.focus(), 150)
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

  const totalPages = Math.max(1, Math.ceil(total / 10))
  const isFiltered = Boolean(search.trim() || status !== "All" || ward !== "All")

  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
      {/* ── LEFT COLUMN: Family Directory & Search ── */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-xs flex flex-col justify-between">
        <div className="space-y-4">
          {/* Header & Primary Add Action */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Family Directory
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {total} registered
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Browse, search, and manage registered temple families.
              </p>
            </div>

            <button
              type="button"
              onClick={startNewFamily}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs cursor-pointer shrink-0 self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Family
            </button>
          </div>

          {/* Search Bar & Multi-Criteria Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Search by family #, head of family, house, phone, or ward..."
                className="w-full rounded-xl border border-input bg-background/90 py-2 pl-9 pr-9 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-xs"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("")
                    setPage(1)
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground cursor-pointer rounded"
                  title="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
              className="rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-xs cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active only</option>
              <option value="Inactive">Inactive only</option>
            </select>

            {/* Ward Filter */}
            {wardOptions.length > 0 && (
              <select
                value={ward}
                onChange={(e) => {
                  setWard(e.target.value)
                  setPage(1)
                }}
                className="rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-xs cursor-pointer max-w-[140px]"
              >
                <option value="All">All Wards</option>
                {wardOptions.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Active Filter Summary Bar */}
          {isFiltered && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-lg border border-border/60">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Showing {families.length} of {total} families
                </span>
                {search && (
                  <span className="inline-flex items-center gap-1 bg-background px-2 py-0.5 rounded border border-border text-[11px]">
                    Query: "{search}"
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="hover:text-foreground cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {status !== "All" && (
                  <span className="inline-flex items-center gap-1 bg-background px-2 py-0.5 rounded border border-border text-[11px]">
                    Status: {status}
                    <button
                      type="button"
                      onClick={() => setStatus("All")}
                      className="hover:text-foreground cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {ward !== "All" && (
                  <span className="inline-flex items-center gap-1 bg-background px-2 py-0.5 rounded border border-border text-[11px]">
                    Ward: {ward}
                    <button
                      type="button"
                      onClick={() => setWard("All")}
                      className="hover:text-foreground cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearch("")
                  setStatus("All")
                  setWard("All")
                  setPage(1)
                }}
                className="text-primary hover:underline font-medium inline-flex items-center gap-1 cursor-pointer text-xs shrink-0"
              >
                <X className="w-3 h-3" />
                Clear all filters
              </button>
            </div>
          )}

          {/* Families Table */}
          {loading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/60" />
              ))}
            </div>
          ) : families.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground bg-muted/20 rounded-2xl border border-dashed border-border/80 p-8">
              <Users className="w-10 h-10 mx-auto mb-2 text-muted-foreground/60" />
              <p className="text-base font-semibold text-foreground">No families found</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {isFiltered
                  ? "No registered family matched your search or filter criteria."
                  : "No family records registered yet. Create one using the form."}
              </p>
              {isFiltered ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("")
                    setStatus("All")
                    setWard("All")
                    setPage(1)
                  }}
                  className="mt-4 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  Reset all filters
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startNewFamily}
                  className="mt-4 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Register First Family
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="min-w-full text-xs text-left">
                <thead className="bg-secondary/60 border-b border-border text-muted-foreground uppercase text-[11px] font-semibold tracking-wider">
                  <tr>
                    <th className="px-3.5 py-3">Family #</th>
                    <th className="px-3.5 py-3">Head & House</th>
                    <th className="px-3.5 py-3">Ward</th>
                    <th className="px-3.5 py-3">Contact</th>
                    <th className="px-3.5 py-3">Status</th>
                    <th className="px-3.5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {families.map((f) => {
                    const isSelected = f.id === editingId
                    return (
                      <tr
                        key={f.id}
                        className={cn(
                          "transition-colors",
                          isSelected
                            ? "bg-primary/10 ring-1 ring-inset ring-primary/40 font-medium"
                            : "hover:bg-muted/40",
                        )}
                      >
                        <td className="px-3.5 py-3 font-mono font-bold text-primary">
                          <HighlightMatch text={formatFamilyLabel(f)} query={search} />
                        </td>
                        <td className="px-3.5 py-3 text-foreground font-medium">
                          <div className="truncate max-w-[160px]">
                            <HighlightMatch
                              text={f.head_of_family !== f.family_number ? f.head_of_family : "—"}
                              query={search}
                            />
                          </div>
                          {f.house_name && (
                            <div className="text-[11px] text-muted-foreground font-normal truncate max-w-[160px]">
                              <HighlightMatch text={f.house_name} query={search} />
                            </div>
                          )}
                        </td>
                        <td className="px-3.5 py-3 text-muted-foreground">
                          {f.ward ? (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-secondary text-foreground">
                              <MapPin className="w-3 h-3 text-muted-foreground" />
                              <HighlightMatch text={f.ward} query={search} />
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3.5 py-3 text-muted-foreground text-[11px]">
                          {f.phone ? (
                            <a
                              href={`tel:${f.phone}`}
                              className="inline-flex items-center gap-1 text-foreground hover:text-primary transition-colors"
                            >
                              <Phone className="w-3 h-3 text-muted-foreground" />
                              <HighlightMatch text={f.phone} query={search} />
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3.5 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                              f.status === "Active"
                                ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-600 border border-amber-500/20",
                            )}
                          >
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                f.status === "Active" ? "bg-emerald-500" : "bg-amber-500",
                              )}
                            />
                            {f.status}
                          </span>
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              to={`/family-contributions/contributions?familyId=${f.id}`}
                              className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                              title="Record contribution payment"
                            >
                              <Wallet className="h-3.5 w-3.5" />
                            </Link>
                            <Link
                              to={`/family-contributions/families/${f.id}`}
                              className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
                              title="View details & ledger"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => edit(f)}
                              className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                              title="Edit family profile"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteId(f.id)}
                              className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                              title="Delete family"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination & Count */}
        <div className="mt-4 pt-3 border-t border-border/70 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {families.length} of {total} families
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-border px-3 py-1 font-medium hover:bg-secondary transition-colors disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <span className="font-mono text-xs font-semibold px-2">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-border px-3 py-1 font-medium hover:bg-secondary transition-colors disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ── RIGHT COLUMN: Clean, Labeled Add/Edit Family Form ── */}
      <div ref={formRef} className="rounded-2xl border border-border bg-card p-5 shadow-xs h-fit space-y-4">
        {/* Form Title & Context Banner */}
        <div className="flex items-center justify-between border-b border-border/70 pb-3">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              {editingId ? (
                <>
                  <Pencil className="w-4 h-4 text-primary" />
                  Edit Family Profile
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-primary" />
                  Add New Family
                </>
              )}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {editingId ? "Update existing family membership details." : "Register a new family in the temple ledger."}
            </p>
          </div>

          {editingId ? (
            <button
              type="button"
              onClick={startNewFamily}
              className="text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-lg border border-border hover:bg-secondary transition-colors flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Cancel Edit
            </button>
          ) : (
            <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
              #{form.family_number || "Auto"}
            </span>
          )}
        </div>

        {editingId && (
          <div className="rounded-xl bg-primary/10 border border-primary/20 px-3.5 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <Pencil className="w-4 h-4 shrink-0" />
              <span>Editing #{form.family_number} — {form.head_of_family || "No name"}</span>
            </div>
            <button
              type="button"
              onClick={startNewFamily}
              className="text-xs text-muted-foreground hover:text-foreground font-medium underline cursor-pointer shrink-0"
            >
              Cancel & Add New
            </button>
          </div>
        )}

        <form onSubmit={save} className="space-y-4">
          {/* Section 1: Identification */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-primary" />
              Identification
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Family Number / ID <span className="text-destructive">*</span>
                </label>
                <input
                  required
                  value={form.family_number}
                  onChange={(e) => {
                    const family_number = e.target.value
                    setForm((prev) => ({
                      ...prev,
                      family_number,
                      head_of_family:
                        !prev.head_of_family || prev.head_of_family === prev.family_number
                          ? family_number
                          : prev.head_of_family,
                    }))
                  }}
                  placeholder="e.g. Family 1"
                  className="w-full rounded-xl border border-input bg-background/80 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Head of Family <span className="text-destructive">*</span>
                </label>
                <input
                  ref={headInputRef}
                  required
                  value={form.head_of_family}
                  onChange={(e) => setForm({ ...form, head_of_family: e.target.value })}
                  placeholder="Primary contact name"
                  className="w-full rounded-xl border border-input bg-background/80 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-xs"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Contact & Location */}
          <div className="space-y-3 pt-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5 text-primary" />
              Location & Contact
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">House Name</label>
                <input
                  value={form.house_name}
                  onChange={(e) => setForm({ ...form, house_name: e.target.value })}
                  placeholder="e.g. Sree Nilayam"
                  className="w-full rounded-xl border border-input bg-background/80 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Ward / Area</label>
                <input
                  value={form.ward}
                  onChange={(e) => setForm({ ...form, ward: e.target.value })}
                  placeholder="Ward or zone"
                  className="w-full rounded-xl border border-input bg-background/80 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Phone Number</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 9876543210"
                  className="w-full rounded-xl border border-input bg-background/80 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Email Address</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="name@example.com"
                  className="w-full rounded-xl border border-input bg-background/80 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Residential Address</label>
              <textarea
                rows={2}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Full residential street address..."
                className="w-full rounded-xl border border-input bg-background/80 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-xs resize-none"
              />
            </div>
          </div>

          {/* Section 3: Membership & Meta */}
          <div className="space-y-3 pt-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              Membership & Status
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Members</label>
                <input
                  type="number"
                  min={1}
                  value={form.members_count}
                  onChange={(e) => setForm({ ...form, members_count: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-full rounded-xl border border-input bg-background/80 px-3 py-2 text-xs text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Joining Date</label>
                <input
                  type="date"
                  value={form.joining_date}
                  onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
                  className="w-full rounded-xl border border-input bg-background/80 px-3 py-2 text-xs text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-xs cursor-pointer"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Remarks / Notes</label>
              <textarea
                rows={2}
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                placeholder="Optional notes or references..."
                className="w-full rounded-xl border border-input bg-background/80 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-xs resize-none"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/70">
            <button
              type="button"
              onClick={startNewFamily}
              className="px-4 py-2 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs disabled:opacity-60 cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : editingId ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              {saving ? "Saving..." : editingId ? "Update Family" : "Register Family"}
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Family Record"
        message="Are you sure you want to delete this family? Their past transaction ledger entries will remain preserved."
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
