import { useEffect, useId, useRef, useState } from "react"
import { ChevronDown, Search, X } from "lucide-react"
import { fcApi } from "@/lib/family-contributions-api"
import type { Family } from "@/lib/family-contributions-types"
import { formatFamilyOption } from "@/lib/family-contributions-utils"

type Props = {
  value: string
  onChange: (familyId: string, family?: Family) => void
  required?: boolean
}

export function FamilySearchSelect({ value, onChange, required }: Props) {
  const inputId = useId()
  const listId = `${inputId}-listbox`
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Family[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Family | null>(null)

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
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [])

  const selectFamily = (family: Family) => {
    setSelected(family)
    onChange(family.id, family)
    setQuery("")
    setOpen(false)
  }

  const clearSelection = () => {
    setSelected(null)
    onChange("")
    setQuery("")
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const displayValue = open ? query : selected ? formatFamilyOption(selected) : ""

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
            setOpen(true)
            if (selected && event.target.value !== formatFamilyOption(selected)) {
              setSelected(null)
              onChange("")
            }
          }}
          onFocus={() => setOpen(true)}
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

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-popover py-1 shadow-md"
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
      ) : null}
    </div>
  )
}
