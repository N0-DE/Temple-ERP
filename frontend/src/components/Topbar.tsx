import { useLanguage } from "@/lib/language-context"
import { GlobalSearch } from "./GlobalSearch"

export function Topbar() {
  const { language, setLanguage, t } = useLanguage()

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 sticky top-0 z-10 shadow-sm">
      <div className="flex-1 flex items-center gap-3">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-4">
        <label className="sr-only" htmlFor="language-selector">{t("language")}</label>
        <select
          id="language-selector"
          value={language}
          onChange={(event) => setLanguage(event.target.value as typeof language)}
          className="rounded-lg border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="en">English</option>
          <option value="ml">മലയാളം</option>
        </select>
        {/* Notification Bell */}
        <button className="text-muted-foreground hover:text-foreground transition-colors relative">
          <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-destructive rounded-full"></span>
        </button>

        {/* User Avatar */}
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary cursor-pointer hover:bg-primary/30 transition-colors">
          <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
        </div>
      </div>
    </header>
  )
}
