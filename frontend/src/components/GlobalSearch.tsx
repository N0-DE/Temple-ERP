import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Flame, ReceiptIndianRupee, Search, WalletCards, X } from "lucide-react"
import { useBookings } from "@/lib/bookings-context"
import { usePoojas } from "@/lib/poojas-context"
import { translateCategory, useLanguage, type TranslationKey } from "@/lib/language-context"
import { getReceiptNumber } from "@/lib/date-utils"
import { cn } from "@/lib/utils"

type SearchGroup = "Pages" | "Poojas" | "Bookings"

type SearchResult = {
  id: string
  group: SearchGroup
  groupKey: TranslationKey
  title: string
  subtitle: string
  path: string
  searchText: string
}

const PAGE_DEFS: { id: string; titleKey: TranslationKey; subtitleKey: TranslationKey; path: string }[] = [
  { id: "page-poojas", titleKey: "poojaManagement", subtitleKey: "pagePoojasSubtitle", path: "/" },
  { id: "page-settlement", titleKey: "settlement", subtitleKey: "pageSettlementSubtitle", path: "/settlement" },
  { id: "page-opening-balance", titleKey: "openingBalance", subtitleKey: "pageOpeningBalanceSubtitle", path: "/opening-balance" },
]

const PAGE_ICONS: Record<string, typeof Flame> = {
  "page-poojas": Flame,
  "page-settlement": ReceiptIndianRupee,
  "page-opening-balance": WalletCards,
}

function matchesQuery(haystack: string, query: string) {
  return haystack.toLowerCase().includes(query)
}

export function GlobalSearch() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { bookings } = useBookings()
  const { poojas } = usePoojas()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)

  const dialogInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()

    const pages: SearchResult[] = PAGE_DEFS.map((page) => {
      const title = t(page.titleKey)
      const subtitle = t(page.subtitleKey)
      return {
        id: page.id,
        group: "Pages",
        groupKey: "pages",
        title,
        subtitle,
        path: page.path,
        searchText: `${title} ${subtitle}`,
      }
    })

    const pageResults = q ? pages.filter((p) => matchesQuery(p.searchText, q)) : pages

    const poojaResults: SearchResult[] = poojas
      .filter((p) => !q || matchesQuery(`${p.name} ${p.category} ${p.description}`, q))
      .slice(0, 8)
      .map((p) => ({
        id: `pooja-${p.id}`,
        group: "Poojas" as const,
        groupKey: "poojas" as const,
        title: p.name,
        subtitle: `${translateCategory(t, p.category)} · ₹${p.amount}`,
        path: "/",
        searchText: `${p.name} ${p.category} ${p.description}`,
      }))

    const bookingResults: SearchResult[] = bookings
      .map((b, index) => {
        const receipt = getReceiptNumber(b, index)
        return {
          booking: b,
          receipt,
          haystack: `${receipt} ${b.devoteeName} ${b.phoneNumber} ${b.poojaName} ${b.paymentMode} ${b.date}`,
        }
      })
      .filter((item) => !q || matchesQuery(item.haystack, q))
      .slice(0, 8)
      .map(({ booking: b, receipt }) => ({
        id: `booking-${b.id ?? receipt}`,
        group: "Bookings" as const,
        groupKey: "bookings" as const,
        title: b.devoteeName || t("unnamedDevotee"),
        subtitle: `${receipt} · ${b.poojaName} · ₹${b.amount}`,
        path: "/settlement",
        searchText: `${receipt} ${b.devoteeName} ${b.phoneNumber} ${b.poojaName} ${b.paymentMode} ${b.date}`,
      }))

    if (!q) {
      return [...pageResults, ...poojaResults.slice(0, 5), ...bookingResults.slice(0, 5)]
    }
    return [...pageResults, ...poojaResults, ...bookingResults]
  }, [bookings, poojas, query, t])

  const flatResults = results

  const close = useCallback(() => {
    setOpen(false)
    setQuery("")
    setActiveIndex(0)
  }, [])

  const openPalette = useCallback(() => {
    setOpen(true)
    setActiveIndex(0)
    requestAnimationFrame(() => dialogInputRef.current?.focus())
  }, [])

  const selectResult = useCallback(
    (result: SearchResult) => {
      navigate(result.path)
      close()
    },
    [close, navigate],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k"
      if (isShortcut) {
        event.preventDefault()
        if (open) close()
        else openPalette()
        return
      }

      if (!open) return

      if (event.key === "Escape") {
        event.preventDefault()
        close()
        return
      }

      if (event.key === "ArrowDown") {
        event.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(flatResults.length - 1, 0)))
        return
      }

      if (event.key === "ArrowUp") {
        event.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
        return
      }

      if (event.key === "Enter" && flatResults[activeIndex]) {
        event.preventDefault()
        selectResult(flatResults[activeIndex])
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [activeIndex, close, flatResults, open, openPalette, selectResult])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>("[data-active='true']")
    active?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  const resultIcon = (result: SearchResult) => {
    if (result.group === "Pages") return PAGE_ICONS[result.id] ?? WalletCards
    if (result.group === "Poojas") return Flame
    return ReceiptIndianRupee
  }

  let lastGroup = ""

  return (
    <>
      <div className="relative w-full max-w-md hidden md:flex items-center">
        <Search className="absolute left-3 text-muted-foreground w-4 h-4 pointer-events-none" />
        <input
          type="text"
          readOnly
          placeholder={t("searchEverywhere")}
          onFocus={openPalette}
          onClick={openPalette}
          className="w-full bg-muted border border-border text-foreground placeholder:text-muted-foreground rounded-full pl-10 pr-4 py-2 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
        />
      </div>

      <button
        type="button"
        onClick={openPalette}
        className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-full bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors"
        aria-label={t("searchEverywhere")}
      >
        <Search className="w-4 h-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
          <button
            type="button"
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            aria-label={t("closeSearch")}
            onClick={close}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("searchEverywhereAria")}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="w-4 h-4 shrink-0 text-muted-foreground" />
              <input
                ref={dialogInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchEverywhere")}
                className="w-full bg-transparent py-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={close}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("close")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div ref={listRef} className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
              {flatResults.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {t("noSearchResults", { query: query.trim() })}
                </p>
              ) : (
                flatResults.map((result, index) => {
                  const showGroup = result.group !== lastGroup
                  lastGroup = result.group
                  const Icon = resultIcon(result)
                  return (
                    <div key={result.id}>
                      {showGroup && (
                        <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t(result.groupKey)}
                        </p>
                      )}
                      <button
                        type="button"
                        data-active={index === activeIndex}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => selectResult(result)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                          index === activeIndex
                            ? "bg-primary/15 text-foreground"
                            : "text-foreground hover:bg-muted",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                            index === activeIndex ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                          )}
                        >
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{result.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{result.subtitle}</span>
                        </span>
                      </button>
                    </div>
                  )
                })
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              <span>{t("searchHint")}</span>
              <span>Ctrl+K</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
