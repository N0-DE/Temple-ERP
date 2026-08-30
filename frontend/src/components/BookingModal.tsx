import { motion, AnimatePresence } from "framer-motion"
import { X, Loader2 } from "lucide-react"
import { useState } from "react"
import { addBookingOfflineFirst, type Booking } from "@/lib/firestore"
import { getReceiptNumber } from "@/lib/date-utils"
import { translatePaymentMode, useLanguage } from "@/lib/language-context"

type BookingModalProps = {
  isOpen: boolean
  onClose: () => void
  poojaName: string
  amount: number
}

const PAYMENT_MODES = ["Cash", "UPI", "Card", "Net Banking"]

const NAKSHATRAS = [
  "Aswini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
  "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni",
  "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha",
  "Anuradha", "Jyeshtha", "Moola", "Purva Ashadha", "Uttara Ashadha",
  "Shravana", "Dhanishtha", "Shatabhisha", "Purva Bhadrapada",
  "Uttara Bhadrapada", "Revati"
]

function getCurrentBookingDateTime() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")

  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  }
}

export function printReceipt(
  booking: Booking,
  printWindow = window.open("", "_blank"),
  labels?: {
    receipt: string
    terminalAt: string
    receiptNo: string
    devotee: string
    pooja: string
    dateTime: string
    paymentMode: string
    status: string
    total: string
    thankYou: string
    paid: string
  },
) {
  if (!printWindow) return

  const escapeHtml = (value: string | number) => String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;")
  const receiptNumber = getReceiptNumber(booking)
  const L = labels ?? {
    receipt: "RECEIPT",
    terminalAt: "at",
    receiptNo: "Receipt No.",
    devotee: "Devotee",
    pooja: "Pooja",
    dateTime: "Date & Time",
    paymentMode: "Payment Mode",
    status: "Status",
    total: "Total",
    thankYou: "Thank you for your booking.",
    paid: "Paid",
  }
  const statusLabel = booking.status === "Paid" ? L.paid : booking.status

  printWindow.document.write(`<html><head><title>${receiptNumber}</title><style>
    @page { size: 80mm auto; margin: 0; } body { width: 80mm; margin: 0; padding: 7mm 6mm; color: #111; font: 10px Arial, sans-serif; }
    h1, p { margin: 0; } header { text-align: center; padding-bottom: 12px; } header:before, header:after { content: "******************************"; display: block; font-size: 13px; letter-spacing: 1px; overflow: hidden; }
    header:before { margin-bottom: 10px; } header:after { margin-top: 10px; } h1 { font-size: 17px; } .receipt { margin-top: 18px; border-top: 2px dotted #555; border-bottom: 2px dotted #555; padding: 8px 0; }
    .row { display: flex; justify-content: space-between; gap: 16px; padding: 5px 0; } .label { color: #333; } .total { font-size: 12px; font-weight: 700; border-top: 2px dotted #555; margin-top: 8px; padding-top: 10px; } footer { margin-top: 20px; text-align: center; font-size: 11px; font-weight: 700; }
    </style></head><body><header><h1>${escapeHtml(L.receipt)}</h1><p>Terminal<br>${escapeHtml(booking.date)} ${escapeHtml(L.terminalAt)} ${escapeHtml(booking.time)}</p></header><section class="receipt">
    <div class="row"><span class="label">${escapeHtml(L.receiptNo)}</span><strong>${escapeHtml(receiptNumber)}</strong></div>
    <div class="row"><span class="label">${escapeHtml(L.devotee)}</span><strong>${escapeHtml(booking.devoteeName)}</strong></div>
    <div class="row"><span class="label">${escapeHtml(L.pooja)}</span><strong>${escapeHtml(booking.poojaName)}</strong></div>
    <div class="row"><span class="label">${escapeHtml(L.dateTime)}</span><strong>${escapeHtml(`${booking.date} ${booking.time}`)}</strong></div>
    <div class="row"><span class="label">${escapeHtml(L.paymentMode)}</span><strong>${escapeHtml(booking.paymentMode)}</strong></div>
    <div class="row"><span class="label">${escapeHtml(L.status)}</span><strong>${escapeHtml(statusLabel)}</strong></div>
    <div class="row total"><span>${escapeHtml(L.total)}</span><span>₹${escapeHtml(booking.amount.toLocaleString())}</span></div>
    </section><footer>${escapeHtml(L.thankYou)}</footer></body></html>`)
  printWindow.document.close()
  printWindow.focus()
  printWindow.onafterprint = () => printWindow.close()
  printWindow.print()
}

export function BookingModal({ isOpen, onClose, poojaName, amount }: BookingModalProps) {
  const { t } = useLanguage()
  const [formData, setFormData] = useState(() => ({
    devoteeName: "",
    phoneNumber: "",
    address: "",
    star: "",
    nakshatra: "",
    ...getCurrentBookingDateTime(),
    remarks: "",
    paymentMode: "Cash",
  }))
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const receiptLabels = {
    receipt: t("receipt").toUpperCase(),
    terminalAt: t("at"),
    receiptNo: t("receiptNo"),
    devotee: t("devotee"),
    pooja: t("pooja"),
    dateTime: t("dateTime"),
    paymentMode: t("paymentMode"),
    status: t("status"),
    total: t("total"),
    thankYou: t("thankYouBooking"),
    paid: t("paid"),
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const printWindow = window.open("", "_blank")
    const confirmedBooking = await addBookingOfflineFirst({
      ...formData,
      poojaName,
      amount,
      status: "Paid",
    })
    setSaving(false)
    setSuccess(true)
    printReceipt(confirmedBooking, printWindow, receiptLabels)
  }

  const inputClass =
    "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
  const selectClass =
    "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"

  return (
    <AnimatePresence>
      {isOpen && (
        <>
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
              className="pointer-events-auto w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] bg-card border border-border shadow-xl rounded-2xl overflow-y-auto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="booking-modal-title"
            >
            <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card z-10">
              <div>
                <h2 id="booking-modal-title" className="text-xl font-bold">{t("bookPooja", { name: poojaName })}</h2>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {t("amountLabel")} <span className="font-bold text-primary">₹{amount.toLocaleString()}</span>
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary text-muted-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {success ? (
              <div className="p-12 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold">{t("bookingConfirmed")}</h3>
                <p className="text-muted-foreground text-sm mt-1">{t("bookingConfirmedBody")}</p>
                <button type="button" onClick={onClose} className="mt-6 px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary transition-colors">{t("done")}</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t("devoteeName")}</label>
                    <input required type="text" name="devoteeName" value={formData.devoteeName} onChange={handleChange} className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t("phoneNumber")}</label>
                    <input required type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} className={inputClass} />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-medium">{t("address")}</label>
                    <textarea name="address" value={formData.address} onChange={handleChange} rows={2} className={`${inputClass} resize-none`} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t("nakshatra")}</label>
                    <select name="nakshatra" value={formData.nakshatra} onChange={handleChange} className={selectClass}>
                      <option value="">{t("selectNakshatra")}</option>
                      {NAKSHATRAS.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t("dateRequired")}</label>
                    <input required type="date" name="date" value={formData.date} onChange={handleChange} className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t("timeRequired")}</label>
                    <input required type="time" name="time" value={formData.time} onChange={handleChange} className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t("paymentMode")}</label>
                    <select name="paymentMode" value={formData.paymentMode} onChange={handleChange} className={selectClass}>
                      {PAYMENT_MODES.map((m) => <option key={m} value={m}>{translatePaymentMode(t, m)}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t("remarks")}</label>
                    <input type="text" name="remarks" value={formData.remarks} onChange={handleChange} className={inputClass} />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border mt-4">
                  <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary transition-colors">
                    {t("cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {saving ? t("saving") : t("generateReceipt")}
                  </button>
                </div>
              </form>
            )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
