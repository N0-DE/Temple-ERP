import { invoke } from "@tauri-apps/api/core"

export type Pooja = { id?: string; name: string; description: string; amount: number; duration_minutes: number; category: string }
export type Booking = { id?: string; devoteeName: string; phoneNumber: string; address: string; star: string; nakshatra: string; date: string; time: string; remarks: string; poojaName: string; amount: number; paymentMode: string; status: "Paid" | "Pending"; createdAt?: number; isAdvanceBooking?: boolean }
export type BookingStats = { totalCollection: number; todayCollection: number; monthCollection: number; pendingCollection: number }
export type BookingsPage = { bookings: Booking[]; cursor: null; hasMore: false }
export type CounterBalance = { openingBalance: number }

const KEYS = { poojas: "temple-erp-poojas", bookings: "temple-erp-bookings", balance: "temple-erp-counter-opening-balance" }
const changed = () => window.dispatchEvent(new Event("temple-erp-data-changed"))
const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
const read = <T>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) ?? "") as T } catch { return fallback } }
const write = <T>(key: string, value: T) => { localStorage.setItem(key, JSON.stringify(value)); changed() }

const toDb = (booking: Booking) => ({ id: booking.id, devoteeName: booking.devoteeName, phoneNumber: booking.phoneNumber, address: booking.address, star: booking.star, nakshatra: booking.nakshatra, date: booking.date, time: booking.time, remarks: booking.remarks, poojaName: booking.poojaName, amount: booking.amount, paymentMode: booking.paymentMode, status: booking.status, createdAt: booking.createdAt, isAdvanceBooking: booking.isAdvanceBooking })

export const getPoojas = async (): Promise<Pooja[]> => isTauri() ? invoke<Pooja[]>("db_list_poojas") : read<Pooja[]>(KEYS.poojas, [])
export const addPooja = async (pooja: Omit<Pooja, "id">): Promise<Pooja> => {
  const saved = isTauri() ? await invoke<Pooja>("db_save_pooja", { pooja }) : { id: crypto.randomUUID(), ...pooja }
  if (isTauri()) changed()
  if (!isTauri()) write(KEYS.poojas, [...read<Pooja[]>(KEYS.poojas, []), saved]); return saved
}
export const updatePooja = async (id: string, pooja: Omit<Pooja, "id">) => { if (isTauri()) { await invoke("db_save_pooja", { pooja: { id, ...pooja } }); changed() } else write(KEYS.poojas, read<Pooja[]>(KEYS.poojas, []).map((x) => x.id === id ? { id, ...pooja } : x)) }
export const deletePooja = async (id: string) => { if (isTauri()) { await invoke("db_delete_pooja", { id }); changed() } else write(KEYS.poojas, read<Pooja[]>(KEYS.poojas, []).filter((x) => x.id !== id)) }

export const getBookings = async (_cursor: null = null): Promise<BookingsPage> => {
  if (isTauri()) {
    return { bookings: await invoke<Booking[]>("db_list_bookings"), cursor: null, hasMore: false }
  }
  return { bookings: read<Booking[]>(KEYS.bookings, []), cursor: null, hasMore: false }
}

export const subscribeToBookings = (onData: (bookings: Booking[]) => void, onError: () => void) => {
  const load = () => void getBookings().then((page) => onData(page.bookings)).catch(onError)
  load(); window.addEventListener("temple-erp-data-changed", load); return () => window.removeEventListener("temple-erp-data-changed", load)
}

export const getBookingStats = async (today: string, monthAgo: string): Promise<BookingStats> => {
  const { bookings } = await getBookings()
  const sum = (items: Booking[]) => items.reduce((total, item) => total + Number(item.amount || 0), 0)
  return {
    totalCollection: sum(bookings),
    todayCollection: sum(bookings.filter((x) => x.date.split("T")[0].split(" ")[0] === today)),
    monthCollection: sum(bookings.filter((x) => x.date.split("T")[0].split(" ")[0] >= monthAgo)),
    pendingCollection: 0
  }
}

export const addBooking = async (booking: Omit<Booking, "id">): Promise<Booking> => {
  const existing = read<Booking[]>(KEYS.bookings, [])
  const numericIds = existing.map(b => parseInt(b.id || "0", 10)).filter(n => !isNaN(n) && n > 0)
  const nextNum = numericIds.length > 0 ? Math.max(...numericIds) + 1 : existing.length + 1
  const local = { id: String(nextNum), ...booking, status: "Paid" as const, createdAt: Date.now() }
  const saved = isTauri() ? await invoke<Booking>("db_save_booking", { booking: toDb(local) }) : local
  if (isTauri()) changed()
  if (!isTauri()) write(KEYS.bookings, [saved, ...existing]); return saved
}
export const addBookingOfflineFirst = addBooking

export const updateBookingStatus = async (id: string, status: Booking["status"]) => {
  if (isTauri()) {
    await invoke("db_update_booking_status", { id, status })
    changed()
  } else {
    write(KEYS.bookings, read<Booking[]>(KEYS.bookings, []).map((x) => x.id === id ? { ...x, status } : x))
  }
}

export const deleteBooking = async (id: string) => {
  if (isTauri()) {
    await invoke("db_delete_booking", { id })
    changed()
  } else {
    write(KEYS.bookings, read<Booking[]>(KEYS.bookings, []).filter((x) => x.id !== id))
  }
}

export const subscribeToCounterBalance = (onData: (balance: CounterBalance) => void, onError: () => void) => {
  const load = () => { if (isTauri()) void invoke<number>("db_get_opening_balance").then((openingBalance) => onData({ openingBalance })).catch(onError); else onData({ openingBalance: Number(localStorage.getItem(KEYS.balance) ?? 0) }) }
  load(); window.addEventListener("temple-erp-data-changed", load); return () => window.removeEventListener("temple-erp-data-changed", load)
}
export const saveCounterOpeningBalance = async (openingBalance: number) => { if (isTauri()) { await invoke("db_set_opening_balance", { openingBalance }); changed() } else { localStorage.setItem(KEYS.balance, String(openingBalance)); changed() } }
export const getOfflineBookings = (): Booking[] => []
export const syncOfflineBookings = async () => {}
export const syncStoredCounterBalance = async () => {}
