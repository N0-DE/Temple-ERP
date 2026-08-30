import type { Category, Settings } from "./family-contributions-types"
import { formatCurrency } from "./family-contributions-types"

const SLUG_SETTING_MAP: Record<string, keyof Settings> = {
  masavari: "masavari_amount",
  "festival-1": "festival_1_minimum",
  "festival-2": "festival_2_minimum",
  "festival-3": "festival_3_minimum",
  drf: "drf_amount",
}

/** Configured amount from settings (or category default) for display in dropdowns. */
export function getCategoryConfiguredAmount(category: Category, settings: Settings | null): number {
  if (!settings) return category.default_amount || category.minimum_amount || 0
  const field = SLUG_SETTING_MAP[category.slug]
  if (field) return Number(settings[field] ?? 0)
  return category.default_amount || category.minimum_amount || 0
}

export function formatCategoryOptionLabel(category: Category, settings: Settings | null): string {
  const amount = getCategoryConfiguredAmount(category, settings)
  if (amount > 0) return `${category.name} — ${formatCurrency(amount)}`
  return category.name
}

export function isAutoFillCategory(slug: string): boolean {
  return slug === "masavari" || slug === "drf"
}

type FamilyLike = { family_number: string; head_of_family?: string; family_name?: string }

/** Primary display name — e.g. "Family 1". */
export function formatFamilyLabel(family: FamilyLike): string {
  return family.family_number
}

/** Dropdown label — "Family 1" or "Family 1 — John" when head differs. */
export function formatFamilyOption(family: FamilyLike): string {
  const head = (family.head_of_family || family.family_name || "").trim()
  if (head && head.toLowerCase() !== family.family_number.toLowerCase()) {
    return `${family.family_number} — ${head}`
  }
  return family.family_number
}
