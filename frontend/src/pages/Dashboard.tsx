import { motion } from "framer-motion"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts"

const data = [
  { name: "Mon", collection: 4000, bookings: 24 },
  { name: "Tue", collection: 3000, bookings: 13 },
  { name: "Wed", collection: 2000, bookings: 98 },
  { name: "Thu", collection: 2780, bookings: 39 },
  { name: "Fri", collection: 1890, bookings: 48 },
  { name: "Sat", collection: 2390, bookings: 38 },
  { name: "Sun", collection: 3490, bookings: 43 },
]

export default function Dashboard() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Placeholder Cards */}
        {[
          { title: "Today's Collection", value: "₹45,230" },
          { title: "Today's Bookings", value: "142" },
          { title: "Pending Settlements", value: "12" },
          { title: "Special Poojas", value: "5" },
        ].map((stat, i) => (
          <div key={i} className="p-6 bg-card border border-border rounded-xl shadow-sm">
            <h3 className="text-sm font-medium text-muted-foreground">{stat.title}</h3>
            <p className="text-2xl font-bold mt-2">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-card border border-border rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-bold mb-4">Weekly Collection</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: "hsl(var(--muted-foreground))"}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: "hsl(var(--muted-foreground))"}} />
                <Tooltip 
                  cursor={{fill: "hsl(var(--secondary))"}} 
                  contentStyle={{backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))"}} 
                />
                <Bar dataKey="collection" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-bold mb-4">Weekly Bookings</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: "hsl(var(--muted-foreground))"}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: "hsl(var(--muted-foreground))"}} />
                <Tooltip 
                  contentStyle={{backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))"}} 
                />
                <Line type="monotone" dataKey="bookings" stroke="hsl(var(--primary))" strokeWidth={3} dot={{r: 4, fill: "hsl(var(--primary))"}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
