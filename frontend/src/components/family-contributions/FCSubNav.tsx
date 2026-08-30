import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"
import { Users, Wallet, AlertTriangle, BarChart3, Settings, Sparkles } from "lucide-react"

const links = [
  { to: "/family-contributions/families", label: "Families", icon: Users },
  { to: "/family-contributions/contributions", label: "Contributions", icon: Wallet },
  { to: "/family-contributions/outstanding", label: "Outstanding Dues", icon: AlertTriangle },
  { to: "/family-contributions/festival-charges", label: "Festival Charges", icon: Sparkles },
  { to: "/family-contributions/reports", label: "Reports", icon: BarChart3 },
  { to: "/family-contributions/settings", label: "Settings", icon: Settings },
]

export function FCSubNav() {
  return (
    <nav className="flex flex-wrap gap-2 border-b border-border pb-4">
      {links.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
              isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground",
            )
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
