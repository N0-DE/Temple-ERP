import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { getBookings, getOfflineBookings, subscribeToBookings, getBookingStats, syncOfflineBookings, syncStoredCounterBalance, type Booking, type BookingStats } from "./firestore"
import { getLocalDateString, getOffsetDateString } from "./date-utils"

const EMPTY_STATS: BookingStats = { totalCollection: 0, todayCollection: 0, monthCollection: 0, pendingCollection: 0 }

// Stats are cheap but not free (server-side aggregation, no local cache
// support) — this TTL stops a rapid page switch from re-running all 4
// aggregate queries every single time.
const STATS_TTL_MS = 30_000

const MOCK_BOOKINGS: Booking[] = []

type BookingsContextValue = {
  bookings: Booking[]
  loading: boolean
  hasMore: boolean
  loadingMore: boolean
  loadOlderBookings: () => Promise<void>
  stats: BookingStats
  refreshStats: () => Promise<void>
  applyOptimisticStatus: (id: string, status: Booking["status"]) => void
}

const BookingsContext = createContext<BookingsContextValue | null>(null)

export function BookingsProvider({ children }: { children: ReactNode }) {
  // `liveBookings` is the bounded, real-time page (most recent N bookings —
  // stays fast no matter how large the collection grows). `olderBookings` is
  // filled in on demand when the user clicks "Load older records".
  const [liveBookings, setLiveBookings] = useState<Booking[]>([])
  const [olderBookings, setOlderBookings] = useState<Booking[]>([])
  const [cursor, setCursor] = useState<null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<BookingStats>(EMPTY_STATS)
  const [offlineBookings, setOfflineBookings] = useState<Booking[]>(getOfflineBookings)
  const lastStatsFetch = useRef(0)

  const refreshStats = async (force = false) => {
    const now = Date.now()
    if (!force && now - lastStatsFetch.current < STATS_TTL_MS) return
    lastStatsFetch.current = now
    try {
      const today = getLocalDateString()
      const monthAgo = getOffsetDateString(-30)
      setStats(await getBookingStats(today, monthAgo))
    } catch {
      // Offline or index not built yet — keep last known values.
    }
  }

  const loadOlderBookings = async () => {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await getBookings(cursor)
      setOlderBookings((prev) => [...prev, ...page.bookings])
      setCursor(page.cursor)
      setHasMore(page.hasMore)
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    // Mounted once for the app's whole session (see App.tsx) — navigating
    // between pages no longer tears down and recreates this listener or
    // re-runs the aggregate stat queries, which is what was causing the lag
    // when switching pages.
    let cancelled = false

    // One-shot call purely to seed the pagination cursor for "load older
    // records" — the live listener below doesn't hand back a cursor.
    void (async () => {
      try {
        const page = await getBookings()
        if (cancelled) return
        setCursor(page.cursor)
        setHasMore(page.hasMore)
      } catch {
        /* live listener below still works even if this fails */
      }
    })()

    const unsubscribe = subscribeToBookings(
      (data) => {
        setLiveBookings(data)
        setLoading(false)
        // The local SQLite store notifies this listener after every write.
        // Refresh the summary cards at the same time so they always match
        // the settlement table.
        void refreshStats(true)
      },
      () => {
        // Firebase not configured / offline — fall back to mock data once.
        setLiveBookings((prev) => (prev.length ? prev : MOCK_BOOKINGS))
        setLoading(false)
      },
    )

    void refreshStats(true)

    const syncLocalData = () => {
      void syncOfflineBookings().finally(() => setOfflineBookings(getOfflineBookings()))
      void syncStoredCounterBalance()
    }
    const refreshOfflineBookings = () => setOfflineBookings(getOfflineBookings())
    window.addEventListener("online", syncLocalData)
    window.addEventListener("temple-erp-offline-data-changed", refreshOfflineBookings)
    syncLocalData()

    return () => {
      cancelled = true
      unsubscribe()
      window.removeEventListener("online", syncLocalData)
      window.removeEventListener("temple-erp-offline-data-changed", refreshOfflineBookings)
    }
  }, [])

  // Merge the live recent page with any older pages the user has loaded,
  // de-duplicating in case a record appears in both.
  const bookings = useMemo(() => {
    const seen = new Set(liveBookings.map((b) => b.id))
    const syncedBookings = [...liveBookings, ...olderBookings.filter((b) => !seen.has(b.id))]
    const syncedIds = new Set(syncedBookings.map((b) => b.id))
    return [...offlineBookings.filter((b) => !syncedIds.has(b.id)), ...syncedBookings]
  }, [liveBookings, olderBookings, offlineBookings])

  const applyOptimisticStatus = (id: string, status: Booking["status"]) => {
    setLiveBookings((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)))
    setOlderBookings((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)))
  }

  const value: BookingsContextValue = {
    bookings,
    loading,
    hasMore,
    loadingMore,
    loadOlderBookings,
    stats,
    refreshStats: () => refreshStats(true),
    applyOptimisticStatus,
  }

  return <BookingsContext.Provider value={value}>{children}</BookingsContext.Provider>
}

export function useBookings() {
  const ctx = useContext(BookingsContext)
  if (!ctx) throw new Error("useBookings must be used within a BookingsProvider")
  return ctx
}
