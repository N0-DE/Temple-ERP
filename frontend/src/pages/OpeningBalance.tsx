import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Banknote, IndianRupee, Save, WalletCards } from "lucide-react"
import { useBookings } from "@/lib/bookings-context"
import { saveCounterOpeningBalance, subscribeToCounterBalance } from "@/lib/firestore"
import { useLanguage } from "@/lib/language-context"

const LOCAL_OPENING_BALANCE_KEY = "temple-erp-counter-opening-balance"

const formatMoney = (amount: number) => `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

export default function OpeningBalance() {
  const { t } = useLanguage()
  const { bookings } = useBookings()
  const [openingBalance, setOpeningBalance] = useState(0)
  const [inputValue, setInputValue] = useState("0")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const savedLocalValue = Number(localStorage.getItem(LOCAL_OPENING_BALANCE_KEY))
    if (Number.isFinite(savedLocalValue)) {
      setOpeningBalance(savedLocalValue)
      setInputValue(String(savedLocalValue))
    }

    return subscribeToCounterBalance(
      ({ openingBalance: savedBalance }) => {
        setOpeningBalance(savedBalance)
        setInputValue(String(savedBalance))
        localStorage.setItem(LOCAL_OPENING_BALANCE_KEY, String(savedBalance))
      },
      () => setMessage(t("offlineBalanceMsg")),
    )
  }, [t])

  const currentCashAmount = useMemo(
    () => bookings.reduce(
      (total, booking) => total + (booking.status === "Paid" && booking.paymentMode.toLowerCase() === "cash" ? booking.amount : 0),
      0,
    ),
    [bookings],
  )
  const cashInHand = openingBalance + currentCashAmount

  const saveBalance = async () => {
    const nextBalance = Number(inputValue)
    if (!Number.isFinite(nextBalance) || nextBalance < 0) {
      setMessage(t("invalidOpeningBalance"))
      return
    }

    setSaving(true)
    setOpeningBalance(nextBalance)
    localStorage.setItem(LOCAL_OPENING_BALANCE_KEY, String(nextBalance))
    try {
      await saveCounterOpeningBalance(nextBalance)
      setMessage(t("openingBalanceSaved"))
    } catch {
      setMessage(t("openingBalanceSavedLocal"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 max-w-4xl mx-auto"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("openingBalance")}</h1>
        <p className="text-muted-foreground mt-1">{t("openingBalanceSubtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BalanceCard label={t("openingBalance")} value={formatMoney(openingBalance)} icon={WalletCards} tone="text-violet-500 bg-violet-500/10" />
        <BalanceCard label={t("currentCashCollection")} value={formatMoney(currentCashAmount)} icon={IndianRupee} tone="text-emerald-500 bg-emerald-500/10" />
        <BalanceCard label={t("cashInHand")} value={formatMoney(cashInHand)} icon={Banknote} tone="text-primary bg-primary/10" prominent />
      </div>

      <section className="bg-card border border-border rounded-2xl shadow-sm p-6 max-w-xl">
        <h2 className="text-lg font-semibold">{t("counterOpeningBalance")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("counterOpeningHelp")}</p>
        <div className="mt-5 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void saveBalance() }}
              aria-label={t("openingBalanceAria")}
              className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            type="button"
            onClick={() => void saveBalance()}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            <Save className="w-4 h-4" /> {saving ? t("saving") : t("saveBalance")}
          </button>
        </div>
        {message && <p className="text-sm text-muted-foreground mt-3" role="status">{message}</p>}
      </section>

      <p className="text-sm text-muted-foreground px-1">{t("openingBalanceFootnote")}</p>
    </motion.div>
  )
}

function BalanceCard({ label, value, icon: Icon, tone, prominent = false }: {
  label: string
  value: string
  icon: typeof IndianRupee
  tone: string
  prominent?: boolean
}) {
  const [color, background] = tone.split(" ")
  return (
    <div className={`bg-card border border-border rounded-2xl p-5 shadow-sm flex items-center gap-4 ${prominent ? "ring-1 ring-primary/20" : ""}`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${background}`}><Icon className={`w-6 h-6 ${color}`} /></div>
      <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold mt-0.5">{value}</p></div>
    </div>
  )
}
