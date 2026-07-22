import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Plus, Search, Filter, History } from "lucide-react"

type Devotee = {
  id: number
  name: string
  phone: string
  address: string
  star: string
  nakshatra: string
  total_donations: number
}

export default function DevoteeManagement() {
  const [devotees, setDevotees] = useState<Devotee[]>([])
  const [search, setSearch] = useState("")

  useEffect(() => {
    // Mock Data
    setDevotees([
      { id: 1, name: "Ramesh Kumar", phone: "+91 9876543210", address: "123 Main St, City", star: "Mesha", nakshatra: "Aswini", total_donations: 5000 },
      { id: 2, name: "Anita Sharma", phone: "+91 9876512345", address: "45 Park Avenue, City", star: "Vrishabha", nakshatra: "Rohini", total_donations: 1200 },
    ])
  }, [])

  const filtered = devotees.filter(d => 
    d.name.toLowerCase().includes(search.toLowerCase()) || 
    d.phone.includes(search)
  )

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Devotee Management</h1>
          <p className="text-muted-foreground mt-1">Manage devotee records and history.</p>
        </div>
        
        <button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm">
          <Plus className="w-4 h-4" />
          Add Devotee
        </button>
      </div>

      <div className="flex items-center gap-4 bg-card p-2 rounded-xl border border-border shadow-sm">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search by name or phone..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent border-none text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 pl-10 text-sm"
          />
        </div>
        <div className="h-6 w-px bg-border"></div>
        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground px-2">
          <Filter className="w-4 h-4" />
          Filter
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">Name</th>
                <th className="px-6 py-4 font-medium">Contact</th>
                <th className="px-6 py-4 font-medium">Star / Nakshatra</th>
                <th className="px-6 py-4 font-medium">Total Donations</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((devotee) => (
                <tr key={devotee.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground">{devotee.name}</td>
                  <td className="px-6 py-4 text-muted-foreground">{devotee.phone}</td>
                  <td className="px-6 py-4 text-muted-foreground">{devotee.star} / {devotee.nakshatra}</td>
                  <td className="px-6 py-4 font-medium text-primary">₹{devotee.total_donations}</td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-muted-foreground hover:text-primary transition-colors flex items-center justify-end gap-1 ml-auto">
                      <History className="w-4 h-4" />
                      <span className="text-xs font-medium">History</span>
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    No devotees found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  )
}
