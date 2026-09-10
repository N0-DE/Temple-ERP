import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Search, X } from "lucide-react"
import { fcApi } from "@/lib/family-contributions-api"
import type { Family } from "@/lib/family-contributions-types"
import { formatFamilyOption } from "@/lib/family-contributions-utils"

type Props = {
  value: string
  onChange: (familyId: string, family?: Family) => void
  onOpenChange?: (open: boolean) => void
  required?: boolean
}

const DROPDOWN_MAX_HEIGHT = 280

function getMenuStyle(input: HTMLInputElement): React.CSSProperties {
  const rect = input.getBoundingClientRect()
  const gap = 4
  const spaceBelow = window.innerHeight - rect.bottom - gap
  const spaceAbove = rect.top - gap
  const openBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove
  const maxHeight = Math.max(120, Math.min(DROPDOWN_MAX_HEIGHT, openBelow ? spaceBelow : spaceAbove))

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

export function FamilySearchSelect({ value, onChange, onOpenChange, required }: Props) {
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
  const [, setPositionTick] = useState(0)

  const setDropdownOpen = (next: boolean) => {
    setOpen(next)
    onOpenChange?.(next)
  }

  useEffect(() => {
    if (!value) {
      setSelected(null)
      return
    }
    if (selected?.id === value) return
    let cancelled = false
    fcApi.getFamily(value)
      .then((family) => { if (!cancelled) setSelected(family) })
      .catch(() => { if (!cancelled) setSelected(null) })
    return () => { cancelled = true }
  }, [value, selected?.id])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await fcApi.getFamilies({
          page: 1,
          page_size: 25,
          status: "Active",
          ...(query.trim() ? { search: query.trim() } : {}),
        })
        if (!cancelled) setResults(data.items)
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, open])

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

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return
      setDropdownOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [])

  const selectFamily = (family: Family) => {
    setSelected(family)
    onChange(family.id, family)
    setQuery("")
    setDropdownOpen(false)
  }

  const clearSelection = () => {
    setSelected(null)
    onChange("")
    setQuery("")
    setDropdownOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const displayValue = open ? query : selected ? formatFamilyOption(selected) : ""

  const menu = open && inputRef.current ? (
    <ul
      ref={dropdownRef}
      id={listId}
      role="listbox"
      style={getMenuStyle(inputRef.current)}
      className="overflow-y-auto rounded-lg border border-border shadow-xl"
    >
      {loading ? (
        <li className="px-3 py-2 text-sm text-muted-foreground">Searching…</li>
      ) : results.length === 0 ? (
        <li className="px-3 py-2 text-sm text-muted-foreground">No families found</li>
      ) : (
        results.map((family) => (
          <li key={family.id} role="option" aria-selected={family.id === value}>
            <button
              type="button"
              onClick={() => selectFamily(family)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              <span>{formatFamilyOption(family)}</span>
              {family.ward ? <span className="shrink-0 text-xs text-muted-foreground">{family.ward}</span> : null}
            </button>
          </li>
        ))
      )}
    </ul>
  ) : null

  return (
    <div ref={containerRef} className="relative">
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
          placeholder="Search family or family number..."
          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-16 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {value ? (
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Clear selected family"
            className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      {menu ? createPortal(menu, document.body) : null}
    </div>
  )
}
