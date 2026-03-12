"use client"

import { useState, useEffect, useCallback } from "react"
import { collection, getDocs, getDoc, doc, query, where, orderBy, limit, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Utensils,
  Users,
  AlertTriangle,
  ArrowUpLeft,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react"
import { cn } from "@/lib/utils"

const VAT_RATE = 1.17

const isOwnerRole = (role: string, isSystemOwner?: boolean) => isSystemOwner || role === "owner"

export function Dashboard() {
  const { currentRestaurantId, userRole, isSystemOwner, setCurrentPage, restaurants, isImpersonating, onImpersonate } = useApp()
  const isOwner = isOwnerRole(userRole, isSystemOwner)
  const isOwnerDashboard = isSystemOwner && !isImpersonating
  const [loading, setLoading] = useState(true)
  const [recipesCount, setRecipesCount] = useState(0)
  const [ingredientsCount, setIngredientsCount] = useState(0)
  const [ingredientsLowStock, setIngredientsLowStock] = useState(0)
  const [ingredientsOutOfStock, setIngredientsOutOfStock] = useState(0)
  const [inventoryValue, setInventoryValue] = useState(0)
  const [suppliersCount, setSuppliersCount] = useState(0)
  const [topDishes, setTopDishes] = useState<{ name: string; sales: number; revenue: number; margin: number }[]>([])
  const [alerts, setAlerts] = useState<{ type: string; message: string; time: string }[]>([])
  const [avgFoodCost, setAvgFoodCost] = useState(0)
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalCost, setTotalCost] = useState(0)
  const [totalDishesSold, setTotalDishesSold] = useState(0)
  const [dishesOverTarget, setDishesOverTarget] = useState(0)
  const [purchaseOrdersCount, setPurchaseOrdersCount] = useState(0)
  const [profitabilityDishes, setProfitabilityDishes] = useState<{ name: string; sales: number; revenue: number; margin: number; foodCost: number }[]>([])
  const [recentDelivered, setRecentDelivered] = useState<{ supplier: string }[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [restaurantCards, setRestaurantCards] = useState<{ id: string; name: string; emoji?: string; branch?: string; dishes: number; avgFoodCost: number; overTarget: number }[]>([])

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
          const cards: { id: string; name: string; emoji?: string; branch?: string; dishes: number; avgFoodCost: number; overTarget: number }[] = []
          const globalIngSnap = await getDocs(collection(db, "ingredients"))
          const globalPrices: Record<string, number> = {}
          globalIngSnap.forEach((d) => {
            const data = d.data()
            globalPrices[d.id] = typeof data.price === "number" ? data.price : 0
          })

          for (const rest of restaurants) {
            const [recSnap, restIngSnap, salesDoc] = await Promise.all([
              getDocs(collection(db, "restaurants", rest.id, "recipes")),
              getDocs(collection(db, "restaurants", rest.id, "ingredients")),
              getDoc(doc(db, "restaurants", rest.id, "appState", `salesReport_${rest.id}`)),
            ])
            const recipes = recSnap.docs.filter((d) => !d.data().isCompound)
            const prices: Record<string, number> = { ...globalPrices }
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

            const avgCost = restRevSum > 0 ? (restCostSum / restRevSum) * 100 : 0
            totalDishes += recipes.length
            totalRev += restRevSum
            totalCostSum += restCostSum
            totalDishesSold += recipes.reduce((s, r) => s + (dailySales[r.id]?.avg ?? 0), 0)
            overTargetAll += restOver

            cards.push({
              id: rest.id,
              name: rest.name,
              emoji: rest.emoji,
              branch: rest.branch,
              dishes: recipes.length,
              avgFoodCost: avgCost,
              overTarget: restOver,
            })
          }

          const poSnap = await getDocs(collection(db, "purchaseOrders"))
          const posCount = poSnap.docs.length

          setRecipesCount(totalDishes)
          setTotalRevenue(totalRev)
          setTotalCost(totalCostSum)
          setTotalDishesSold(Math.round(totalDishesSold))
          setAvgFoodCost(totalRev > 0 ? (totalCostSum / totalRev) * 100 : 0)
          setDishesOverTarget(overTargetAll)
          setRestaurantCards(cards)
          setPurchaseOrdersCount(posCount)
          setTopDishes([])
          setProfitabilityDishes([])
          setIngredientsCount(0)
          setIngredientsLowStock(0)
          setIngredientsOutOfStock(0)
          setInventoryValue(0)
          setSuppliersCount(0)
          const alertList: { type: string; message: string; time: string; id?: string }[] = []
          if (overTargetAll > 0) alertList.push({ type: "info", message: `${overTargetAll} מנות מעל יעד עלות מזון (30%)`, time: "עכשיו" })
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
                alertList.unshift({ type: "warning", message: msg, time: "עכשיו", id: d.id })
              })
          } catch (_) {}
          setAlerts(alertList)
        } catch (e) {
          console.error("load owner dashboard:", e)
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

        const pos = poSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setPurchaseOrdersCount(pos.length)
        const delivered = pos.filter((p: { status?: string }) => p.status === "delivered").slice(0, 5)
        setRecentDelivered(delivered.map((p: { supplier?: string }) => ({ supplier: p.supplier || "—" })))

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
          const sup = (data.supplier as string) || ""
          if (sup && !assignedList.includes(sup)) return
          mergeIng(d)
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

        const alertList: { type: string; message: string; time: string }[] = []
        if (outOfStock > 0) alertList.push({ type: "warning", message: `${outOfStock} מוצרים אזלו מהמלאי`, time: "עכשיו" })
        if (lowStock > 0) alertList.push({ type: "warning", message: `${lowStock} מוצרים במלאי נמוך`, time: "עכשיו" })
        if (overTarget > 0) alertList.push({ type: "info", message: `${overTarget} מנות מעל יעד עלות מזון (30%)`, time: "עכשיו" })
        if (delivered.length > 0) alertList.push({ type: "success", message: `${delivered.length} הזמנות ספקים נמסרו לאחרונה`, time: "עכשיו" })
        setAlerts(alertList)
      } catch (e) {
        console.error("load dashboard:", e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentRestaurantId, isOwner, refreshKey, isOwnerDashboard, restaurants])

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isOwnerDashboard && !currentRestaurantId) {
    return (
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-1">לוח בקרה</h1>
        <p className="text-muted-foreground">בחר מסעדה כדי לראות את הנתונים</p>
      </div>
    )
  }

  const grossProfit = totalRevenue - totalCost
  const avgTicket = totalDishesSold > 0 ? totalRevenue / totalDishesSold : 0

  const ownerGrossProfit = totalRevenue - totalCost
  const ownerAvgTicket = totalDishesSold > 0 ? totalRevenue / totalDishesSold : 0

  if (isOwnerDashboard) {
    const ownerKpis = [
      { label: "הכנסות החודש", value: `₪${totalRevenue.toLocaleString()}`, icon: TrendingUp, color: "bg-green-50 text-green-700" },
      { label: "מנות שנמכרו", value: String(totalDishesSold), icon: Utensils, color: "bg-amber-50 text-amber-700" },
      { label: "ממוצע לעסקה", value: `₪${ownerAvgTicket.toFixed(0)}`, icon: DollarSign, color: "bg-blue-50 text-blue-700" },
      { label: "רווח גולמי", value: `₪${ownerGrossProfit.toLocaleString()}`, icon: ArrowUpLeft, color: "bg-emerald-50 text-emerald-700" },
      { label: "% עלות מזון", value: `${avgFoodCost.toFixed(1)}%`, icon: DollarSign, color: "bg-blue-50 text-blue-700" },
      { label: "COGS", value: `₪${totalCost.toLocaleString()}`, icon: ShoppingCart, color: "bg-purple-50 text-purple-700" },
      { label: "מנות מעל יעד", value: String(dishesOverTarget), icon: AlertTriangle, color: "bg-orange-50 text-orange-700" },
      { label: "הזמנות ספקים", value: String(purchaseOrdersCount), icon: ShoppingCart, color: "bg-slate-50 text-slate-700" },
    ]

    return (
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-1">לוח בקרה — סקירת מסעדות</h1>
            <p className="text-muted-foreground">{restaurants?.length || 0} מסעדות פעילות במערכת</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 ml-1.5", loading && "animate-spin")} />
              רענן
            </Button>
            {setCurrentPage && (
              <Button variant="outline" size="sm" onClick={() => setCurrentPage("admin-panel")}>
                פאנל מנהל
              </Button>
            )}
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">מסעדות</h2>
          <p className="text-sm text-muted-foreground mb-4">לחץ על מסעדה כדי לראות את הנתונים שלה</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {restaurantCards.map((card) => (
              <Card
                key={card.id}
                className="border-0 shadow-sm cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => {
                  const rest = restaurants?.find((r) => r.id === card.id)
                  if (rest && onImpersonate) {
                    onImpersonate(rest)
                  }
                }}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl">
                    {card.emoji || "🍽️"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{card.name}</p>
                    <p className="text-xs text-muted-foreground">{card.branch || "סניף ראשי"}</p>
                  </div>
                  <div className="text-left">
                    <p className={cn("font-bold text-sm", card.avgFoodCost > 30 ? "text-orange-600" : "text-green-600")}>
                      {card.avgFoodCost > 0 ? `${card.avgFoodCost.toFixed(1)}%` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">{card.dishes} מנות{card.overTarget > 0 ? ` · ${card.overTarget} ⚠️` : ""}</p>
                  </div>
                  <span className="text-muted-foreground">›</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-6">
          {ownerKpis.map((kpi, i) => (
            <Card key={i} className="border-0 shadow-sm overflow-hidden">
              <CardContent className="p-4">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", kpi.color)}>
                  <kpi.icon className="w-5 h-5" />
                </div>
                <p className="text-2xl md:text-3xl font-bold mb-1">{kpi.value}</p>
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          <Card className="lg:col-span-2 border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Utensils className="w-5 h-5 text-muted-foreground" />
                מנות מובילות
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topDishes.length === 0 ? (
                <p className="text-muted-foreground text-sm">אין נתוני מכירות</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b">
                        <th className="text-right pb-3 font-medium">מנה</th>
                        <th className="text-center pb-3 font-medium">מכירות</th>
                        <th className="text-center pb-3 font-medium">הכנסה</th>
                        <th className="text-center pb-3 font-medium">מרווח</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topDishes.map((dish, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          <td className="py-3 font-medium">{dish.name}</td>
                          <td className="text-center py-3 text-muted-foreground">{dish.sales}</td>
                          <td className="text-center py-3">₪{dish.revenue.toLocaleString()}</td>
                          <td className="text-center py-3">
                            <Badge variant="secondary" className="bg-green-50 text-green-700 text-xs">
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

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
                רווחיות מנות
              </CardTitle>
            </CardHeader>
            <CardContent>
              {profitabilityDishes.length === 0 ? (
                <p className="text-muted-foreground text-sm">אין נתוני מכירות</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b">
                        <th className="text-right pb-3 font-medium">מנה</th>
                        <th className="text-center pb-3 font-medium">מרווח</th>
                        <th className="text-center pb-3 font-medium">עלות מזון</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitabilityDishes.map((dish, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          <td className="py-3 font-medium">{dish.name}</td>
                          <td className="text-center py-3">
                            <Badge variant="secondary" className={cn("text-xs", dish.margin >= 60 ? "bg-green-50 text-green-700" : dish.margin >= 40 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700")}>
                              {dish.margin.toFixed(0)}%
                            </Badge>
                          </td>
                          <td className="text-center py-3 text-muted-foreground">{dish.foodCost.toFixed(0)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          <Card className="lg:col-span-2 border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-muted-foreground" />
                התראות
              </CardTitle>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <p className="text-muted-foreground text-sm py-2">אין התראות</p>
              ) : (
                alerts.map((alert, i) => (
                  <div
                    key={alert.id ?? i}
                    className={cn(
                      "p-3 rounded-xl text-sm mb-2 last:mb-0 flex items-start justify-between gap-2",
                      alert.type === "warning" && "bg-amber-50 text-amber-800",
                      alert.type === "info" && "bg-blue-50 text-blue-800",
                      alert.type === "success" && "bg-green-50 text-green-800"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium mb-1">{alert.message}</p>
                      <p className="text-xs opacity-70">{alert.time}</p>
                    </div>
                    {alert.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 h-8 px-2 text-xs"
                        onClick={() => markNotificationRead(alert.id!)}
                      >
                        סגור
                      </Button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Users className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xl font-bold">{restaurants?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">מסעדות</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Utensils className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xl font-bold">{recipesCount}</p>
                  <p className="text-xs text-muted-foreground">מנות בתפריט</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <Users className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xl font-bold">{suppliersCount}</p>
                <p className="text-xs text-muted-foreground">ספקים</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <Utensils className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xl font-bold">{recipesCount}</p>
                <p className="text-xs text-muted-foreground">מנות בתפריט</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xl font-bold">{ingredientsCount}</p>
                <p className="text-xs text-muted-foreground">רכיבים</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xl font-bold">₪{inventoryValue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">שווי מלאי</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const kpis = [
    { label: "הכנסות החודש", value: `₪${totalRevenue.toLocaleString()}`, target: "", change: 0, trend: "up" as const, icon: TrendingUp, color: "bg-green-50 text-green-700" },
    { label: "מנות שנמכרו", value: String(totalDishesSold), target: "", change: 0, trend: "up" as const, icon: Utensils, color: "bg-amber-50 text-amber-700" },
    { label: "ממוצע לעסקה", value: `₪${avgTicket.toFixed(0)}`, target: "", change: 0, trend: "up" as const, icon: DollarSign, color: "bg-blue-50 text-blue-700" },
    { label: "רווח גולמי", value: `₪${grossProfit.toLocaleString()}`, target: "", change: 0, trend: "up" as const, icon: ArrowUpLeft, color: "bg-emerald-50 text-emerald-700" },
    { label: "% עלות מזון", value: `${avgFoodCost.toFixed(1)}%`, target: "30%", change: 0, trend: avgFoodCost > 30 ? ("down" as const) : ("up" as const), icon: DollarSign, color: "bg-blue-50 text-blue-700" },
    { label: "COGS", value: `₪${totalCost.toLocaleString()}`, target: "", change: 0, trend: "up" as const, icon: ShoppingCart, color: "bg-purple-50 text-purple-700" },
    { label: "מנות מעל יעד", value: String(dishesOverTarget), target: "30%", change: 0, trend: "down" as const, icon: AlertTriangle, color: "bg-orange-50 text-orange-700" },
    { label: "הזמנות ספקים", value: String(purchaseOrdersCount), target: "", change: 0, trend: "up" as const, icon: ShoppingCart, color: "bg-slate-50 text-slate-700" },
  ]

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1">לוח בקרה</h1>
          <p className="text-muted-foreground">סקירה כללית של הביצועים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4 ml-1.5", loading && "animate-spin")} />
            רענן
          </Button>
          {setCurrentPage && (
            <Button variant="outline" size="sm" onClick={() => setCurrentPage("upload")}>
              <Upload className="w-4 h-4 ml-1.5" />
              העלה דוח
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((kpi, i) => (
          <Card key={i} className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", kpi.color)}>
                  <kpi.icon className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl md:text-3xl font-bold mb-1">{kpi.value}</p>
              <p className="text-sm text-muted-foreground">
                {kpi.label}
                {kpi.target && <span className="text-xs"> (יעד: {kpi.target})</span>}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Utensils className="w-5 h-5 text-muted-foreground" />
              מנות מובילות
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topDishes.length === 0 ? (
              <p className="text-muted-foreground text-sm">אין נתוני מכירות. העלה דוח מכירות בהעלאה.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-right pb-3 font-medium">מנה</th>
                      <th className="text-center pb-3 font-medium">מכירות</th>
                      <th className="text-center pb-3 font-medium">הכנסה</th>
                      <th className="text-center pb-3 font-medium">מרווח</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDishes.map((dish, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="py-3 font-medium">{dish.name}</td>
                        <td className="text-center py-3 text-muted-foreground">{dish.sales}</td>
                        <td className="text-center py-3">₪{dish.revenue.toLocaleString()}</td>
                        <td className="text-center py-3">
                          <Badge variant="secondary" className="bg-green-50 text-green-700 text-xs">
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

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-muted-foreground" />
              רווחיות מנות
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profitabilityDishes.length === 0 ? (
              <p className="text-muted-foreground text-sm">אין נתוני מכירות</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-right pb-3 font-medium">מנה</th>
                      <th className="text-center pb-3 font-medium">מרווח</th>
                      <th className="text-center pb-3 font-medium">עלות מזון</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitabilityDishes.map((dish, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="py-3 font-medium">{dish.name}</td>
                        <td className="text-center py-3">
                          <Badge variant="secondary" className={cn("text-xs", dish.margin >= 60 ? "bg-green-50 text-green-700" : dish.margin >= 40 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700")}>
                            {dish.margin.toFixed(0)}%
                          </Badge>
                        </td>
                        <td className="text-center py-3 text-muted-foreground">{dish.foodCost.toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-muted-foreground" />
              התראות
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.length === 0 ? (
              <p className="text-muted-foreground text-sm py-2">אין נתונים</p>
            ) : (
              alerts.map((alert, i) => (
                <div
                  key={i}
                  className={cn(
                    "p-3 rounded-xl text-sm",
                    alert.type === "warning" && "bg-amber-50 text-amber-800",
                    alert.type === "info" && "bg-blue-50 text-blue-800",
                    alert.type === "success" && "bg-green-50 text-green-800"
                  )}
                >
                  <p className="font-medium mb-1">{alert.message}</p>
                  <p className="text-xs opacity-70">{alert.time}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <Users className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xl font-bold">{suppliersCount}</p>
              <p className="text-xs text-muted-foreground">ספקים</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <Utensils className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xl font-bold">{recipesCount}</p>
              <p className="text-xs text-muted-foreground">מנות בתפריט</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xl font-bold">{ingredientsCount}</p>
              <p className="text-xs text-muted-foreground">רכיבים</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xl font-bold">₪{inventoryValue.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">שווי מלאי</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
