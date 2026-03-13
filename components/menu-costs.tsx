"use client"

import { useState, useEffect } from "react"
import { collection, getDocs, getDoc, doc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Search,
  Download,
  TrendingUp,
  TrendingDown,
  DollarSign,
  UtensilsCrossed,
  Percent,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { downloadExcel } from "@/lib/export-excel"
import { toast } from "sonner"
import { useTranslations } from "@/lib/use-translations"

const VAT_RATE = 1.17

interface MenuItem {
  id: string
  name: string
  category: string
  salePrice: number
  foodCost: number
  foodCostPercent: number
  profit: number
  profitMargin: number
  status: "excellent" | "good" | "warning" | "critical"
  salesCount: number
}

const isOwnerRole = (role: string, isSystemOwner?: boolean) => isSystemOwner || role === "owner"

export function MenuCosts() {
  const t = useTranslations()
  const { currentRestaurantId, userRole, isSystemOwner, refreshIngredientsKey } = useApp()
  const isOwner = isOwnerRole(userRole, isSystemOwner)
  const [items, setItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("הכל")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortBy, setSortBy] = useState("name")

  useEffect(() => {
    if (!currentRestaurantId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const load = async () => {
      try {
        const [recSnap, restIngSnap, asDoc, salesDoc] = await Promise.all([
          getDocs(collection(db, "restaurants", currentRestaurantId, "recipes")),
          getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients")),
          getDoc(doc(db, "restaurants", currentRestaurantId, "appState", "assignedSuppliers")),
          getDoc(doc(db, "restaurants", currentRestaurantId, "appState", `salesReport_${currentRestaurantId}`)),
        ])
        const assignedList: string[] = Array.isArray(asDoc.data()?.list) ? asDoc.data()!.list : []
        const globalIngSnap = isOwner ? await getDocs(collection(db, "ingredients")) : null

        const prices: Record<string, number> = {}
        restIngSnap.forEach((d) => {
          const data = d.data()
          prices[d.id] = typeof data.price === "number" ? data.price : 0
        })
        globalIngSnap?.forEach((d) => {
          if (d.id in prices) return
          const data = d.data()
          const sup = (data.supplier as string) || ""
          if (sup && !assignedList.includes(sup)) return
          prices[d.id] = typeof data.price === "number" ? data.price : 0
        })

        const recipesMap: Record<string, { ingredients: { name: string; qty: number; unit: string; waste: number; isSubRecipe?: boolean }[]; yieldQty?: number }> = {}
        recSnap.docs.forEach((d) => {
          const data = d.data()
          recipesMap[d.id] = {
            ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
            yieldQty: typeof data.yieldQty === "number" ? data.yieldQty : 1,
          }
        })
        const calcIngCost = (name: string, qty: number, waste: number, unit: string, isSubRecipe?: boolean): number => {
          if (isSubRecipe) {
            const rec = recipesMap[name]
            if (!rec?.ingredients?.length) return 0
            const yieldQty = rec.yieldQty ?? 1
            const totalSub = rec.ingredients.reduce((s, sub) => s + calcIngCost(sub.name, sub.qty, sub.waste || 0, sub.unit, sub.isSubRecipe), 0)
            return (totalSub / yieldQty) * qty
          }
          const p = prices[name] ?? 0
          let mult = 1
          if (unit === "גרם") mult = 0.001
          else if (unit === "מל") mult = 0.001
          return qty * p * mult * (1 + waste / 100)
        }

        const dailySales = (salesDoc.data()?.dailySales as Record<string, { avg: number }>) || {}
        const catSet = new Set<string>()
        const list: MenuItem[] = []

        recSnap.docs.forEach((r) => {
          const data = r.data()
          if (data.isCompound) return
          const sellingPrice = (typeof data.sellingPrice === "number" ? data.sellingPrice : 0) / VAT_RATE
          const ing = Array.isArray(data.ingredients) ? data.ingredients : []
          let cost = 0
          ing.forEach((i: { name?: string; qty?: number; waste?: number; unit?: string; isSubRecipe?: boolean }) => {
            cost += calcIngCost(i.name || "", i.qty || 0, i.waste || 0, i.unit || "גרם", i.isSubRecipe)
          })
          const foodCostPct = sellingPrice > 0 ? (cost / sellingPrice) * 100 : 0
          const profit = sellingPrice - cost
          const profitMargin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0
          const sales = dailySales[r.id]?.avg ?? 0
          let status: "excellent" | "good" | "warning" | "critical" = "good"
          if (foodCostPct <= 25) status = "excellent"
          else if (foodCostPct <= 30) status = "good"
          else if (foodCostPct <= 35) status = "warning"
          else status = "critical"

          catSet.add((data.category as string) || "עיקריות")
          list.push({
            id: r.id,
            name: r.id,
            category: (data.category as string) || "עיקריות",
            salePrice: sellingPrice,
            foodCost: cost,
            foodCostPercent: foodCostPct,
            profit,
            profitMargin,
            status,
            salesCount: Math.round(sales),
          })
        })

        setItems(list)
        setCategories(["הכל", ...Array.from(catSet).sort()])
      } catch (e) {
        console.error("load menu costs:", e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentRestaurantId, isOwner, refreshIngredientsKey])

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "excellent":
        return { label: t("pages.menuCosts.excellent"), color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 }
      case "good":
        return { label: t("pages.menuCosts.good"), color: "bg-blue-100 text-blue-700", icon: TrendingUp }
      case "warning":
        return { label: t("pages.menuCosts.checkReview"), color: "bg-amber-100 text-amber-700", icon: AlertTriangle }
      case "critical":
        return { label: t("pages.menuCosts.problematic"), color: "bg-red-100 text-red-700", icon: TrendingDown }
      default:
        return { label: t("pages.menuCosts.unknown"), color: "bg-gray-100 text-gray-700", icon: AlertTriangle }
    }
  }

  const filteredItems = items
    .filter((item) => {
      const matchesSearch = item.name.includes(searchTerm)
      const matchesCategory = categoryFilter === "הכל" || item.category === categoryFilter
      const matchesStatus = statusFilter === "all" || item.status === statusFilter
      return matchesSearch && matchesCategory && matchesStatus
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "cost_asc":
          return a.foodCostPercent - b.foodCostPercent
        case "cost_desc":
          return b.foodCostPercent - a.foodCostPercent
        case "profit_desc":
          return b.profit - a.profit
        case "profit_asc":
          return a.profit - b.profit
        case "sales_desc":
          return b.salesCount - a.salesCount
        default:
          return a.name.localeCompare(b.name, "he")
      }
    })

  const stats = {
    totalItems: items.length,
    avgFoodCost: items.length > 0 ? items.reduce((s, i) => s + i.foodCostPercent, 0) / items.length : 0,
    totalRevenue: items.reduce((s, i) => s + i.salePrice * i.salesCount, 0),
    totalProfit: items.reduce((s, i) => s + i.profit * i.salesCount, 0),
    criticalItems: items.filter((i) => i.status === "critical" || i.status === "warning").length,
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
        <h1 className="text-2xl font-bold mb-1">{t("nav.menuCosts")}</h1>
        <p className="text-muted-foreground">{t("pages.menuCosts.selectRestaurant")}</p>
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
                  <UtensilsCrossed className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("pages.menuCosts.menuItems")}</p>
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
                  <Percent className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("pages.menuCosts.avgFoodCost")}</p>
                  <p className="text-2xl font-bold">{stats.avgFoodCost.toFixed(1)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/10">
                  <DollarSign className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("pages.menuCosts.grossProfit")}</p>
                  <p className="text-2xl font-bold">{stats.totalProfit.toLocaleString()} ש"ח</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-red-500/10">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("pages.menuCosts.dishesToReview")}</p>
                  <p className="text-2xl font-bold">{stats.criticalItems}</p>
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
              <span className="font-bold text-lg">{t("nav.menuCosts")}</span>
              <Badge variant="secondary">{filteredItems.length} {t("pages.menuCosts.dish")}</Badge>
            </div>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                const rows = filteredItems.map((i) => ({
                  "מנה": i.name,
                  "קטגוריה": i.category,
                  "מחיר מכירה": i.salePrice,
                  "עלות מזון": i.foodCost.toFixed(2),
                  "עלות %": i.foodCostPercent.toFixed(1),
                  "רווח": i.profit.toFixed(2),
                  "מרווח %": i.profitMargin.toFixed(1),
                  "סטטוס": i.status === "excellent" ? "מצוין" : i.status === "good" ? "טוב" : i.status === "warning" ? "אזהרה" : "קריטי",
                }))
                downloadExcel(rows, `עלויות_תפריט_${new Date().toISOString().slice(0, 10)}`, "עלויות")
                toast.success(t("pages.ingredients.fileDownloaded"))
              }}
            >
              <Download className="w-4 h-4 ml-2" />
              {t("pages.menuCosts.exportReport")}
            </Button>
          </div>

          <div className="flex flex-col md:flex-row gap-3 mt-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("pages.menuCosts.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder={t("pages.menuCosts.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pages.menuCosts.allStatuses")}</SelectItem>
                <SelectItem value="excellent">{t("pages.menuCosts.excellent")}</SelectItem>
                <SelectItem value="good">{t("pages.menuCosts.good")}</SelectItem>
                <SelectItem value="warning">{t("pages.menuCosts.checkReview")}</SelectItem>
                <SelectItem value="critical">{t("pages.menuCosts.problematic")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">שם מנה</SelectItem>
                <SelectItem value="cost_asc">עלות נמוכה</SelectItem>
                <SelectItem value="cost_desc">עלות גבוהה</SelectItem>
                <SelectItem value="profit_desc">רווח גבוה</SelectItem>
                <SelectItem value="profit_asc">רווח נמוך</SelectItem>
                <SelectItem value="sales_desc">מכירות</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">מנה</TableHead>
                  <TableHead className="text-center">קטגוריה</TableHead>
                  <TableHead className="text-center">מחיר מכירה</TableHead>
                  <TableHead className="text-center">עלות מזון</TableHead>
                  <TableHead className="text-center">% עלות</TableHead>
                  <TableHead className="text-center">רווח</TableHead>
                  <TableHead className="text-center">מכירות</TableHead>
                  <TableHead className="text-center">סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {t("pages.menuCosts.noItems")}. {t("pages.recipes.addInProductTree")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item, index) => {
                    const statusConfig = getStatusConfig(item.status)
                    const StatusIcon = statusConfig.icon
                    const costBarColor = item.foodCostPercent > 35 ? "bg-red-500" : item.foodCostPercent > 30 ? "bg-amber-500" : "bg-emerald-500"
                    return (
                      <motion.tr
                        key={item.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className="hover:bg-muted/50"
                      >
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{item.category}</Badge>
                        </TableCell>
                        <TableCell className="text-center font-semibold">{item.salePrice.toFixed(0)} ש"ח</TableCell>
                        <TableCell className="text-center">{item.foodCost.toFixed(2)} ש"ח</TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span
                              className={cn(
                                "font-bold",
                                item.foodCostPercent > 35 ? "text-red-600" : item.foodCostPercent > 30 ? "text-amber-600" : "text-emerald-600"
                              )}
                            >
                              {item.foodCostPercent.toFixed(1)}%
                            </span>
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className={cn("h-full", costBarColor)} style={{ width: `${Math.min(item.foodCostPercent * 2, 100)}%` }} />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-bold text-emerald-600">{item.profit.toFixed(2)} ש"ח</span>
                          <span className="text-xs text-muted-foreground block">{item.profitMargin.toFixed(1)}%</span>
                        </TableCell>
                        <TableCell className="text-center font-semibold">{item.salesCount}</TableCell>
                        <TableCell className="text-center">
                          <Badge className={statusConfig.color}>
                            <StatusIcon className="w-3 h-3 ml-1" />
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                      </motion.tr>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
