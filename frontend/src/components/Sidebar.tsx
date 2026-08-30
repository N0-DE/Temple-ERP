import { Link, useLocation } from "react-router-dom"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { useTheme } from "./theme-provider"
import { useLanguage, type TranslationKey } from "@/lib/language-context"
import {
  Flame,
  ReceiptIndianRupee,
  WalletCards,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  HandCoins,
  Users,
  Wallet,
  AlertTriangle,
  BarChart3,
  Settings,
} from "lucide-react"

type SidebarProps = {
  isCollapsed: boolean
  setIsCollapsed: (value: boolean) => void
}

const menuItems: { labelKey: TranslationKey; icon: typeof Flame; path: string }[] = [
  { labelKey: "poojaManagement", icon: Flame, path: "/" },
  { labelKey: "settlement", icon: ReceiptIndianRupee, path: "/settlement" },
  { labelKey: "openingBalance", icon: WalletCards, path: "/opening-balance" },
]

const fcSubItems = [
  { label: "Families", icon: Users, path: "/family-contributions/families" },
  { label: "Contributions", icon: Wallet, path: "/family-contributions/contributions" },
  { label: "Outstanding Dues", icon: AlertTriangle, path: "/family-contributions/outstanding" },
  { label: "Reports", icon: BarChart3, path: "/family-contributions/reports" },
  { label: "Settings", icon: Settings, path: "/family-contributions/settings" },
]

export function Sidebar({ isCollapsed, setIsCollapsed }: SidebarProps) {
  const location = useLocation()
  const { theme, setTheme } = useTheme()
  const { t } = useLanguage()
  const isFcActive = location.pathname.startsWith("/family-contributions")

  return (
    <motion.div
      initial={{ width: isCollapsed ? 80 : 260 }}
      animate={{ width: isCollapsed ? 80 : 260 }}
      className="h-screen bg-card border-r border-border flex flex-col relative z-20"
    >
      <div className="p-4 flex items-center justify-between h-16 border-b border-border">
        {!isCollapsed && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-bold text-xl tracking-tight text-primary flex items-center gap-2">
            <Flame className="w-6 h-6" />
            {t("templeErp")}
          </motion.div>
        )}
        {isCollapsed && (
          <div className="w-full flex justify-center text-primary">
            <Flame className="w-6 h-6" />
          </div>
        )}
      </div>

      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-20 bg-primary text-primary-foreground rounded-full p-1 shadow-md hover:bg-primary/90 transition-colors"
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      <div className="flex-1 py-4 flex flex-col gap-1 overflow-y-auto overflow-x-hidden px-3">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path
          const label = t(item.labelKey)
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group",
                isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <item.icon className={cn("w-5 h-5 flex-shrink-0", isActive ? "text-primary" : "")} />
              {!isCollapsed && <span className="truncate whitespace-nowrap">{label}</span>}
            </Link>
          )
        })}

        {/* Family Contributions section */}
        <div className="mt-2">
          <Link
            to="/family-contributions/outstanding"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200",
              isFcActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <HandCoins className={cn("w-5 h-5 flex-shrink-0", isFcActive ? "text-primary" : "")} />
            {!isCollapsed && <span className="truncate whitespace-nowrap">{t("familyContributions")}</span>}
          </Link>

          {!isCollapsed && isFcActive && (
            <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-border pl-3">
              {fcSubItems.map((sub) => {
                const subActive = location.pathname === sub.path || location.pathname.startsWith(sub.path + "/")
                return (
                  <Link
                    key={sub.path}
                    to={sub.path}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition",
                      subActive ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <sub.icon className="h-3.5 w-3.5" />
                    {sub.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="p-3 border-t border-border">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200", "text-muted-foreground hover:bg-secondary hover:text-foreground")}
        >
          {theme === "dark" ? <Sun className="w-5 h-5 flex-shrink-0 text-yellow-400" /> : <Moon className="w-5 h-5 flex-shrink-0 text-slate-600" />}
          {!isCollapsed && <span className="truncate whitespace-nowrap text-sm font-medium">{theme === "dark" ? t("lightMode") : t("darkMode")}</span>}
        </button>
      </div>
    </motion.div>
  )
}
