import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Loader2, Search, Users, X, MapPin, Check, Plus } from "lucide-react"
import { fcApi } from "@/lib/family-contributions-api"
import type { Family } from "@/lib/family-contributions-types"
import { formatFamilyOption } from "@/lib/family-contributions-utils"
import { HighlightMatch } from "@/lib/search-utils"
import { cn } from "@/lib/utils"

type Props = {
  value: string
  onChange: (familyId: string, family?: Family) => void
  onOpenChange?: (open: boolean) => void
  required?: boolean
  placeholder?: string
  className?: string
}

const DROPDOWN_MAX_HEIGHT = 300

function getMenuStyle(input: HTMLInputElement): React.CSSProperties {
  const rect = input.getBoundingClientRect()
  const gap = 4
  const spaceBelow = window.innerHeight - rect.bottom - gap
  const spaceAbove = rect.top - gap
  const openBelow = spaceBelow >= 180 || spaceBelow >= spaceAbove
  const maxHeight = Math.max(140, Math.min(DROPDOWN_MAX_HEIGHT, openBelow ? spaceBelow : spaceAbove))

  return {
    position: "fixed",
    top: openBelow ? rect.bottom + gap : rect.top - maxHeight - gap,
    left: rect.left,
    width: rect.width,
    maxHeight,
    zIndex: 10000,
    backgroundColor: "hsl(var(--popover))",
    color: "hsl(var(--popover-foreground))",
  }
}

export function FamilySearchSelect({
  value,
  onChange,
  onOpenChange,
  required,
  placeholder = "Search family name, head, or number...",
  className,
}: Props) {
  const inputId = useId()
  const listId = `${inputId}-listbox`
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Family[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Family | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [, setPositionTick] = useState(0)

  const setDropdownOpen = (next: boolean) => {
    setOpen(next)
    onOpenChange?.(next)
    if (!next) {
      setActiveIndex(0)
    }
  }

  // Fetch full family record when value changes
  useEffect(() => {
    if (!value) {
      setSelected(null)
      return
    }
    if (selected?.id === value) return
    let cancelled = false
    fcApi
      .getFamily(value)
      .then((family) => {
        if (!cancelled) setSelected(family)
      })
      .catch(() => {
        if (!cancelled) setSelected(null)
      })
    return () => {
      cancelled = true
    }
  }, [value, selected?.id])

  // Debounced search
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await fcApi.getFamilies({
          page: 1,
          page_size: 30,
          status: "Active",
          ...(query.trim() ? { search: query.trim() } : {}),
        })
        if (!cancelled) {
          setResults(data.items)
          setActiveIndex(0)
        }
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 200)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, open])

  // Reposition dropdown on window events
  useEffect(() => {
    if (!open) return
    const onReposition = () => setPositionTick((tick) => tick + 1)
    window.addEventListener("resize", onReposition)
    window.addEventListener("scroll", onReposition, true)
    return () => {
      window.removeEventListener("resize", onReposition)
      window.removeEventListener("scroll", onReposition, true)
    }
  }, [open])

  // Dismiss on outside click
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return
      setDropdownOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [])

  // Auto scroll active option into view
  useEffect(() => {
    if (!open) return
    const activeEl = dropdownRef.current?.querySelector<HTMLElement>("[data-active='true']")
    activeEl?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, open])

  const selectFamily = (family: Family) => {
    setSelected(family)
    onChange(family.id, family)
    setQuery("")
    setDropdownOpen(false)
  }

  const clearSelection = (e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected(null)
    onChange("")
    setQuery("")
    setDropdownOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter") {
        setDropdownOpen(true)
        event.preventDefault()
      }
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((prev) => (results.length === 0 ? 0 : Math.min(prev + 1, results.length - 1)))
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((prev) => Math.max(prev - 1, 0))
      return
    }

    if (event.key === "Enter") {
      event.preventDefault()
      if (results[activeIndex]) {
        selectFamily(results[activeIndex])
      }
      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      setDropdownOpen(false)
      return
    }
  }

  const displayValue = open ? query : selected ? formatFamilyOption(selected) : ""

  const menu =
    open && inputRef.current ? (
      <ul
        ref={dropdownRef}
        id={listId}
        role="listbox"
        style={getMenuStyle(inputRef.current)}
        className="overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl p-1 divide-y divide-border/20"
      >
        {loading ? (
          <li className="flex items-center justify-center gap-2 px-4 py-6 text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Searching families…</span>
          </li>
        ) : results.length === 0 ? (
          <li className="px-4 py-6 text-center text-xs text-muted-foreground">
            <Users className="w-6 h-6 mx-auto mb-1 text-muted-foreground/60" />
            <p className="font-medium text-foreground">No families found</p>
            {query.trim() && <p className="mt-0.5 text-[11px]">No active family matching “{query.trim()}”</p>}
            <a
              href="/family-contributions/families"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Register New Family
            </a>
          </li>
        ) : (
          <>
            {results.map((family, idx) => {
              const isSelected = family.id === value
              const isHighlighted = idx === activeIndex

              return (
                <li key={family.id} role="option" aria-selected={isSelected} className="pt-0.5">
                  <button
                    type="button"
                    data-active={isHighlighted}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => selectFamily(family)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm rounded-lg transition-colors cursor-pointer",
                      isHighlighted ? "bg-primary/10 text-foreground" : "hover:bg-muted/70 text-foreground",
                      isSelected ? "font-semibold" : "",
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="shrink-0 font-mono text-[11px] font-bold bg-muted px-2 py-0.5 rounded-md border border-border/80 text-foreground">
                        #{family.family_number}
                      </span>
                      <div className="min-w-0 flex-1 truncate">
                        <HighlightMatch
                          text={formatFamilyOption(family)}
                          query={query}
                          className="truncate text-sm font-medium text-foreground block"
                        />
                        {(family.house_name || family.phone) && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground truncate mt-0.5">
                            {family.house_name && <span>{family.house_name}</span>}
                            {family.house_name && family.phone && <span>·</span>}
                            {family.phone && <span>{family.phone}</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {family.ward && (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">
                          <MapPin className="w-3 h-3 text-muted-foreground/70" />
                          {family.ward}
                        </span>
                      )}
                      {isSelected && <Check className="w-4 h-4 text-primary" />}
                    </div>
                  </button>
                </li>
              )
            })}
            <li className="sticky bottom-0 bg-popover/95 backdrop-blur-xs border-t border-border/40 px-3 py-1.5 flex items-center justify-between text-[10px] text-muted-foreground select-none">
              <span className="font-medium">{results.length} families found</span>
              <span className="flex items-center gap-2">
                <span><kbd className="px-1 py-0.5 rounded bg-muted font-mono">↑</kbd> <kbd className="px-1 py-0.5 rounded bg-muted font-mono">↓</kbd> navigate</span>
                <span><kbd className="px-1 py-0.5 rounded bg-muted font-mono">↵</kbd> select</span>
                <span><kbd className="px-1 py-0.5 rounded bg-muted font-mono">esc</kbd> close</span>
              </span>
            </li>
          </>
        )}
      </ul>
    ) : null

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          required={required && !value}
          value={displayValue}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            setQuery(event.target.value)
            setDropdownOpen(true)
            if (selected && event.target.value !== formatFamilyOption(selected)) {
              setSelected(null)
              onChange("")
            }
          }}
          onFocus={() => setDropdownOpen(true)}
          onClick={() => setDropdownOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded-xl border border-input bg-background/90 py-2 pl-9 pr-16 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-xs"
        />

        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value || query ? (
            <button
              type="button"
              onClick={clearSelection}
              aria-label="Clear selected family"
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
              title="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setDropdownOpen(!open)}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180 text-primary")}
            />
          </button>
        </div>
      </div>

      {menu ? createPortal(menu, document.body) : null}
    </div>
  )
}
