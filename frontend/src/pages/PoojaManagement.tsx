import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Search, Pencil, Trash2, X, Loader2 } from "lucide-react"
import { type Pooja } from "@/lib/firestore"
import { usePoojas } from "@/lib/poojas-context"
import { BookingModal } from "@/components/BookingModal"
import { translateCategory, useLanguage } from "@/lib/language-context"

const CATEGORIES = ["All", "Homam", "General", "Special", "Festival"]
const FORM_CATEGORIES = ["Homam", "General", "Special", "Festival"]

type PoojaFormData = Omit<Pooja, "id">

const emptyForm: PoojaFormData = {
  name: "",
  description: "",
  amount: 0,
  duration_minutes: 30,
  category: "General",
}

function PoojaFormModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: Pooja
  onClose: () => void
  onSave: (data: PoojaFormData) => Promise<void>
}) {
  const { t } = useLanguage()
  const [form, setForm] = useState<PoojaFormData>(
    initial ? { name: initial.name, description: initial.description, amount: initial.amount, duration_minutes: initial.duration_minutes, category: initial.category } : emptyForm
  )
  const [saving, setSaving] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: name === "amount" || name === "duration_minutes" ? Number(value) : value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 sm:p-6 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="pointer-events-auto w-full max-w-lg max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto bg-card border border-border shadow-xl rounded-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pooja-form-title"
        >
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 id="pooja-form-title" className="text-xl font-bold">{initial ? t("editPooja") : t("addNewPooja")}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("poojaName")}</label>
            <input required name="name" value={form.name} onChange={handleChange} className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("description")}</label>
            <textarea name="description" value={form.description} onChange={handleChange} rows={2} className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("amountInr")}</label>
              <input required type="number" name="amount" value={form.amount} onChange={handleChange} min={0} className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("durationMins")}</label>
              <input type="number" name="duration_minutes" value={form.duration_minutes} onChange={handleChange} min={1} className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("category")}</label>
            <select name="category" value={form.category} onChange={handleChange} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
              {FORM_CATEGORIES.map((c) => (
                <option key={c} value={c}>{translateCategory(t, c)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary transition-colors">{t("cancel")}</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {initial ? t("saveChanges") : t("addPooja")}
            </button>
          </div>
        </form>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

function DeleteConfirm({ name, onCancel, onConfirm, loading }: { name: string; onCancel: () => void; onConfirm: () => void; loading: boolean }) {
  const { t } = useLanguage()
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40" onClick={onCancel} />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-card border border-border shadow-xl rounded-2xl z-50 p-6 text-center"
      >
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <Trash2 className="w-6 h-6 text-destructive" />
        </div>
        <h3 className="text-lg font-bold mb-1">{t("deletePooja")}</h3>
        <p className="text-muted-foreground text-sm mb-6">{t("deletePoojaConfirm", { name })}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors">{t("cancel")}</button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("delete")}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export default function PoojaManagement() {
  const { t } = useLanguage()
  const { poojas, loading, addPoojaEntry, editPoojaEntry, removePoojaEntry } = usePoojas()
  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState("All")
  const [showAddModal, setShowAddModal] = useState(false)
  const [editPooja, setEditPooja] = useState<Pooja | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Pooja | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedPooja, setSelectedPooja] = useState<Pooja | null>(null)

  const filtered = poojas.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase())
    const matchCat = activeCategory === "All" || p.category === activeCategory
    return matchSearch && matchCat
  })

  const handleAdd = async (data: PoojaFormData) => {
    await addPoojaEntry(data)
  }

  const handleEdit = async (data: PoojaFormData) => {
    if (!editPooja?.id) return
    await editPoojaEntry(editPooja.id, data)
  }

  const handleDelete = async () => {
    if (!deleteTarget?.id) return
    setDeleting(true)
    await removePoojaEntry(deleteTarget.id)
    setDeleting(false)
    setDeleteTarget(null)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 max-w-6xl mx-auto"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("poojaManagement")}</h1>
          <p className="text-muted-foreground mt-1">{t("poojaManagementSubtitle", { count: poojas.length })}</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm self-start"
        >
          <Plus className="w-4 h-4" />
          {t("addPooja")}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={t("searchPoojaPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-xl flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${activeCategory === cat ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {translateCategory(t, cat)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-lg font-medium">{t("noPoojasFound")}</p>
          <p className="text-sm mt-1">{t("tryDifferentSearch")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((pooja, i) => (
            <motion.div
              key={pooja.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -4 }}
              className="group relative bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full -z-10 group-hover:bg-primary/10 transition-colors" />

              <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setEditPooja(pooja)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-secondary hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDeleteTarget(pooja)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-secondary hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex justify-between items-start mb-4 pr-16">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
                  {translateCategory(t, pooja.category)}
                </span>
                <span className="font-bold text-xl text-foreground">₹{pooja.amount.toLocaleString()}</span>
              </div>

              <h3 className="text-lg font-bold mb-1">{pooja.name}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2 mb-6">{pooja.description}</p>

              <div className="flex items-center justify-between pt-4 border-t border-border/50">
                <span className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{pooja.duration_minutes}</span> {t("mins")}
                </span>
                <button
                  onClick={() => setSelectedPooja(pooja)}
                  className="text-sm font-semibold text-white bg-primary px-4 py-1.5 rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
                >
                  {t("bookNow")}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {showAddModal && <PoojaFormModal onClose={() => setShowAddModal(false)} onSave={handleAdd} />}
      {editPooja && <PoojaFormModal initial={editPooja} onClose={() => setEditPooja(null)} onSave={handleEdit} />}
      {deleteTarget && (
        <DeleteConfirm
          name={deleteTarget.name}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          loading={deleting}
        />
      )}
      {selectedPooja && (
        <BookingModal
          isOpen={!!selectedPooja}
          onClose={() => setSelectedPooja(null)}
          poojaName={selectedPooja.name}
          amount={selectedPooja.amount}
        />
      )}
    </motion.div>
  )
}
