import { Outlet } from "react-router-dom"
import { useLanguage } from "@/lib/language-context"
import { FCSubNav } from "@/components/family-contributions/FCSubNav"
import { ToastProvider } from "@/components/family-contributions/Toast"

export default function FamilyContributionsLayout() {
  const { t } = useLanguage()

  return (
    <ToastProvider>
      <div className="w-full max-w-7xl space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-primary">{t("familyContributions")}</p>
          <h1 className="text-2xl font-semibold text-foreground">{t("familyContributionsTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("familyContributionsSubtitle")}</p>
        </div>
        <FCSubNav />
        <Outlet />
      </div>
    </ToastProvider>
  )
}
