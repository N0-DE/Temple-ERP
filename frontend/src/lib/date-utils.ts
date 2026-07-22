import type { Booking } from "./firestore"

export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function getOffsetDateString(daysOffset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysOffset)
  return getLocalDateString(d)
}

export function getReceiptNumber(booking: Booking, index?: number): string {
  if (booking.id) {
    const cleanId = booking.id.replace(/^booking-/, "")
    if (/^\d+$/.test(cleanId)) {
      return `RCP-${cleanId.padStart(3, "0")}`
    }
    return `RCP-${cleanId.slice(-6).toUpperCase()}`
  }
  return `RCP-${String((index ?? 0) + 1).padStart(3, "0")}`
}
