import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  Search, Download, FileText, Printer,
  TrendingUp, IndianRupee, CalendarDays, Clock, Loader2
} from "lucide-react"
import { type Booking } from "@/lib/firestore"
import { useBookings } from "@/lib/bookings-context"
import { printReceipt } from "@/components/BookingModal"
import { getLocalDateString, getOffsetDateString, getReceiptNumber } from "@/lib/date-utils"
import { translateDateFilter, translatePaymentMode, useLanguage, type TranslationKey } from "@/lib/language-context"

type FilterType = "All" | "Today" | "Yesterday" | "Weekly" | "Monthly"
type SortKey = "devoteeName" | "poojaName" | "amount" | "paymentMode" | "date"

function parseBookingDate(dateStr: string): string {
  if (!dateStr) return ""
  return dateStr.split("T")[0].split(" ")[0].trim()
}

function filterByDate(bookings: Booking[], filter: FilterType): Booking[] {
  const today = getLocalDateString()
  if (filter === "All") return bookings
  if (filter === "Today") return bookings.filter((b) => parseBookingDate(b.date) === today)
  if (filter === "Yesterday") {
    const yesterday = getOffsetDateString(-1)
    return bookings.filter((b) => parseBookingDate(b.date) === yesterday)
  }
  if (filter === "Weekly") {
    const weekAgo = getOffsetDateString(-7)
    return bookings.filter((b) => parseBookingDate(b.date) >= weekAgo)
  }
  if (filter === "Monthly") {
    const monthAgo = getOffsetDateString(-30)
    return bookings.filter((b) => parseBookingDate(b.date) >= monthAgo)
  }
  return bookings
}

async function exportXlsx(data: Booking[]) {
  const XLSX = await import("xlsx")
  const rows = data.map((b, i) => ({
    Receipt: getReceiptNumber(b, i),
    Devotee: b.devoteeName,
    Pooja: b.poojaName,
    Amount: Number(b.amount || 0),
    Mode: b.paymentMode,
    Date: b.date,
    Time: b.time || "",
    Phone: b.phoneNumber || "",
  }))
  const worksheet = XLSX.utils.json_to_sheet(rows)
  worksheet["!cols"] = [
    { wch: 14 }, { wch: 24 }, { wch: 28 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 16 },
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Settlement")
  XLSX.writeFile(workbook, `settlement-${getLocalDateString()}.xlsx`, { compression: true })
}

function printTable(
  data: Booking[],
  labels: {
    title: string
    generatedOn: string
    totalCollection: string
    recordsCount: string
    receiptNo: string
    devotee: string
    pooja: string
    amount: string
    paymentMode: string
    dateTime: string
  },
) {
  const totalAmount = data.reduce((sum, b) => sum + Number(b.amount || 0), 0)
  const rows = data.map((b, i) => `
    <tr>
      <td style="font-family: monospace; font-weight: bold;">${getReceiptNumber(b, i)}</td>
      <td>${b.devoteeName}</td>
      <td>${b.poojaName}</td>
      <td style="font-weight: bold;">₹${Number(b.amount || 0).toLocaleString()}</td>
      <td>${b.paymentMode}</td>
      <td>${b.date} ${b.time || ""}</td>
    </tr>`).join("")

  const win = window.open("", "_blank")
  if (!win) return

  win.document.write(`
    <html><head><title>${labels.title} - ${getLocalDateString()}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #111; }
      .header { border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 20px; }
      h2 { margin: 0 0 6px 0; font-size: 22px; }
      .meta { font-size: 13px; color: #555; display: flex; justify-content: space-between; margin-bottom: 12px; }
      table { border-collapse: collapse; width: 100%; font-size: 13px; margin-top: 10px; }
      th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
      th { background: #f9fafb; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
      tr:nth-child(even) { background: #f9fafb; }
      .summary { margin-top: 20px; text-align: right; font-size: 15px; font-weight: bold; }
    </style></head>
    <body>
      <div class="header">
        <h2>${labels.title}</h2>
        <div class="meta">
          <span>${labels.generatedOn} ${new Date().toLocaleString()}</span>
          <span>${labels.totalCollection} <strong>₹${totalAmount.toLocaleString()}</strong> ${labels.recordsCount}</span>
        </div>
      </div>
      <table><thead><tr>
        <th>${labels.receiptNo}</th><th>${labels.devotee}</th><th>${labels.pooja}</th><th>${labels.amount}</th><th>${labels.paymentMode}</th><th>${labels.dateTime}</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <div class="summary">
        ${labels.totalCollection} ₹${totalAmount.toLocaleString()}
      </div>
    </body></html>`)
  win.document.close()
  win.focus()
  win.print()
}

export default function Settlement() {
  const { t } = useLanguage()
  const { bookings, loading, hasMore, loadingMore, loadOlderBookings } = useBookings()
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState<FilterType>("All")
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "date", direction: "desc" })

  const DATE_FILTERS: FilterType[] = ["All", "Today", "Yesterday", "Weekly", "Monthly"]

  const dateFiltered = filterByDate(bookings, activeFilter)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return dateFiltered

    return dateFiltered.filter((b, i) => {
      const receiptNo = getReceiptNumber(b, i).toLowerCase()
      return (
        receiptNo.includes(q) ||
        b.devoteeName.toLowerCase().includes(q) ||
        b.poojaName.toLowerCase().includes(q) ||
        (b.phoneNumber && b.phoneNumber.includes(q)) ||
        b.paymentMode.toLowerCase().includes(q) ||
        b.date.includes(q)
      )
    })
  }, [dateFiltered, search])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const aValue = a[sort.key]
    const bValue = b[sort.key]
    const comparison = typeof aValue === "number"
      ? aValue - (bValue as number)
      : String(aValue).localeCompare(String(bValue), undefined, { numeric: true })

    if (comparison !== 0) return sort.direction === "asc" ? comparison : -comparison
    return (b.date + (b.time || "")).localeCompare(a.date + (a.time || ""))
  }), [filtered, sort])

  const todayStr = getLocalDateString()
  const weekStartStr = getOffsetDateString(-7)
  const monthStartStr = getOffsetDateString(-30)

  const sumAmounts = (items: Booking[]) => items.reduce((total, b) => total + Number(b.amount || 0), 0)

  const totalCollection = sumAmounts(bookings)
  const todayCollection = sumAmounts(bookings.filter((b) => parseBookingDate(b.date) === todayStr))
  const weekCollection = sumAmounts(bookings.filter((b) => parseBookingDate(b.date) >= weekStartStr))
  const monthCollection = sumAmounts(bookings.filter((b) => parseBookingDate(b.date) >= monthStartStr))

  const toggleSort = (key: SortKey) =>
    setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" })

  const sortLabel = (key: SortKey, labelKey: TranslationKey) =>
    `${t(labelKey)}${sort.key === key ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}`

  const stats = [
    { label: t("totalPaidCollection"), value: `₹${totalCollection.toLocaleString()}`, icon: IndianRupee, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: t("todaysCollection"), value: `₹${todayCollection.toLocaleString()}`, icon: TrendingUp, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: t("thisWeek"), value: `₹${weekCollection.toLocaleString()}`, icon: CalendarDays, color: "text-violet-500", bg: "bg-violet-500/10" },
    { label: t("last30Days"), value: `₹${monthCollection.toLocaleString()}`, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 max-w-6xl mx-auto"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("settlement")}</h1>
          <p className="text-muted-foreground mt-1">{t("settlementSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => void exportXlsx(sorted)} className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-colors shadow-sm">
            <Download className="w-4 h-4 text-emerald-500" /> {t("exportExcel")}
          </button>
          <button
            onClick={() => printTable(sorted, {
              title: t("settlementReportTitle"),
              generatedOn: t("generatedOn"),
              totalCollection: t("totalCollection"),
              recordsCount: t("recordsCount", { count: sorted.length }),
              receiptNo: t("receiptNo"),
              devotee: t("devotee"),
              pooja: t("pooja"),
              amount: t("amount"),
              paymentMode: t("paymentMode"),
              dateTime: t("dateTime"),
            })}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-colors shadow-sm"
          >
            <FileText className="w-4 h-4 text-blue-500" /> {t("pdfPrint")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="bg-card border border-border rounded-2xl p-5 shadow-sm flex items-center gap-4"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.bg} flex-shrink-0`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
              <p className="text-2xl font-bold mt-0.5 tracking-tight">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-xl flex-wrap">
          {DATE_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeFilter === f ? "bg-card shadow text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {translateDateFilter(t, f)}
            </button>
          ))}
        </div>

        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={t("searchSettlementPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">{t("receipt")}</th>
                  <SortableHeader label={sortLabel("devoteeName", "devotee")} onClick={() => toggleSort("devoteeName")} />
                  <SortableHeader label={sortLabel("poojaName", "pooja")} onClick={() => toggleSort("poojaName")} />
                  <SortableHeader label={sortLabel("amount", "amount")} onClick={() => toggleSort("amount")} />
                  <SortableHeader label={sortLabel("paymentMode", "mode")} onClick={() => toggleSort("paymentMode")} />
                  <SortableHeader label={sortLabel("date", "date")} onClick={() => toggleSort("date")} />
                  <th className="px-6 py-4 font-medium text-right"><span className="sr-only">{t("printReceipt")}</span></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((b, i) => {
                  const receiptNo = getReceiptNumber(b, i)
                  return (
                    <tr key={b.id ?? i} className="border-b border-border hover:bg-secondary/20 transition-colors">
                      <td className="px-6 py-4 font-mono text-primary font-bold text-xs">
                        {receiptNo}
                      </td>
                      <td className="px-6 py-4 font-medium text-foreground">
                        <div>{b.devoteeName}</div>
                        {b.phoneNumber && <div className="text-xs text-muted-foreground font-normal">{b.phoneNumber}</div>}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{b.poojaName}</td>
                      <td className="px-6 py-4 font-bold">₹{Number(b.amount || 0).toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                          {translatePaymentMode(t, b.paymentMode)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-xs whitespace-nowrap">
                        <div>{b.date}</div>
                        {b.time && <div className="text-[11px] text-muted-foreground/70">{b.time}</div>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => printReceipt(b, window.open("", "_blank"), {
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
                          })}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
                          aria-label={t("reprintReceiptFor", { name: b.devoteeName })}
                          title={t("reprintReceipt")}
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                      {t("noSettlementRecords")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-6 py-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground flex-wrap gap-3">
          <span>{t("showingRecords", { shown: sorted.length, total: bookings.length })}</span>
          {hasMore && (
            <button
              onClick={() => void loadOlderBookings()}
              disabled={loadingMore}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-secondary transition-colors disabled:opacity-60"
            >
              {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t("loadOlderRecords")}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function SortableHeader({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <th className="px-6 py-4 font-medium">
      <button type="button" onClick={onClick} className="hover:text-foreground transition-colors font-semibold">{label}</button>
    </th>
  )
}
