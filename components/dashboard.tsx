"use client"

import { useState, useEffect, useCallback, type ReactNode } from "react"
import { toast } from "sonner"
import { collection, getDocs, getDoc, doc, query, where, orderBy, limit, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { loadGlobalPriceSubdocsMap, pickGlobalIngredientRowFromAssigned } from "@/lib/ingredient-assigned-price"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Utensils,
  AlertTriangle,
  ArrowUpLeft,
  Loader2,
  RefreshCw,
  Upload,
  ClipboardList,
  Building2,
  Package,
  Truck,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/use-translations"

const VAT_RATE = 1.17

/** התראות בדשבורד — message או messageKey+count, זמן דרך מפתח תרגום (למשל common.now) */
type DashboardAlert = {
  type: string
  message?: string
  messageKey?: string
  count?: number
  timeKey: string
  id?: string
}

const isOwnerRole = (role: string, isSystemOwner?: boolean) => isSystemOwner || role === "owner"

function alertDisplayMessage(alert: DashboardAlert, t: (k: string) => string): string {
  if (alert.message) return alert.message
  if (alert.messageKey && alert.count !== undefined) return `${alert.count} ${t(alert.messageKey)}`
  if (alert.messageKey) return t(alert.messageKey)
  return ""
}

export type DashboardProps = {
  /** מוצג בתוך Dialog מעץ מוצר — סוגרים לפני ניווט כדי שלא יישאר חלון פתוח */
  embedded?: boolean
  onCloseEmbedded?: () => void
}

export function Dashboard({ embedded = false, onCloseEmbedded }: DashboardProps = {}) {
  const t = useTranslations()
  const { currentRestaurantId, userRole, isSystemOwner, setCurrentPage, restaurants, isImpersonating } = useApp()
  const isOwner = isOwnerRole(userRole, isSystemOwner)
  const isOwnerDashboard = isSystemOwner && !isImpersonating

  const rootMainClass = embedded
    ? "w-full max-w-none mx-auto px-1 sm:px-2 py-2"
    : isOwnerDashboard
      ? "container mx-auto px-4 py-2 sm:py-3"
      : "container mx-auto px-4 py-6"
  const rootLoadingClass = embedded
    ? "w-full max-w-none mx-auto px-2 sm:px-4 py-8 flex items-center justify-center min-h-[20vh]"
    : isOwnerDashboard
      ? "container mx-auto px-4 py-4 flex items-center justify-center min-h-[30vh]"
      : "container mx-auto px-4 py-6 flex items-center justify-center min-h-[60vh]"

  /** מצב חלון (עץ מוצר): פריסה צפופה — הכול נשאר באותו חלון עם גלילה אחת */
  const em = (compact: string, normal: string) => (embedded ? compact : normal)

  const navigateToPage = (page: string) => {
    onCloseEmbedded?.()
    setCurrentPage?.(page)
  }
  const [loading, setLoading] = useState(true)
  const [recipesCount, setRecipesCount] = useState(0)
  const [ingredientsCount, setIngredientsCount] = useState(0)
  const [ingredientsLowStock, setIngredientsLowStock] = useState(0)
  const [ingredientsOutOfStock, setIngredientsOutOfStock] = useState(0)
  const [inventoryValue, setInventoryValue] = useState(0)
  const [suppliersCount, setSuppliersCount] = useState(0)
  const [topDishes, setTopDishes] = useState<{ name: string; sales: number; revenue: number; margin: number }[]>([])
  const [alerts, setAlerts] = useState<DashboardAlert[]>([])
  const [avgFoodCost, setAvgFoodCost] = useState(0)
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalCost, setTotalCost] = useState(0)
  const [totalDishesSold, setTotalDishesSold] = useState(0)
  const [dishesOverTarget, setDishesOverTarget] = useState(0)
  const [purchaseOrdersCount, setPurchaseOrdersCount] = useState(0)
  const [profitabilityDishes, setProfitabilityDishes] = useState<{ name: string; sales: number; revenue: number; margin: number; foodCost: number }[]>([])
  const [recentDelivered, setRecentDelivered] = useState<{ supplier: string }[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const markNotificationRead = useCallback(async (id: string) => {
    try {
      await setDoc(doc(db, "ownerNotifications", id), { read: true }, { merge: true })
      setAlerts((prev) => prev.filter((a) => a.id !== id))
    } catch (_) {}
  }, [])

  useEffect(() => {
    if (isOwnerDashboard) {
      if (!restaurants?.length) {
        setLoading(false)
        return
      }
      setLoading(true)
      const loadOwner = async () => {
        try {
          let totalDishes = 0
          let totalRev = 0
          let totalCostSum = 0
          let totalDishesSold = 0
          let overTargetAll = 0
          const globalIngSnap = await getDocs(collection(db, "ingredients"))
          const subPricesByIngredient = await loadGlobalPriceSubdocsMap(db)

          for (const rest of restaurants) {
            const [recSnap, restIngSnap, salesDoc, asDoc] = await Promise.all([
              getDocs(collection(db, "restaurants", rest.id, "recipes")),
              getDocs(collection(db, "restaurants", rest.id, "ingredients")),
              getDoc(doc(db, "restaurants", rest.id, "appState", `salesReport_${rest.id}`)),
              getDoc(doc(db, "restaurants", rest.id, "appState", "assignedSuppliers")),
            ])
            const assignedList: string[] = Array.isArray(asDoc.data()?.list) ? asDoc.data()!.list : []
            const recipes = recSnap.docs.filter((d) => !d.data().isCompound)
            const prices: Record<string, number> = {}
            globalIngSnap.forEach((d) => {
              const picked = pickGlobalIngredientRowFromAssigned(assignedList, d.data(), subPricesByIngredient.get(d.id))
              if (picked) prices[d.id] = picked.price
            })
            restIngSnap.forEach((d) => {
              const data = d.data()
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
            const salesData = salesDoc.data()?.dailySales as Record<string, { avg: number }> | undefined
            const dailySales = salesData || {}

            let restCostSum = 0
            let restRevSum = 0
            let restOver = 0
            recipes.forEach((r) => {
              const data = r.data()
              const sellingPrice = (typeof data.sellingPrice === "number" ? data.sellingPrice : 0) / VAT_RATE
              const sales = dailySales[r.id]?.avg ?? 0
              const revenue = sellingPrice * sales
              restRevSum += revenue
              const ing = Array.isArray(data.ingredients) ? data.ingredients : []
              let cost = 0
              ing.forEach((i: { name?: string; qty?: number; waste?: number; unit?: string; isSubRecipe?: boolean }) => {
                cost += calcIngCost(i.name || "", i.qty || 0, i.waste || 0, i.unit || "גרם", i.isSubRecipe)
              })
              const foodCostPct = sellingPrice > 0 ? (cost / sellingPrice) * 100 : 0
              if (foodCostPct > 30) restOver++
              restCostSum += cost * sales
            })

            totalDishes += recipes.length
            totalRev += restRevSum
            totalCostSum += restCostSum
            totalDishesSold += recipes.reduce((s, r) => s + (dailySales[r.id]?.avg ?? 0), 0)
            overTargetAll += restOver
          }

          const poSnap = await getDocs(collection(db, "purchaseOrders"))
          const posCount = poSnap.docs.length

          setRecipesCount(totalDishes)
          setTotalRevenue(totalRev)
          setTotalCost(totalCostSum)
          setTotalDishesSold(Math.round(totalDishesSold))
          setAvgFoodCost(totalRev > 0 ? (totalCostSum / totalRev) * 100 : 0)
          setDishesOverTarget(overTargetAll)
          setPurchaseOrdersCount(posCount)
          setTopDishes([])
          setProfitabilityDishes([])
          setIngredientsCount(0)
          setIngredientsLowStock(0)
          setIngredientsOutOfStock(0)
          setInventoryValue(0)
          setSuppliersCount(0)
          const alertList: DashboardAlert[] = []
          if (overTargetAll > 0)
            alertList.push({ type: "info", messageKey: "pages.dashboard.dishesOverTargetMsg", count: overTargetAll, timeKey: "common.now" })
          try {
            const notifSnap = await getDocs(
              query(
                collection(db, "ownerNotifications"),
                where("type", "==", "supplier_removed"),
                orderBy("createdAt", "desc"),
                limit(15)
              )
            )
            notifSnap.docs
              .filter((d) => !d.data().read)
              .forEach((d) => {
                const data = d.data()
                const msg = `מסעדה "${data.restaurantName || data.restaurantId}" הסירה את הספק "${data.supplierName || ""}" ששויך על ידך`
                alertList.unshift({ type: "warning", message: msg, timeKey: "common.now", id: d.id })
              })
          } catch (_) {}
          setAlerts(alertList)
        } catch (e) {
          console.error("load owner dashboard:", e)
          toast.error("שגיאה בטעינת נתוני לוח בקרה")
        } finally {
          setLoading(false)
        }
      }
      loadOwner()
      return
    }

    if (!currentRestaurantId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const load = async () => {
      try {
        const [recSnap, restIngSnap, asDoc, salesDoc, poSnap] = await Promise.all([
          getDocs(collection(db, "restaurants", currentRestaurantId, "recipes")),
          getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients")),
          getDoc(doc(db, "restaurants", currentRestaurantId, "appState", "assignedSuppliers")),
          getDoc(doc(db, "restaurants", currentRestaurantId, "appState", `salesReport_${currentRestaurantId}`)),
          getDocs(query(collection(db, "purchaseOrders"), where("restaurantId", "==", currentRestaurantId))),
        ])
        const assignedList: string[] = Array.isArray(asDoc.data()?.list) ? asDoc.data()!.list : []
        const globalIngSnap = isOwner ? await getDocs(collection(db, "ingredients")) : null
        const subPricesByIngredient =
          isOwner && assignedList.length > 0 ? await loadGlobalPriceSubdocsMap(db) : new Map()

        type PoRow = { id: string; status?: string; supplier?: string }
        const pos: PoRow[] = poSnap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>
          return {
            id: d.id,
            status: typeof data.status === "string" ? data.status : undefined,
            supplier: typeof data.supplier === "string" ? data.supplier : undefined,
          }
        })
        setPurchaseOrdersCount(pos.length)
        const delivered = pos.filter((p) => p.status === "delivered").slice(0, 5)
        setRecentDelivered(delivered.map((p) => ({ supplier: p.supplier || "—" })))

        const recipes = recSnap.docs.filter((d) => !d.data().isCompound)
        setRecipesCount(recipes.length)

        const prices: Record<string, number> = {}
        const suppliers = new Set<string>()
        const ingIds = new Set<string>()
        let lowStock = 0
        let outOfStock = 0
        let value = 0

        const mergeIng = (d: { id: string; data: () => { price?: number; supplier?: string; stock?: number; minStock?: number } }) => {
          const data = d.data()
          const price = typeof data.price === "number" ? data.price : 0
          const stock = typeof data.stock === "number" ? data.stock : 0
          const minStock = typeof data.minStock === "number" ? data.minStock : 0
          prices[d.id] = price
          ingIds.add(d.id)
          if (data.supplier) suppliers.add(data.supplier)
          if (stock === 0) outOfStock++
          else if (minStock > 0 && stock < minStock) lowStock++
          value += price * stock
        }

        restIngSnap.forEach(mergeIng)
        globalIngSnap?.forEach((d) => {
          if (ingIds.has(d.id)) return
          const data = d.data()
          const picked = pickGlobalIngredientRowFromAssigned(assignedList, data, subPricesByIngredient.get(d.id))
          if (!picked) return
          mergeIng({
            id: d.id,
            data: () => ({
              ...data,
              price: picked.price,
              supplier: picked.supplier,
            }),
          })
        })

        setIngredientsCount(ingIds.size)
        setIngredientsLowStock(lowStock)
        setIngredientsOutOfStock(outOfStock)
        setInventoryValue(value)
        setSuppliersCount(suppliers.size)

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

        const salesData = salesDoc.data()?.dailySales as Record<string, { avg: number; trend: number }> | undefined
        const dailySales = salesData || {}

        const top: { name: string; sales: number; revenue: number; margin: number }[] = []
        let totalRev = 0
        let costSum = 0
        let revSum = 0

        let overTarget = 0
        recipes.forEach((r) => {
          const data = r.data()
          const sellingPrice = (typeof data.sellingPrice === "number" ? data.sellingPrice : 0) / VAT_RATE
          const sales = dailySales[r.id]?.avg ?? 0
          const revenue = sellingPrice * sales
          totalRev += revenue
          const ing = Array.isArray(data.ingredients) ? data.ingredients : []
          let cost = 0
          ing.forEach((i: { name?: string; qty?: number; waste?: number; unit?: string; isSubRecipe?: boolean }) => {
            cost += calcIngCost(i.name || "", i.qty || 0, i.waste || 0, i.unit || "גרם", i.isSubRecipe)
          })
          const margin = sellingPrice > 0 ? ((sellingPrice - cost) / sellingPrice) * 100 : 0
          const foodCostPct = sellingPrice > 0 ? (cost / sellingPrice) * 100 : 0
          if (foodCostPct > 30) overTarget++
          costSum += cost * sales
          revSum += revenue
          top.push({ name: r.id, sales: Math.round(sales), revenue, margin })
        })

        top.sort((a, b) => b.revenue - a.revenue)
        setTopDishes(top.slice(0, 5))
        setTotalRevenue(totalRev)
        setTotalCost(costSum)
        setTotalDishesSold(Math.round(top.reduce((s, t) => s + t.sales, 0)))
        setAvgFoodCost(revSum > 0 ? (costSum / revSum) * 100 : 0)
        setDishesOverTarget(overTarget)

        const withFoodCost = top.map((t) => {
          const rev = t.revenue
          const cost = revSum > 0 ? (costSum / revSum) * rev : 0
          const foodCostPct = rev > 0 ? (cost / rev) * 100 : 0
          return { ...t, foodCost: foodCostPct }
        })
        setProfitabilityDishes(withFoodCost.sort((a, b) => b.margin - a.margin).slice(0, 5))

        const alertList: DashboardAlert[] = []
        if (outOfStock > 0)
          alertList.push({ type: "warning", messageKey: "pages.dashboard.outOfStockMsg", count: outOfStock, timeKey: "common.now" })
        if (lowStock > 0)
          alertList.push({ type: "warning", messageKey: "pages.dashboard.lowStockMsg", count: lowStock, timeKey: "common.now" })
        if (overTarget > 0)
          alertList.push({ type: "info", messageKey: "pages.dashboard.dishesOverTargetMsg", count: overTarget, timeKey: "common.now" })
        if (delivered.length > 0)
          alertList.push({ type: "success", messageKey: "pages.dashboard.deliveredMsg", count: delivered.length, timeKey: "common.now" })
        setAlerts(alertList)
      } catch (e) {
        console.error("load dashboard:", e)
        toast.error("שגיאה בטעינת לוח בקרה")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentRestaurantId, isOwner, refreshKey, isOwnerDashboard, restaurants])

  if (loading) {
    return (
      <div className={rootLoadingClass}>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isOwnerDashboard && !currentRestaurantId) {
    return (
      <div className={rootMainClass}>
        <h1 className="text-2xl font-bold mb-1">{t("pages.dashboard.title")}</h1>
        <p className="text-muted-foreground">{t("pages.dashboard.selectRestaurant")}</p>
      </div>
    )
  }

  const grossProfit = totalRevenue - totalCost
  const avgTicket = totalDishesSold > 0 ? totalRevenue / totalDishesSold : 0

  const ownerGrossProfit = totalRevenue - totalCost
  const ownerAvgTicket = totalDishesSold > 0 ? totalRevenue / totalDishesSold : 0

  if (isOwnerDashboard) {
    const ownerKpis = [
      { label: t("pages.dashboard.monthlyRevenue"), value: `₪${totalRevenue.toLocaleString()}`, icon: TrendingUp, color: "bg-green-50 text-green-700" },
      { label: t("pages.dashboard.dishesSold"), value: String(totalDishesSold), icon: Utensils, color: "bg-amber-50 text-amber-700" },
      { label: t("pages.dashboard.avgPerOrder"), value: `₪${ownerAvgTicket.toFixed(0)}`, icon: DollarSign, color: "bg-blue-50 text-blue-700" },
      { label: t("pages.dashboard.grossProfit"), value: `₪${ownerGrossProfit.toLocaleString()}`, icon: ArrowUpLeft, color: "bg-emerald-50 text-emerald-700" },
      { label: t("pages.dashboard.foodCostPct"), value: `${avgFoodCost.toFixed(1)}%`, icon: DollarSign, color: "bg-blue-50 text-blue-700" },
      { label: "COGS", value: `₪${totalCost.toLocaleString()}`, icon: ShoppingCart, color: "bg-purple-50 text-purple-700" },
      { label: t("pages.dashboard.dishesOverTarget"), value: String(dishesOverTarget), icon: AlertTriangle, color: "bg-orange-50 text-orange-700" },
      { label: t("pages.dashboard.purchaseOrders"), value: String(purchaseOrdersCount), icon: ClipboardList, color: "bg-slate-50 text-slate-700" },
    ]

    const ownerHasDishTables = topDishes.length > 0 || profitabilityDishes.length > 0

    const ownerStatItem = (icon: ReactNode, value: string | number, label: string, key: string) => (
      <div
        key={key}
        className={em(
          "flex items-center gap-2.5 rounded-lg border border-border/50 bg-muted/40 px-2.5 py-2",
          "flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5"
        )}
      >
        <div className={cn(em("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", "h-10 w-10 rounded-xl"), "bg-background shadow-sm")}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className={em("text-sm font-bold leading-tight tabular-nums", "text-lg font-bold tabular-nums")}>{value}</p>
          <p className={em("text-[10px] text-muted-foreground leading-tight", "text-xs text-muted-foreground")}>{label}</p>
        </div>
      </div>
    )

    return (
      <div className={rootMainClass}>
        <div className={em("mb-2 flex flex-wrap items-center justify-between gap-2", "mb-6 flex flex-wrap items-center justify-between gap-4")}>
          <div>
            <h1 className={em("text-lg font-bold mb-0", "text-2xl md:text-3xl font-bold mb-1")}>{t("pages.dashboard.ownerTitle")}</h1>
            <p className={em("text-xs text-muted-foreground", "text-muted-foreground")}>
              {restaurants?.length || 0} {t("pages.dashboard.activeRestaurants")}
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Button variant="outline" size={embedded ? "sm" : "sm"} className={em("h-8 px-2 text-xs", "")} onClick={refresh} disabled={loading}>
              <RefreshCw className={cn("w-3.5 h-3.5 ml-1", loading && "animate-spin")} />
              <span className={em("hidden sm:inline", "")}>{t("pages.refresh")}</span>
            </Button>
            {setCurrentPage && (
              <Button variant="outline" size="sm" className={em("h-8 px-2 text-xs", "")} onClick={() => navigateToPage("admin-panel")}>
                {t("pages.dashboard.adminPanel")}
              </Button>
            )}
          </div>
        </div>

        <p
          className={em(
            "mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
            "mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          {t("pages.dashboard.ownerFinancialSection")}
        </p>
        <div className={em("mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4", "mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4")}>
          {ownerKpis.map((kpi, i) => (
            <Card key={i} className="border border-border/40 shadow-sm overflow-hidden transition-shadow hover:shadow-md">
              <CardContent className={em("p-2.5", "p-4")}>
                <div className={cn(em("mb-1 flex h-8 w-8 items-center justify-center rounded-lg", "mb-2 h-10 w-10 rounded-xl"), kpi.color)}>
                  <kpi.icon className={em("w-4 h-4", "w-5 h-5")} />
                </div>
                <p className={em("text-sm font-bold leading-tight tabular-nums", "text-xl font-bold tabular-nums md:text-2xl")}>{kpi.value}</p>
                <p className={em("mt-0.5 text-[9px] leading-snug text-muted-foreground line-clamp-2", "text-xs text-muted-foreground")}>{kpi.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <p
          className={em(
            "mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
            "mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          {t("pages.dashboard.topDishes")} / {t("pages.dashboard.dishProfitability")}
        </p>
        {ownerHasDishTables ? (
          <div className={em("mb-3 grid grid-cols-1 gap-2 xl:grid-cols-2", "mb-8 grid gap-6 lg:grid-cols-2")}>
            <Card className="border border-border/40 shadow-sm min-w-0">
              <CardHeader className={em("pb-1.5 px-3 pt-2", "pb-3")}>
                <CardTitle className={em("text-sm font-semibold flex items-center gap-1.5", "text-lg font-semibold flex items-center gap-2")}>
                  <Utensils className={cn(em("w-4 h-4", "w-5 h-5"), "text-muted-foreground shrink-0")} />
                  {t("pages.dashboard.topDishes")}
                </CardTitle>
              </CardHeader>
              <CardContent className={em("px-2 pb-2", "")}>
                <div className={em("max-h-[min(32vh,280px)] min-h-0 overflow-y-auto overflow-x-auto overscroll-y-contain touch-pan-y", "overflow-x-auto")}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] text-muted-foreground border-b">
                        <th className={em("text-right pb-1.5 font-medium", "text-right pb-3 font-medium")}>{t("pages.dish")}</th>
                        <th className={em("text-center pb-1.5 font-medium", "text-center pb-3 font-medium")}>{t("pages.dashboard.sales")}</th>
                        <th className={em("text-center pb-1.5 font-medium", "text-center pb-3 font-medium")}>{t("pages.dashboard.revenue")}</th>
                        <th className={em("text-center pb-1.5 font-medium", "text-center pb-3 font-medium")}>{t("pages.dashboard.margin")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topDishes.map((dish, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          <td className={em("py-1 font-medium text-xs truncate max-w-[100px]", "py-3 font-medium")}>{dish.name}</td>
                          <td className={em("text-center py-1 text-xs text-muted-foreground", "text-center py-3 text-muted-foreground")}>{dish.sales}</td>
                          <td className={em("text-center py-1 text-xs", "text-center py-3")}>₪{dish.revenue.toLocaleString()}</td>
                          <td className={em("text-center py-1", "text-center py-3")}>
                            <Badge variant="secondary" className="bg-green-50 text-green-700 text-[10px] px-1">
                              {dish.margin.toFixed(0)}%
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            <Card className="border border-border/40 shadow-sm min-w-0">
              <CardHeader className={em("pb-1.5 px-3 pt-2", "pb-3")}>
                <CardTitle className={em("text-sm font-semibold flex items-center gap-1.5", "text-lg font-semibold flex items-center gap-2")}>
                  <TrendingUp className={cn(em("w-4 h-4", "w-5 h-5"), "text-muted-foreground shrink-0")} />
                  {t("pages.dashboard.dishProfitability")}
                </CardTitle>
              </CardHeader>
              <CardContent className={em("px-2 pb-2", "")}>
                <div className={em("max-h-[min(32vh,280px)] min-h-0 overflow-y-auto overflow-x-auto overscroll-y-contain touch-pan-y", "overflow-x-auto")}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] text-muted-foreground border-b">
                        <th className={em("text-right pb-1.5 font-medium", "text-right pb-3 font-medium")}>{t("pages.dish")}</th>
                        <th className={em("text-center pb-1.5 font-medium", "text-center pb-3 font-medium")}>{t("pages.dashboard.margin")}</th>
                        <th className={em("text-center pb-1.5 font-medium", "text-center pb-3 font-medium")}>{t("pages.dashboard.foodCost")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitabilityDishes.map((dish, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          <td className={em("py-1 font-medium text-xs truncate max-w-[90px]", "py-3 font-medium")}>{dish.name}</td>
                          <td className={em("text-center py-1", "text-center py-3")}>
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-[10px] px-1",
                                dish.margin >= 60 ? "bg-green-50 text-green-700" : dish.margin >= 40 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                              )}
                            >
                              {dish.margin.toFixed(0)}%
                            </Badge>
                          </td>
                          <td className={em("text-center py-1 text-xs text-muted-foreground", "text-center py-3 text-muted-foreground")}>
                            {dish.foodCost.toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className={em("mb-3 border border-dashed border-border/70 bg-muted/20", "mb-8 border-dashed")}>
            <CardContent className={em("py-4 px-3", "py-6 px-5")}>
              <p className={em("text-center text-xs leading-relaxed text-muted-foreground", "text-sm")}>{t("pages.dashboard.ownerPerRestaurantSalesHint")}</p>
            </CardContent>
          </Card>
        )}

        <p
          className={em(
            "mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
            "mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          {t("pages.dashboard.alerts")}
        </p>
        <Card className={em("mb-3 border border-border/40 shadow-sm", "mb-8")}>
          <CardContent className={em("max-h-[min(28vh,240px)] min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y px-2 py-2", "px-4 py-4")}>
            {alerts.length === 0 ? (
              <p className="text-muted-foreground text-xs py-2 text-center">{t("pages.dashboard.noAlerts")}</p>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert, i) => {
                  const displayMessage = alertDisplayMessage(alert, t)
                  return (
                    <div
                      key={alert.id ?? i}
                      className={cn(
                        em("flex items-start justify-between gap-2 rounded-lg border border-transparent p-2 text-xs", "p-3 text-sm"),
                        alert.type === "warning" && "border-amber-200/80 bg-amber-50/90 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100",
                        alert.type === "info" && "border-blue-200/80 bg-blue-50/90 text-blue-950 dark:bg-blue-950/20 dark:text-blue-100",
                        alert.type === "success" && "border-emerald-200/80 bg-emerald-50/90 text-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-100"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-snug">{displayMessage}</p>
                        <p className="mt-0.5 text-[10px] opacity-70">{t(alert.timeKey)}</p>
                      </div>
                      {alert.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 h-7 px-1.5 text-[10px]"
                          onClick={() => markNotificationRead(alert.id!)}
                        >
                          {t("pages.close")}
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <p
          className={em(
            "mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
            "mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          {t("pages.dashboard.ownerOperationsSection")}
        </p>
        <Card className="border border-border/40 shadow-sm">
          <CardContent
            className={em(
              "grid grid-cols-2 gap-2 p-2.5 sm:grid-cols-3 lg:grid-cols-5",
              "grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5"
            )}
          >
            {ownerStatItem(
              <Building2 className={cn(em("h-4 w-4", "h-5 w-5"), "text-muted-foreground")} />,
              restaurants?.length ?? 0,
              t("pages.dashboard.restaurants"),
              "rests"
            )}
            {ownerStatItem(
              <Utensils className={cn(em("h-4 w-4", "h-5 w-5"), "text-muted-foreground")} />,
              recipesCount,
              t("pages.dashboard.menuItems"),
              "recipes"
            )}
            {ownerStatItem(
              <Truck className={cn(em("h-4 w-4", "h-5 w-5"), "text-muted-foreground")} />,
              suppliersCount,
              t("nav.suppliers"),
              "suppliers"
            )}
            {ownerStatItem(
              <Package className={cn(em("h-4 w-4", "h-5 w-5"), "text-muted-foreground")} />,
              ingredientsCount,
              t("nav.ingredients"),
              "ingredients"
            )}
            {ownerStatItem(
              <TrendingUp className={cn(em("h-4 w-4", "h-5 w-5"), "text-muted-foreground")} />,
              `₪${inventoryValue.toLocaleString()}`,
              t("pages.dashboard.inventoryValue"),
              "inventory"
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const kpis = [
    { label: t("pages.dashboard.monthlyRevenue"), value: `₪${totalRevenue.toLocaleString()}`, target: "", change: 0, trend: "up" as const, icon: TrendingUp, color: "bg-green-50 text-green-700" },
    { label: t("pages.dashboard.dishesSold"), value: String(totalDishesSold), target: "", change: 0, trend: "up" as const, icon: Utensils, color: "bg-amber-50 text-amber-700" },
    { label: t("pages.dashboard.avgPerOrder"), value: `₪${avgTicket.toFixed(0)}`, target: "", change: 0, trend: "up" as const, icon: DollarSign, color: "bg-blue-50 text-blue-700" },
    { label: t("pages.dashboard.grossProfit"), value: `₪${grossProfit.toLocaleString()}`, target: "", change: 0, trend: "up" as const, icon: ArrowUpLeft, color: "bg-emerald-50 text-emerald-700" },
    { label: t("pages.dashboard.foodCostPct"), value: `${avgFoodCost.toFixed(1)}%`, target: "30%", change: 0, trend: avgFoodCost > 30 ? ("down" as const) : ("up" as const), icon: DollarSign, color: "bg-blue-50 text-blue-700" },
    { label: "COGS", value: `₪${totalCost.toLocaleString()}`, target: "", change: 0, trend: "up" as const, icon: ShoppingCart, color: "bg-purple-50 text-purple-700" },
    { label: t("pages.dashboard.dishesOverTarget"), value: String(dishesOverTarget), target: "30%", change: 0, trend: "down" as const, icon: AlertTriangle, color: "bg-orange-50 text-orange-700" },
    { label: t("pages.dashboard.purchaseOrders"), value: String(purchaseOrdersCount), target: "", change: 0, trend: "up" as const, icon: ClipboardList, color: "bg-slate-50 text-slate-700" },
  ]

  const salesEmptyHint = embedded ? t("pages.dashboard.noSalesData") : t("pages.dashboard.noSalesUploadHint")

  const restStatItem = (icon: ReactNode, value: string | number, label: string, statKey: string) => (
    <div
      key={statKey}
      className={em(
        "flex items-center gap-2.5 rounded-lg border border-border/50 bg-muted/40 px-2.5 py-2",
        "flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5"
      )}
    >
      <div className={cn(em("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", "h-10 w-10 rounded-xl"), "bg-background shadow-sm")}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={em("text-sm font-bold leading-tight tabular-nums", "text-lg font-bold tabular-nums")}>{value}</p>
        <p className={em("text-[10px] text-muted-foreground leading-tight", "text-xs text-muted-foreground")}>{label}</p>
      </div>
    </div>
  )

  return (
    <div className={rootMainClass}>
      <div className={em("mb-2 flex flex-wrap items-center justify-between gap-2", "mb-6 flex flex-wrap items-center justify-between gap-4")}>
        <div>
          <h1 className={em("text-lg font-bold mb-0", "text-2xl md:text-3xl font-bold mb-1")}>{t("pages.dashboard.title")}</h1>
          <p className={em("text-xs text-muted-foreground", "text-muted-foreground")}>{t("pages.dashboard.overview")}</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <Button variant="outline" size="sm" className={em("h-8 px-2 text-xs", "")} onClick={refresh} disabled={loading}>
            <RefreshCw className={cn(em("w-3.5 h-3.5", "w-4 h-4"), "ml-1", loading && "animate-spin")} />
            <span className={em("hidden sm:inline", "")}>{t("pages.refresh")}</span>
          </Button>
          {setCurrentPage && !embedded && (
            <Button variant="outline" size="sm" className={em("h-8 px-2 text-xs", "")} onClick={() => navigateToPage("calc")}>
              <Upload className={em("w-3.5 h-3.5 ml-1", "w-4 h-4 ml-1.5")} />
              <span className={em("hidden sm:inline", "")}>{t("pages.dashboard.uploadReport")}</span>
            </Button>
          )}
        </div>
      </div>

      <p
        className={em(
          "mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
          "mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        )}
      >
        {t("pages.dashboard.restaurantFinancialSection")}
      </p>
      <div className={em("mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4", "mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4")}>
        {kpis.map((kpi, i) => (
          <Card key={i} className="border border-border/40 shadow-sm overflow-hidden transition-shadow hover:shadow-md">
            <CardContent className={em("p-2.5", "p-4")}>
              <div className={cn(em("mb-1 flex h-8 w-8 items-center justify-center rounded-lg", "mb-2 h-10 w-10 rounded-xl"), kpi.color)}>
                <kpi.icon className={em("w-4 h-4", "w-5 h-5")} />
              </div>
              <p className={em("text-sm font-bold leading-tight tabular-nums", "text-xl font-bold tabular-nums md:text-2xl")}>{kpi.value}</p>
              <p className={em("mt-0.5 text-[9px] leading-snug text-muted-foreground line-clamp-2", "text-xs text-muted-foreground")}>
                {kpi.label}
                {kpi.target && <span className="text-[9px]"> ({kpi.target})</span>}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p
        className={em(
          "mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
          "mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        )}
      >
        {t("pages.dashboard.restaurantSalesSection")}
      </p>
      <div className={em("mb-2 grid grid-cols-1 gap-2 xl:grid-cols-12", "mb-2 grid gap-6 lg:grid-cols-12")}>
        <Card className={em("xl:col-span-5 border border-border/40 shadow-sm min-w-0", "lg:col-span-5 border border-border/40 shadow-sm min-w-0")}>
          <CardHeader className={em("pb-1.5 px-3 pt-2", "pb-3")}>
            <CardTitle className={em("text-sm font-semibold flex items-center gap-1.5", "text-lg font-semibold flex items-center gap-2")}>
              <Utensils className={cn(em("w-4 h-4", "w-5 h-5"), "text-muted-foreground shrink-0")} />
              {t("pages.dashboard.topDishes")}
            </CardTitle>
          </CardHeader>
          <CardContent className={em("px-2 pb-2", "")}>
            {topDishes.length === 0 ? (
              <p className="text-muted-foreground text-xs leading-relaxed">{salesEmptyHint}</p>
            ) : (
              <div className={em("max-h-[min(32vh,280px)] min-h-0 overflow-y-auto overflow-x-auto overscroll-y-contain touch-pan-y", "overflow-x-auto")}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] text-muted-foreground border-b">
                      <th className={em("text-right pb-1.5 font-medium", "text-right pb-3 font-medium")}>{t("pages.dish")}</th>
                      <th className={em("text-center pb-1.5 font-medium", "text-center pb-3 font-medium")}>{t("pages.dashboard.sales")}</th>
                      <th className={em("text-center pb-1.5 font-medium", "text-center pb-3 font-medium")}>{t("pages.dashboard.revenue")}</th>
                      <th className={em("text-center pb-1.5 font-medium", "text-center pb-3 font-medium")}>{t("pages.dashboard.margin")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDishes.map((dish, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className={em("py-1 font-medium text-xs truncate max-w-[90px]", "py-3 font-medium")}>{dish.name}</td>
                        <td className={em("text-center py-1 text-xs text-muted-foreground", "text-center py-3 text-muted-foreground")}>{dish.sales}</td>
                        <td className={em("text-center py-1 text-xs", "text-center py-3")}>₪{dish.revenue.toLocaleString()}</td>
                        <td className={em("text-center py-1", "text-center py-3")}>
                          <Badge variant="secondary" className="bg-green-50 text-green-700 text-[10px] px-1">
                            {dish.margin.toFixed(0)}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={em("xl:col-span-4 border border-border/40 shadow-sm min-w-0", "lg:col-span-4 border border-border/40 shadow-sm min-w-0")}>
          <CardHeader className={em("pb-1.5 px-3 pt-2", "pb-3")}>
            <CardTitle className={em("text-sm font-semibold flex items-center gap-1.5", "text-lg font-semibold flex items-center gap-2")}>
              <TrendingUp className={cn(em("w-4 h-4", "w-5 h-5"), "text-muted-foreground shrink-0")} />
              {t("pages.dashboard.dishProfitability")}
            </CardTitle>
          </CardHeader>
          <CardContent className={em("px-2 pb-2", "")}>
            {profitabilityDishes.length === 0 ? (
              <p className="text-muted-foreground text-xs leading-relaxed">{salesEmptyHint}</p>
            ) : (
              <div className={em("max-h-[min(32vh,280px)] min-h-0 overflow-y-auto overflow-x-auto overscroll-y-contain touch-pan-y", "overflow-x-auto")}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] text-muted-foreground border-b">
                      <th className={em("text-right pb-1.5 font-medium", "text-right pb-3 font-medium")}>{t("pages.dish")}</th>
                      <th className={em("text-center pb-1.5 font-medium", "text-center pb-3 font-medium")}>{t("pages.dashboard.margin")}</th>
                      <th className={em("text-center pb-1.5 font-medium", "text-center pb-3 font-medium")}>{t("pages.dashboard.foodCost")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitabilityDishes.map((dish, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className={em("py-1 font-medium text-xs truncate max-w-[80px]", "py-3 font-medium")}>{dish.name}</td>
                        <td className={em("text-center py-1", "text-center py-3")}>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px] px-1",
                              dish.margin >= 60 ? "bg-green-50 text-green-700" : dish.margin >= 40 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                            )}
                          >
                            {dish.margin.toFixed(0)}%
                          </Badge>
                        </td>
                        <td className={em("text-center py-1 text-xs text-muted-foreground", "text-center py-3 text-muted-foreground")}>{dish.foodCost.toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={em("xl:col-span-3 border border-border/40 shadow-sm min-w-0", "lg:col-span-3 border border-border/40 shadow-sm min-w-0")}>
          <CardHeader className={em("pb-1.5 px-3 pt-2", "pb-3")}>
            <CardTitle className={em("text-sm font-semibold flex items-center gap-1.5", "text-lg font-semibold flex items-center gap-2")}>
              <AlertTriangle className={cn(em("w-4 h-4", "w-5 h-5"), "text-muted-foreground shrink-0")} />
              {t("pages.dashboard.alerts")}
            </CardTitle>
          </CardHeader>
          <CardContent className={em("max-h-[min(28vh,240px)] min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y px-2 pb-2", "px-3 pb-3")}>
            {alerts.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">{t("pages.dashboard.noAlerts")}</p>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert, i) => (
                  <div
                    key={i}
                    className={cn(
                      em("rounded-lg border border-transparent p-2 text-xs", "rounded-xl p-3 text-sm"),
                      alert.type === "warning" && "border-amber-200/80 bg-amber-50/90 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100",
                      alert.type === "info" && "border-blue-200/80 bg-blue-50/90 text-blue-950 dark:bg-blue-950/20 dark:text-blue-100",
                      alert.type === "success" && "border-emerald-200/80 bg-emerald-50/90 text-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-100"
                    )}
                  >
                    <p className="font-medium leading-snug">{alertDisplayMessage(alert, t)}</p>
                    <p className="mt-0.5 text-[10px] opacity-70">{t(alert.timeKey)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <p
        className={em(
          "mb-1.5 mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
          "mb-2 mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        )}
      >
        {t("pages.dashboard.restaurantOperationsSection")}
      </p>
      <Card className="border border-border/40 shadow-sm">
        <CardContent
          className={em(
            "grid grid-cols-2 gap-2 p-2.5 sm:grid-cols-4",
            "grid grid-cols-2 gap-3 p-4 sm:grid-cols-4"
          )}
        >
          {restStatItem(
            <Truck className={cn(em("h-4 w-4", "h-5 w-5"), "text-muted-foreground")} />,
            suppliersCount,
            t("nav.suppliers"),
            "suppliers"
          )}
          {restStatItem(
            <Utensils className={cn(em("h-4 w-4", "h-5 w-5"), "text-muted-foreground")} />,
            recipesCount,
            t("pages.dashboard.menuItems"),
            "recipes"
          )}
          {restStatItem(
            <Package className={cn(em("h-4 w-4", "h-5 w-5"), "text-muted-foreground")} />,
            ingredientsCount,
            t("nav.ingredients"),
            "ingredients"
          )}
          {restStatItem(
            <TrendingUp className={cn(em("h-4 w-4", "h-5 w-5"), "text-muted-foreground")} />,
            `₪${inventoryValue.toLocaleString()}`,
            t("pages.dashboard.inventoryValue"),
            "inventory"
          )}
        </CardContent>
      </Card>
    </div>
  )
}
