import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Flame,
  ReceiptIndianRupee,
  Search,
  WalletCards,
  X,
  Users,
  Wallet,
  AlertTriangle,
  BarChart3,
  Settings,
  CalendarDays,
  ArrowRight,
  Sparkles,
} from "lucide-react"
import { useBookings } from "@/lib/bookings-context"
import { usePoojas } from "@/lib/poojas-context"
import { translateCategory, useLanguage, type TranslationKey } from "@/lib/language-context"
import { getReceiptNumber } from "@/lib/date-utils"
import { matchesSearch, HighlightMatch } from "@/lib/search-utils"
import { cn } from "@/lib/utils"

type SearchGroup = "Pages" | "Poojas" | "Bookings"
type FilterCategory = "All" | "Poojas" | "Bookings" | "Pages"

type SearchResult = {
  id: string
  group: SearchGroup
  groupKey: TranslationKey
  title: string
  subtitle: string
  path: string
  searchText: string
  badge?: string
  poojaId?: string
  receipt?: string
}

type PageDef = {
  id: string
  titleKey: TranslationKey
  subtitleKey: TranslationKey
  path: string
  icon: typeof Flame
}

const PAGE_DEFS: PageDef[] = [
  { id: "page-poojas", titleKey: "poojaManagement", subtitleKey: "pagePoojasSubtitle", path: "/", icon: Flame },
  { id: "page-settlement", titleKey: "settlement", subtitleKey: "pageSettlementSubtitle", path: "/settlement", icon: ReceiptIndianRupee },
  { id: "page-opening-balance", titleKey: "openingBalance", subtitleKey: "pageOpeningBalanceSubtitle", path: "/opening-balance", icon: WalletCards },
  { id: "page-families", titleKey: "familiesTab", subtitleKey: "pageFamiliesSubtitle", path: "/family-contributions/families", icon: Users },
  { id: "page-contributions", titleKey: "paymentsTab", subtitleKey: "pageContributionsSubtitle", path: "/family-contributions/contributions", icon: Wallet },
  { id: "page-outstanding", titleKey: "outstandingFamilies", subtitleKey: "pageOutstandingSubtitle", path: "/family-contributions/outstanding", icon: AlertTriangle },
  { id: "page-festivals", titleKey: "category", subtitleKey: "pageFestivalChargesSubtitle", path: "/family-contributions/festival-charges", icon: CalendarDays },
  { id: "page-reports", titleKey: "ledgerReports", subtitleKey: "pageReportsSubtitle", path: "/family-contributions/reports", icon: BarChart3 },
  { id: "page-settings", titleKey: "settingsTab", subtitleKey: "pageSettingsSubtitle", path: "/family-contributions/settings", icon: Settings },
]

export function GlobalSearch() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { bookings } = useBookings()
  const { poojas } = usePoojas()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState<FilterCategory>("All")
  const [activeIndex, setActiveIndex] = useState(0)

  const dialogInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Memoize all searchable items
  const allResults = useMemo(() => {
    const q = query.trim()

    // 1. Pages
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
        searchText: `${title} ${subtitle} ${page.path}`,
        badge: "Page",
      }
    })

    const pageResults = q ? pages.filter((p) => matchesSearch(p.searchText, q)) : pages

    // 2. Poojas
    const poojaResults: SearchResult[] = poojas
      .map((p) => {
        const catTranslated = translateCategory(t, p.category)
        const searchText = `${p.name} ${p.category} ${catTranslated} ${p.description || ""} ₹${p.amount} ${p.duration_minutes} mins`
        return {
          id: `pooja-${p.id}`,
          group: "Poojas" as const,
          groupKey: "poojas" as const,
          title: p.name,
          subtitle: `${catTranslated} · ₹${p.amount.toLocaleString()} · ${p.duration_minutes} ${t("mins")}`,
          path: `/?poojaId=${encodeURIComponent(p.id || "")}&action=book`,
          searchText,
          badge: `₹${p.amount}`,
          poojaId: p.id,
        }
      })
      .filter((p) => !q || matchesSearch(p.searchText, q))

    // 3. Bookings / Receipts
    const bookingResults: SearchResult[] = bookings
      .map((b, index) => {
        const receipt = getReceiptNumber(b, index)
        const searchText = `${receipt} ${b.devoteeName || ""} ${b.phoneNumber || ""} ${b.poojaName || ""} ${b.paymentMode || ""} ${b.date || ""} ${b.star || ""} ${b.nakshatra || ""} ₹${b.amount || ""}`
        return {
          id: `booking-${b.id ?? receipt}`,
          group: "Bookings" as const,
          groupKey: "bookings" as const,
          title: b.devoteeName || t("unnamedDevotee"),
          subtitle: `${receipt} · ${b.poojaName} · ₹${Number(b.amount || 0).toLocaleString()} (${b.paymentMode})`,
          path: `/settlement?receipt=${encodeURIComponent(receipt)}`,
          searchText,
          badge: receipt,
          receipt,
        }
      })
      .filter((b) => !q || matchesSearch(b.searchText, q))

    return {
      pages: pageResults,
      poojas: poojaResults,
      bookings: bookingResults,
    }
  }, [bookings, poojas, query, t])

  // Apply group filtering (All / Poojas / Bookings / Pages)
  const filteredResults = useMemo(() => {
    const q = query.trim()
    const { pages, poojas: poojaList, bookings: bookingList } = allResults

    if (activeCategory === "Poojas") {
      return poojaList
    }
    if (activeCategory === "Bookings") {
      return bookingList
    }
    if (activeCategory === "Pages") {
      return pages
    }

    // Default "All" view: show smart preview when query is empty, full when searched
    if (!q) {
      return [...pages.slice(0, 4), ...poojaList.slice(0, 5), ...bookingList.slice(0, 5)]
    }

    return [...poojaList, ...bookingList, ...pages]
  }, [activeCategory, allResults, query])

  const totalMatches = filteredResults.length

  const close = useCallback(() => {
    setOpen(false)
    setQuery("")
    setActiveCategory("All")
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

  // Keyboard navigation
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
        setActiveIndex((i) => (filteredResults.length === 0 ? 0 : (i + 1) % filteredResults.length))
        return
      }

      if (event.key === "ArrowUp") {
        event.preventDefault()
        setActiveIndex((i) =>
          filteredResults.length === 0 ? 0 : i === 0 ? filteredResults.length - 1 : i - 1,
        )
        return
      }

      if (event.key === "Enter" && filteredResults[activeIndex]) {
        event.preventDefault()
        selectResult(filteredResults[activeIndex])
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [activeIndex, close, filteredResults, open, openPalette, selectResult])

  // Reset active selection when query or tab changes
  useEffect(() => {
    setActiveIndex(0)
  }, [query, activeCategory])

  // Scroll active item into view smoothly
  useEffect(() => {
    const activeEl = listRef.current?.querySelector<HTMLElement>("[data-active='true']")
    activeEl?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  const getResultIcon = (result: SearchResult) => {
    if (result.group === "Pages") {
      const pageDef = PAGE_DEFS.find((p) => p.id === result.id)
      const IconComponent = pageDef?.icon ?? WalletCards
      return <IconComponent className="w-4 h-4 text-primary" />
    }
    if (result.group === "Poojas") {
      return <Flame className="w-4 h-4 text-amber-500" />
    }
    return <ReceiptIndianRupee className="w-4 h-4 text-emerald-500" />
  }

  const categoryChips: { key: FilterCategory; label: string; count: number }[] = [
    { key: "All", label: t("searchCategoryAll"), count: allResults.poojas.length + allResults.bookings.length + allResults.pages.length },
    { key: "Poojas", label: t("searchCategoryPoojas"), count: allResults.poojas.length },
    { key: "Bookings", label: t("searchCategoryBookings"), count: allResults.bookings.length },
    { key: "Pages", label: t("searchCategoryPages"), count: allResults.pages.length },
  ]

  let lastGroup = ""

  return (
    <>
      {/* Topbar trigger button */}
      <div className="relative w-full max-w-md hidden md:flex items-center">
        <button
          type="button"
          onClick={openPalette}
          className="w-full flex items-center justify-between bg-muted/70 hover:bg-muted border border-border/80 text-muted-foreground hover:text-foreground rounded-full pl-3.5 pr-3 py-1.5 text-sm transition-all shadow-xs cursor-pointer group"
          aria-label={t("searchEverywhereAria")}
        >
          <div className="flex items-center gap-2.5 truncate">
            <Search className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            <span className="truncate">{t("searchEverywherePrompt")}</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-border/80 bg-background/90 px-1.5 py-0.5 text-[11px] font-mono font-medium text-muted-foreground shadow-xs">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Mobile search button */}
      <button
        type="button"
        onClick={openPalette}
        className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-full bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors"
        aria-label={t("searchEverywhere")}
      >
        <Search className="w-4 h-4" />
      </button>

      {/* Global Search Dialog Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh] pb-6">
          {/* Backdrop */}
          <button
            type="button"
            className="fixed inset-0 bg-background/70 backdrop-blur-sm transition-opacity"
            aria-label={t("closeSearch")}
            onClick={close}
          />

          {/* Modal Card */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("searchEverywhereAria")}
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl flex flex-col max-h-[80vh] animate-in fade-in-50 zoom-in-95 duration-150"
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-1">
              <Search className="w-5 h-5 shrink-0 text-muted-foreground" />
              <input
                ref={dialogInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchEverywherePrompt")}
                className="w-full bg-transparent py-3.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("")
                    dialogInputRef.current?.focus()
                  }}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  title={t("clearSearch")}
                  aria-label={t("clearSearch")}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors ml-1"
                aria-label={t("close")}
              >
                <kbd className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border border-border bg-muted/60">
                  Esc
                </kbd>
              </button>
            </div>

            {/* Filter Category Tabs */}
            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border/60 bg-secondary/30 overflow-x-auto text-xs">
              <span className="text-muted-foreground font-medium mr-1 shrink-0 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                {t("quickFilters")}:
              </span>
              {categoryChips.map((chip) => {
                const isActive = activeCategory === chip.key
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setActiveCategory(chip.key)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg font-medium transition-all shrink-0 flex items-center gap-1.5",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-background/80 hover:bg-background border border-border/80 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span>{chip.label}</span>
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.2 rounded-full",
                        isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {chip.count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Search Results List */}
            <div ref={listRef} className="flex-1 overflow-y-auto p-2 scroll-smooth divide-y divide-border/20">
              {totalMatches === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-muted/80 flex items-center justify-center mx-auto mb-3 text-muted-foreground">
                    <Search className="w-6 h-6" />
                  </div>
                  <p className="text-base font-semibold text-foreground">
                    {query.trim() ? t("noSearchResults", { query: query.trim() }) : t("noMatchesFound")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto">
                    {t("noMatchesSuggestion")}
                  </p>
                  {query && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("")
                        setActiveCategory("All")
                        dialogInputRef.current?.focus()
                      }}
                      className="mt-4 px-3.5 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-xs font-medium text-foreground transition-colors inline-flex items-center gap-1.5 shadow-xs"
                    >
                      <X className="w-3.5 h-3.5" />
                      {t("clearSearch")}
                    </button>
                  )}
                </div>
              ) : (
                filteredResults.map((result, index) => {
                  const showGroup = activeCategory === "All" && result.group !== lastGroup
                  if (activeCategory === "All") {
                    lastGroup = result.group
                  }

                  const isSelected = index === activeIndex

                  return (
                    <div key={result.id} className="pt-1">
                      {showGroup && (
                        <div className="flex items-center justify-between px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <span>{t(result.groupKey)}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        data-active={isSelected}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => selectResult(result)}
                        className={cn(
                          "group/item flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-all",
                          isSelected
                            ? "bg-primary/10 text-foreground ring-1 ring-primary/20 shadow-xs"
                            : "text-foreground hover:bg-secondary/60",
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                              isSelected ? "bg-background shadow-xs ring-1 ring-border" : "bg-muted/80",
                            )}
                          >
                            {getResultIcon(result)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <HighlightMatch
                                text={result.title}
                                query={query}
                                className="block truncate text-sm font-semibold tracking-tight text-foreground"
                              />
                              {result.badge && (
                                <span className="shrink-0 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/60">
                                  {result.badge}
                                </span>
                              )}
                            </div>
                            <HighlightMatch
                              text={result.subtitle}
                              query={query}
                              className="block truncate text-xs text-muted-foreground mt-0.5"
                            />
                          </div>
                        </div>

                        {/* Action prompt */}
                        <div className="hidden sm:flex items-center gap-1 text-xs font-medium text-muted-foreground shrink-0 group-hover/item:text-primary transition-colors">
                          <span className="text-[11px]">
                            {result.group === "Poojas"
                              ? t("bookNow")
                              : result.group === "Bookings"
                              ? t("viewReceipt")
                              : "Open"}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                      </button>
                    </div>
                  )
                })
              )}
            </div>

            {/* Bottom Keyboard Hint Bar */}
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground bg-muted/30">
              <span className="flex items-center gap-2">
                <span>{t("searchHintDetailed")}</span>
              </span>
              <span className="font-mono text-[10px] bg-background px-2 py-0.5 rounded border border-border">
                {totalMatches} {totalMatches === 1 ? "result" : "results"}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
