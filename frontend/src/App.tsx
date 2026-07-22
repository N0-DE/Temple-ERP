import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { ThemeProvider } from "./components/theme-provider"
import { BookingsProvider } from "./lib/bookings-context"
import { PoojasProvider } from "./lib/poojas-context"
import { LanguageProvider } from "./lib/language-context"
import { Layout } from "./components/Layout"
import PoojaManagement from "./pages/PoojaManagement"
import Settlement from "./pages/Settlement"
import OpeningBalance from "./pages/OpeningBalance"

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
                  {/* Redirect anything unknown back to root */}
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
