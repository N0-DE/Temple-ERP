import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { ThemeProvider } from "./components/theme-provider"
import { BookingsProvider } from "./lib/bookings-context"
import { PoojasProvider } from "./lib/poojas-context"
import { LanguageProvider } from "./lib/language-context"
import { Layout } from "./components/Layout"
import PoojaManagement from "./pages/PoojaManagement"
import Settlement from "./pages/Settlement"
import OpeningBalance from "./pages/OpeningBalance"
import FamilyContributionsLayout from "./pages/family-contributions/Layout"
import FamiliesPage from "./pages/family-contributions/FamiliesPage"
import ContributionsPage from "./pages/family-contributions/ContributionsPage"
import OutstandingPage from "./pages/family-contributions/OutstandingPage"
import FamilyDetailPage from "./pages/family-contributions/FamilyDetailPage"
import ReportsPage from "./pages/family-contributions/ReportsPage"
import SettingsPage from "./pages/family-contributions/SettingsPage"
import FestivalChargesPage from "./pages/family-contributions/FestivalChargesPage"

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="temple-erp-theme">
      <LanguageProvider>
        <PoojasProvider>
          <BookingsProvider>
            <Router>
              <Routes>
                <Route path="/" element={<Layout />}>
                  <Route index element={<PoojaManagement />} />
                  <Route path="settlement" element={<Settlement />} />
                  <Route path="opening-balance" element={<OpeningBalance />} />
                  <Route path="family-contributions" element={<FamilyContributionsLayout />}>
                    <Route index element={<Navigate to="outstanding" replace />} />
                    <Route path="families" element={<FamiliesPage />} />
                    <Route path="families/:familyId" element={<FamilyDetailPage />} />
                    <Route path="contributions" element={<ContributionsPage />} />
                    <Route path="outstanding" element={<OutstandingPage />} />
                    <Route path="festival-charges" element={<FestivalChargesPage />} />
                    <Route path="reports" element={<ReportsPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </Router>
          </BookingsProvider>
        </PoojasProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}

export default App
