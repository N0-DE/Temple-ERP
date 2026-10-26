import React from "react"

/**
 * Splits query into clean lowercase tokens for multi-word fuzzy search.
 */
export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Checks if every token in `query` exists within `haystack` (order-independent).
 */
export function matchesSearch(haystack: string, query: string): boolean {
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) return true
  const lowerHaystack = haystack.toLowerCase()
  return tokens.every((token) => lowerHaystack.includes(token))
}

/**
 * Escapes regex special characters.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Component that renders text with matched query tokens highlighted.
 */
export function HighlightMatch({
  text,
  query,
  className = "font-medium",
  highlightClassName = "bg-primary/20 text-primary font-semibold rounded-xs px-0.5",
}: {
  text: string
  query: string
  className?: string
  highlightClassName?: string
}) {
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0 || !text) {
    return <span className={className}>{text}</span>
  }

  // Create regex pattern to split text by tokens
  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi")
  const parts = text.split(pattern)

  return (
    <span className={className}>
      {parts.map((part, i) => {
        const isMatch = tokens.some((t) => t.toLowerCase() === part.toLowerCase())
        if (isMatch) {
          return (
            <mark key={i} className={highlightClassName}>
              {part}
            </mark>
          )
        }
        return <React.Fragment key={i}>{part}</React.Fragment>
      })}
    </span>
  )
}
