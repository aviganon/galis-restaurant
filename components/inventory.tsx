"use client"

import { useState, useEffect } from "react"
import { collection, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Search,
  Plus,
  Minus,
  Package,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  History,
  ArrowDown,
  ArrowUp,
  Loader2,
} from "lucide-react"

interface InventoryItem {
  id: string
  name: string
  currentStock: number
  unit: string
  minStock: number
  maxStock: number
  supplier: string
}

const isOwnerRole = (role: string, isSystemOwner?: boolean) => isSystemOwner || role === "owner"

export function Inventory() {
  const { currentRestaurantId, userRole, isSystemOwner } = useApp()
  const isOwner = isOwnerRole(userRole, isSystemOwner)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [stockFilter, setStockFilter] = useState("all")

  useEffect(() => {
    if (!currentRestaurantId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const load = async () => {
      try {
        const restSnap = await getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients"))
        const globalSnap = isOwner ? await getDocs(collection(db, "ingredients")) : null
        const byId = new Map<string, InventoryItem>()
        restSnap.forEach((d) => {
          const data = d.data()
          byId.set(d.id, {
            id: d.id,
            name: d.id,
            currentStock: typeof data.stock === "number" ? data.stock : 0,
            unit: (data.unit as string) || "ק\"ג",
            minStock: typeof data.minStock === "number" ? data.minStock : 0,
            maxStock: typeof data.maxStock === "number" ? data.maxStock : 100,
            supplier: (data.supplier as string) || "",
          })
        })
        globalSnap?.forEach((d) => {
          if (!byId.has(d.id)) {
            const data = d.data()
            byId.set(d.id, {
              id: d.id,
              name: d.id,
              currentStock: typeof data.stock === "number" ? data.stock : 0,
              unit: (data.unit as string) || "ק\"ג",
              minStock: typeof data.minStock === "number" ? data.minStock : 0,
              maxStock: typeof data.maxStock === "number" ? data.maxStock : 100,
              supplier: (data.supplier as string) || "",
            })
          }
        })
        setItems(Array.from(byId.values()))
      } catch (e) {
        console.error("load inventory:", e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentRestaurantId, isOwner])

  const getStockStatus = (item: InventoryItem) => {
    if (item.currentStock === 0) return { status: "אזל", color: "bg-red-500", textColor: "text-red-600", icon: XCircle }
    if (item.minStock > 0 && item.currentStock < item.minStock) return { status: "נמוך", color: "bg-amber-500", textColor: "text-amber-600", icon: AlertTriangle }
    if (item.maxStock > 0 && item.currentStock >= item.maxStock * 0.8) return { status: "מלא", color: "bg-emerald-500", textColor: "text-emerald-600", icon: CheckCircle2 }
    return { status: "תקין", color: "bg-blue-500", textColor: "text-blue-600", icon: CheckCircle2 }
  }

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.includes(searchTerm)
    const matchesStock =
      stockFilter === "all" ||
      (stockFilter === "low" && item.minStock > 0 && item.currentStock < item.minStock && item.currentStock > 0) ||
      (stockFilter === "zero" && item.currentStock === 0) ||
      (stockFilter === "ok" && item.currentStock >= item.minStock)
    return matchesSearch && matchesStock
  })

  const stats = {
    totalItems: items.length,
    lowStock: items.filter((i) => i.minStock > 0 && i.currentStock < i.minStock && i.currentStock > 0).length,
    outOfStock: items.filter((i) => i.currentStock === 0).length,
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!currentRestaurantId) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-2xl font-bold mb-1">מלאי</h1>
        <p className="text-muted-foreground">בחר מסעדה</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Package className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">פריטים במלאי</p>
                  <p className="text-2xl font-bold">{stats.totalItems}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500/10">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">מלאי נמוך</p>
                  <p className="text-2xl font-bold">{stats.lowStock}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-red-500/10">
                  <XCircle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">אזל מהמלאי</p>
                  <p className="text-2xl font-bold">{stats.outOfStock}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex items-center gap-2 flex-1">
              <span className="font-bold text-lg">ניהול מלאי</span>
              <Badge variant="secondary">{filteredItems.length} פריטים</Badge>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3 mt-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חפש פריט..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pr-10" />
            </div>
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="סטטוס מלאי" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל המלאי</SelectItem>
                <SelectItem value="low">מלאי נמוך</SelectItem>
                <SelectItem value="zero">אזל</SelectItem>
                <SelectItem value="ok">תקין</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              אין פריטים במלאי. הוסף רכיבים בהעלאה או בעץ מוצר.
            </CardContent>
          </Card>
        ) : (
          filteredItems.map((item, index) => {
            const stockStatus = getStockStatus(item)
            const StatusIcon = stockStatus.icon
            const stockPercentage = item.maxStock > 0 ? Math.min((item.currentStock / item.maxStock) * 100, 100) : 0
            return (
              <motion.div key={item.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.02 }}>
                <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-lg">{item.name}</h3>
                        <p className="text-sm text-muted-foreground">{item.supplier || "—"}</p>
                      </div>
                      <Badge className={`${stockStatus.color} text-white`}>
                        <StatusIcon className="w-3 h-3 ml-1" />
                        {stockStatus.status}
                      </Badge>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">כמות במלאי</span>
                          <span className={`font-bold ${stockStatus.textColor}`}>
                            {item.currentStock} / {item.maxStock || "—"} {item.unit}
                          </span>
                        </div>
                        <Progress value={stockPercentage} className="h-2" />
                      </div>

                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">מינימום</span>
                        <span>{item.minStock} {item.unit}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })
        )}
      </div>
    </div>
  )
}
