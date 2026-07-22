import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { getPoojas, addPooja, updatePooja, deletePooja, type Pooja } from "./firestore"

const MOCK_POOJAS: Pooja[] = [
  { id: "1", name: "Ganapathi Homam", description: "Removes obstacles and brings prosperity", amount: 1500, duration_minutes: 45, category: "Homam" },
  { id: "2", name: "Archana", description: "Basic floral offering to the deity", amount: 100, duration_minutes: 5, category: "General" },
  { id: "3", name: "Navagraha Shanti", description: "Pacifies the nine planetary influences", amount: 2500, duration_minutes: 60, category: "Special" },
  { id: "4", name: "Satyanarayana Pooja", description: "Thanksgiving pooja for blessings received", amount: 800, duration_minutes: 90, category: "General" },
  { id: "5", name: "Lakshmi Archana", description: "For wealth and abundance", amount: 500, duration_minutes: 15, category: "Special" },
  { id: "6", name: "Karthika Deepam", description: "Festival of lights offering", amount: 300, duration_minutes: 30, category: "Festival" },
]

type PoojaFormData = Omit<Pooja, "id">

type PoojasContextValue = {
  poojas: Pooja[]
  loading: boolean
  addPoojaEntry: (data: PoojaFormData) => Promise<void>
  editPoojaEntry: (id: string, data: PoojaFormData) => Promise<void>
  removePoojaEntry: (id: string) => Promise<void>
}

const PoojasContext = createContext<PoojasContextValue | null>(null)

export function PoojasProvider({ children }: { children: ReactNode }) {
  const [poojas, setPoojas] = useState<Pooja[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Loaded once for the app's whole session — navigating between pages no
    // longer re-fetches the catalog or re-shows a loading spinner.
    let cancelled = false
    void (async () => {
      try {
        const data = await getPoojas()
        if (!cancelled) setPoojas(data)
      } catch {
        // Firebase not configured yet — use mock data
        if (!cancelled) setPoojas(MOCK_POOJAS)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const addPoojaEntry = async (data: PoojaFormData) => {
    try {
      const newPooja = await addPooja(data)
      setPoojas((prev) => [...prev, newPooja])
    } catch {
      // Keep the screen responsive if Firestore is offline, blocked by rules, or slow.
      setPoojas((prev) => [...prev, { id: Date.now().toString(), ...data }])
    }
  }

  const editPoojaEntry = async (id: string, data: PoojaFormData) => {
    try {
      await updatePooja(id, data)
    } catch { /* offline fallback */ }
    setPoojas((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)))
  }

  const removePoojaEntry = async (id: string) => {
    try {
      await deletePooja(id)
    } catch { /* offline fallback */ }
    setPoojas((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <PoojasContext.Provider value={{ poojas, loading, addPoojaEntry, editPoojaEntry, removePoojaEntry }}>
      {children}
    </PoojasContext.Provider>
  )
}

export function usePoojas() {
  const ctx = useContext(PoojasContext)
  if (!ctx) throw new Error("usePoojas must be used within a PoojasProvider")
  return ctx
}
