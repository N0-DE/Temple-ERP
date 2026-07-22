import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

export type Language = "en" | "ml"

const translations = {
  en: {
    language: "Language",
    searchEverywhere: "Search everywhere... (Ctrl+K)",
    templeErp: "Temple ERP",
    lightMode: "Light Mode",
    darkMode: "Dark Mode",

    // Nav / pages
    poojaManagement: "Pooja Management",
    poojaManagementSubtitle: "{count} poojas available · Search, filter, and manage.",
    settlement: "Settlement",
    settlementSubtitle: "Track and manage all collection records.",
    openingBalance: "Opening Balance",
    openingBalanceSubtitle: "Set the cash available at the counter before collections.",

    // Common
    cancel: "Cancel",
    save: "Save",
    saveChanges: "Save Changes",
    delete: "Delete",
    close: "Close",
    closeSearch: "Close search",
    done: "Done",
    saving: "Saving...",
    all: "All",
    search: "Search",
    mins: "mins",
    amount: "Amount",
    date: "Date",
    time: "Time",
    mode: "Mode",
    category: "Category",
    description: "Description",
    remarks: "Remarks",
    status: "Status",
    total: "Total",
    printReceipt: "Print receipt",
    reprintReceipt: "Reprint receipt",
    reprintReceiptFor: "Reprint receipt for {name}",

    // Categories
    catHomam: "Homam",
    catGeneral: "General",
    catSpecial: "Special",
    catFestival: "Festival",

    // Date filters
    today: "Today",
    yesterday: "Yesterday",
    weekly: "Weekly",
    monthly: "Monthly",

    // Payment modes
    cash: "Cash",
    upi: "UPI",
    card: "Card",
    netBanking: "Net Banking",

    // Pooja management
    addPooja: "Add Pooja",
    addNewPooja: "Add New Pooja",
    editPooja: "Edit Pooja",
    deletePooja: "Delete Pooja?",
    deletePoojaConfirm: 'Are you sure you want to delete "{name}"? This cannot be undone.',
    poojaName: "Pooja Name *",
    amountInr: "Amount (₹) *",
    durationMins: "Duration (mins)",
    searchPoojaPlaceholder: "Search by name or category...",
    noPoojasFound: "No poojas found",
    tryDifferentSearch: "Try a different search or category.",
    bookNow: "Book Now",

    // Settlement
    exportExcel: "Export Excel",
    pdfPrint: "PDF / Print",
    totalPaidCollection: "Total Paid Collection",
    todaysCollection: "Today's Collection",
    thisWeek: "This Week",
    last30Days: "Last 30 Days",
    searchSettlementPlaceholder: "Search by receipt, devotee, pooja, mode, or date...",
    receipt: "Receipt",
    devotee: "Devotee",
    pooja: "Pooja",
    noSettlementRecords: "No settlement records match your search or date filter.",
    showingRecords: "Showing {shown} of {total} loaded records",
    loadOlderRecords: "Load older records",
    settlementReportTitle: "Temple ERP — Settlement Report",
    generatedOn: "Generated on:",
    totalCollection: "Total Collection:",
    recordsCount: "({count} records)",
    receiptNo: "Receipt No.",
    paymentMode: "Payment Mode",
    dateTime: "Date & Time",

    // Opening balance
    currentCashCollection: "Current Cash Collection",
    cashInHand: "Cash in Hand",
    counterOpeningBalance: "Counter opening balance",
    counterOpeningHelp: "This is added to all paid cash bookings to calculate cash in hand.",
    saveBalance: "Save Balance",
    openingBalanceAria: "Opening balance",
    openingBalanceFootnote: "Opening balance + current paid cash collection = cash in hand. UPI and card payments are not included in cash.",
    offlineBalanceMsg: "Working offline — the balance will remain saved on this device.",
    invalidOpeningBalance: "Enter a valid opening balance of zero or more.",
    openingBalanceSaved: "Opening balance saved.",
    openingBalanceSavedLocal: "Saved on this device. It will sync when Firebase is available.",

    // Booking modal
    bookPooja: "Book {name}",
    amountLabel: "Amount:",
    bookingConfirmed: "Booking Confirmed!",
    bookingConfirmedBody: "Receipt sent to the printer. The booking is now available in Settlement.",
    devoteeName: "Devotee Name *",
    phoneNumber: "Phone Number *",
    address: "Address",
    starRasi: "Star / Rasi",
    selectStar: "Select Star",
    nakshatra: "Nakshatra",
    selectNakshatra: "Select Nakshatra",
    dateRequired: "Date *",
    timeRequired: "Time *",
    generateReceipt: "Generate Receipt",
    thankYouBooking: "Thank you for your booking.",
    paid: "Paid",
    at: "at",

    // Global search
    searchEverywhereAria: "Search everywhere",
    pages: "Pages",
    poojas: "Poojas",
    bookings: "Bookings",
    noSearchResults: "No results for “{query}”",
    searchHint: "↑↓ navigate · Enter open · Esc close",
    unnamedDevotee: "Unnamed devotee",
    pagePoojasSubtitle: "Catalog of temple poojas",
    pageSettlementSubtitle: "Bookings, receipts, and collections",
    pageOpeningBalanceSubtitle: "Set the counter opening balance",
  },
  ml: {
    language: "ഭാഷ",
    searchEverywhere: "എവിടെയും തിരയുക... (Ctrl+K)",
    templeErp: "ടെമ്പിൾ ERP",
    lightMode: "ലൈറ്റ് മോഡ്",
    darkMode: "ഡാർക്ക് മോഡ്",

    poojaManagement: "പൂജാ മാനേജ്മെന്റ്",
    poojaManagementSubtitle: "{count} പൂജകൾ ലഭ്യമാണ് · തിരയുക, ഫിൽട്ടർ ചെയ്യുക, നിയന്ത്രിക്കുക.",
    settlement: "സെറ്റിൽമെന്റ്",
    settlementSubtitle: "എല്ലാ ശേഖരണ രേഖകളും ട്രാക്ക് ചെയ്ത് നിയന്ത്രിക്കുക.",
    openingBalance: "ഓപ്പണിംഗ് ബാലൻസ്",
    openingBalanceSubtitle: "ശേഖരണത്തിന് മുമ്പ് കൗണ്ടറിലുള്ള പണം സജ്ജമാക്കുക.",

    cancel: "റദ്ദാക്കുക",
    save: "സേവ് ചെയ്യുക",
    saveChanges: "മാറ്റങ്ങൾ സേവ് ചെയ്യുക",
    delete: "ഇല്ലാതാക്കുക",
    close: "അടയ്ക്കുക",
    closeSearch: "തിരച്ചിൽ അടയ്ക്കുക",
    done: "പൂർത്തിയായി",
    saving: "സേവ് ചെയ്യുന്നു...",
    all: "എല്ലാം",
    search: "തിരയുക",
    mins: "മിനിറ്റ്",
    amount: "തുക",
    date: "തീയതി",
    time: "സമയം",
    mode: "രീതി",
    category: "വിഭാഗം",
    description: "വിവരണം",
    remarks: "കുറിപ്പുകൾ",
    status: "സ്ഥിതി",
    total: "ആകെ",
    printReceipt: "രസീത് അച്ചടിക്കുക",
    reprintReceipt: "രസീത് വീണ്ടും അച്ചടിക്കുക",
    reprintReceiptFor: "{name}-ന്റെ രസീത് വീണ്ടും അച്ചടിക്കുക",

    catHomam: "ഹോമം",
    catGeneral: "പൊതു",
    catSpecial: "പ്രത്യേകം",
    catFestival: "ഉത്സവം",

    today: "ഇന്ന്",
    yesterday: "ഇന്നലെ",
    weekly: "ആഴ്ച",
    monthly: "മാസം",

    cash: "ക്യാഷ്",
    upi: "UPI",
    card: "കാർഡ്",
    netBanking: "നെറ്റ് ബാങ്കിംഗ്",

    addPooja: "പൂജ ചേർക്കുക",
    addNewPooja: "പുതിയ പൂജ ചേർക്കുക",
    editPooja: "പൂജ എഡിറ്റ് ചെയ്യുക",
    deletePooja: "പൂജ ഇല്ലാതാക്കണോ?",
    deletePoojaConfirm: '"{name}" ഇല്ലാതാക്കണമെന്ന് ഉറപ്പാണോ? ഇത് പഴയപടിയാക്കാനാവില്ല.',
    poojaName: "പൂജയുടെ പേര് *",
    amountInr: "തുക (₹) *",
    durationMins: "ദൈർഘ്യം (മിനിറ്റ്)",
    searchPoojaPlaceholder: "പേര് അല്ലെങ്കിൽ വിഭാഗം അനുസരിച്ച് തിരയുക...",
    noPoojasFound: "പൂജകളൊന്നും കണ്ടെത്തിയില്ല",
    tryDifferentSearch: "മറ്റൊരു തിരച്ചിൽ അല്ലെങ്കിൽ വിഭാഗം പരീക്ഷിക്കുക.",
    bookNow: "ഇപ്പോൾ ബുക്ക് ചെയ്യുക",

    exportExcel: "Excel എക്സ്‌പോർട്ട്",
    pdfPrint: "PDF / അച്ചടി",
    totalPaidCollection: "ആകെ അടച്ച ശേഖരണം",
    todaysCollection: "ഇന്നത്തെ ശേഖരണം",
    thisWeek: "ഈ ആഴ്ച",
    last30Days: "കഴിഞ്ഞ 30 ദിവസം",
    searchSettlementPlaceholder: "രസീത്, ഭക്തൻ, പൂജ, രീതി, അല്ലെങ്കിൽ തീയതി അനുസരിച്ച് തിരയുക...",
    receipt: "രസീത്",
    devotee: "ഭക്തൻ",
    pooja: "പൂജ",
    noSettlementRecords: "തിരച്ചിൽ അല്ലെങ്കിൽ തീയതി ഫിൽട്ടറുമായി പൊരുത്തപ്പെടുന്ന സെറ്റിൽമെന്റ് രേഖകളില്ല.",
    showingRecords: "{total}-ൽ {shown} ലോഡ് ചെയ്ത രേഖകൾ കാണിക്കുന്നു",
    loadOlderRecords: "പഴയ രേഖകൾ ലോഡ് ചെയ്യുക",
    settlementReportTitle: "ടെമ്പിൾ ERP — സെറ്റിൽമെന്റ് റിപ്പോർട്ട്",
    generatedOn: "സൃഷ്ടിച്ച തീയതി:",
    totalCollection: "ആകെ ശേഖരണം:",
    recordsCount: "({count} രേഖകൾ)",
    receiptNo: "രസീത് നം.",
    paymentMode: "പേയ്‌മെന്റ് രീതി",
    dateTime: "തീയതിയും സമയവും",

    currentCashCollection: "നിലവിലെ ക്യാഷ് ശേഖരണം",
    cashInHand: "കയ്യിലുള്ള പണം",
    counterOpeningBalance: "കൗണ്ടർ ഓപ്പണിംഗ് ബാലൻസ്",
    counterOpeningHelp: "കയ്യിലുള്ള പണം കണക്കാക്കാൻ അടച്ച ക്യാഷ് ബുക്കിംഗുകളോടൊപ്പം ഇത് ചേർക്കുന്നു.",
    saveBalance: "ബാലൻസ് സേവ് ചെയ്യുക",
    openingBalanceAria: "ഓപ്പണിംഗ് ബാലൻസ്",
    openingBalanceFootnote: "ഓപ്പണിംഗ് ബാലൻസ് + നിലവിലെ അടച്ച ക്യാഷ് ശേഖരണം = കയ്യിലുള്ള പണം. UPIയും കാർഡ് പേയ്‌മെന്റുകളും ക്യാഷിൽ ഉൾപ്പെടുത്തിയിട്ടില്ല.",
    offlineBalanceMsg: "ഓഫ്‌ലൈനിൽ പ്രവർത്തിക്കുന്നു — ബാലൻസ് ഈ ഉപകരണത്തിൽ സേവ് ചെയ്യും.",
    invalidOpeningBalance: "പൂജ്യമോ അതിലധികമോ ആയ സാധുവായ ഓപ്പണിംഗ് ബാലൻസ് നൽകുക.",
    openingBalanceSaved: "ഓപ്പണിംഗ് ബാലൻസ് സേവ് ചെയ്തു.",
    openingBalanceSavedLocal: "ഈ ഉപകരണത്തിൽ സേവ് ചെയ്തു. Firebase ലഭ്യമാകുമ്പോൾ സിങ്ക് ചെയ്യും.",

    bookPooja: "{name} ബുക്ക് ചെയ്യുക",
    amountLabel: "തുക:",
    bookingConfirmed: "ബുക്കിംഗ് സ്ഥിരീകരിച്ചു!",
    bookingConfirmedBody: "രസീത് പ്രിന്ററിലേക്ക് അയച്ചു. ബുക്കിംഗ് ഇപ്പോൾ സെറ്റിൽമെന്റിൽ ലഭ്യമാണ്.",
    devoteeName: "ഭക്തന്റെ പേര് *",
    phoneNumber: "ഫോൺ നമ്പർ *",
    address: "വിലാസം",
    starRasi: "നക്ഷത്രം / രാശി",
    selectStar: "രാശി തിരഞ്ഞെടുക്കുക",
    nakshatra: "നക്ഷത്രം",
    selectNakshatra: "നക്ഷത്രം തിരഞ്ഞെടുക്കുക",
    dateRequired: "തീയതി *",
    timeRequired: "സമയം *",
    generateReceipt: "രസീത് സൃഷ്ടിക്കുക",
    thankYouBooking: "നിങ്ങളുടെ ബുക്കിംഗിന് നന്ദി.",
    paid: "അടച്ചു",
    at: "ന്",

    searchEverywhereAria: "എവിടെയും തിരയുക",
    pages: "പേജുകൾ",
    poojas: "പൂജകൾ",
    bookings: "ബുക്കിംഗുകൾ",
    noSearchResults: "“{query}” എന്നതിന് ഫലങ്ങളൊന്നുമില്ല",
    searchHint: "↑↓ നാവിഗേറ്റ് · Enter തുറക്കുക · Esc അടയ്ക്കുക",
    unnamedDevotee: "പേരില്ലാത്ത ഭക്തൻ",
    pagePoojasSubtitle: "ക്ഷേത്ര പൂജകളുടെ കാറ്റലോഗ്",
    pageSettlementSubtitle: "ബുക്കിംഗുകൾ, രസീതുകൾ, ശേഖരണങ്ങൾ",
    pageOpeningBalanceSubtitle: "കൗണ്ടർ ഓപ്പണിംഗ് ബാലൻസ് സജ്ജമാക്കുക",
  },
} as const

export type TranslationKey = keyof typeof translations.en

type TranslateParams = Record<string, string | number>

type LanguageContextValue = {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: TranslationKey, params?: TranslateParams) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)
const STORAGE_KEY = "temple-erp-language"

function formatMessage(template: string, params?: TranslateParams) {
  if (!params) return template
  return Object.entries(params).reduce(
    (text, [key, value]) => text.replace(new RegExp(`\\{${key}\\}`, "g"), String(value)),
    template,
  )
}

const CATEGORY_KEYS: Record<string, TranslationKey> = {
  All: "all",
  Homam: "catHomam",
  General: "catGeneral",
  Special: "catSpecial",
  Festival: "catFestival",
}

const PAYMENT_KEYS: Record<string, TranslationKey> = {
  Cash: "cash",
  UPI: "upi",
  Card: "card",
  "Net Banking": "netBanking",
}

const DATE_FILTER_KEYS: Record<string, TranslationKey> = {
  All: "all",
  Today: "today",
  Yesterday: "yesterday",
  Weekly: "weekly",
  Monthly: "monthly",
}

export function translateCategory(t: LanguageContextValue["t"], category: string) {
  const key = CATEGORY_KEYS[category]
  return key ? t(key) : category
}

export function translatePaymentMode(t: LanguageContextValue["t"], mode: string) {
  const key = PAYMENT_KEYS[mode]
  return key ? t(key) : mode
}

export function translateDateFilter(t: LanguageContextValue["t"], filter: string) {
  const key = DATE_FILTER_KEYS[filter]
  return key ? t(key) : filter
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() =>
    localStorage.getItem(STORAGE_KEY) === "ml" ? "ml" : "en",
  )

  const setLanguage = useCallback((nextLanguage: Language) => {
    localStorage.setItem(STORAGE_KEY, nextLanguage)
    setLanguageState(nextLanguage)
    document.documentElement.lang = nextLanguage === "ml" ? "ml" : "en"
  }, [])

  const t = useCallback(
    (key: TranslationKey, params?: TranslateParams) =>
      formatMessage(translations[language][key], params),
    [language],
  )

  useEffect(() => {
    document.documentElement.lang = language === "ml" ? "ml" : "en"
  }, [language])

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider")
  return context
}
