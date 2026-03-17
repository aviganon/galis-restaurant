"use client"

import { useState, useEffect } from "react"
import { collection, getDocs, getDoc, doc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Download,
  DollarSign,
  Utensils,
  ShoppingCart,
  PieChart,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { downloadExcel } from "@/lib/export-excel"
import { toast } from "sonner"
import { useTranslations } from "@/lib/use-translations"

const VAT_RATE = 1.17

const isOwnerRole = (role: string, isSystemOwner?: boolean) => isSystemOwner || role === "owner"

export function Reports() {
  const t = useTranslations()
  const { currentRestaurantId, userRole, isSystemOwner } = useApp()
  const isOwner = isOwnerRole(userRole, isSystemOwner)
  const [loading, setLoading] = useState(true)
  const [topDishes, setTopDishes] = useState<{ name: string; revenue: number; growth: number }[]>([])
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalCost, setTotalCost] = useState(0)
  const [margin, setMargin] = useState(0)

  useEffect(() => {
    if (!currentRestaurantId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const load = async () => {
      try {
        const [recSnap, restIngSnap, salesDoc, asDoc] = await Promise.all([
          getDocs(collection(db, "restaurants", currentRestaurantId, "recipes")),
          getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients")),
          getDoc(doc(db, "restaurants", currentRestaurantId, "appState", `salesReport_${currentRestaurantId}`)),
          getDoc(doc(db, "restaurants", currentRestaurantId, "appState", "assignedSuppliers")),
        ])
        const assignedList: string[] = Array.isArray(asDoc.data()?.list) ? asDoc.data()!.list : []
        const globalIngSnap = isOwner ? await getDocs(collection(db, "ingredients")) : null

        const prices: Record<string, number> = {}
        restIngSnap.forEach((d) => {
          const data = d.data()
          prices[d.id] = typeof data.price === "number" ? data.price : 0
        })
        globalIngSnap?.forEach((d) => {
          if (!(d.id in prices)) {
            const data = d.data()
            const sup = (data.supplier as string) || ""
            if (!sup) return
            if (!assignedList.includes(sup)) return
            prices[d.id] = typeof data.price === "number" ? data.price : 0
          }
        })

        const dailySales = (salesDoc.data()?.dailySales as Record<string, { avg: number; trend: number }>) || {}
        let rev = 0
        let cost = 0
        const list: { name: string; revenue: number; growth: number }[] = []

        recSnap.docs.forEach((r) => {
          const data = r.data()
          if (data.isCompound) return
          const sellingPrice = (typeof data.sellingPrice === "number" ? data.sellingPrice : 0) / VAT_RATE
          const sales = dailySales[r.id]?.avg ?? 0
          const revenue = sellingPrice * sales
          rev += revenue
          const ing = Array.isArray(data.ingredients) ? data.ingredients : []
          let dishCost = 0
          ing.forEach((i: { name?: string; qty?: number; waste?: number; unit?: string }) => {
            const p = prices[i.name || ""] ?? 0
            let mult = 1
            if (i.unit === "גרם") mult = 0.001
            else if (i.unit === "מל") mult = 0.001
            dishCost += (i.qty || 0) * p * mult * (1 + (i.waste || 0) / 100)
          })
          cost += dishCost * sales
          const growth = dailySales[r.id]?.trend ?? 0
          list.push({ name: r.id, revenue, growth })
        })

        list.sort((a, b) => b.revenue - a.revenue)
        setTopDishes(list.slice(0, 5))
        setTotalRevenue(rev)
        setTotalCost(cost)
        setMargin(rev > 0 ? ((rev - cost) / rev) * 100 : 0)
      } catch (e) {
        console.error("load reports:", e)
        toast.error("שגיאה בטעינת דוחות")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentRestaurantId, isOwner])

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6 flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!currentRestaurantId) {
    return (
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-1">{t("nav.reports")}</h1>
        <p className="text-muted-foreground">{t("pages.reports.selectRestaurant")}</p>
      </div>
    )
  }

  const revenueChange = 0

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1">{t("pages.reports.title")}</h1>
          <p className="text-muted-foreground">{t("pages.reports.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => {
              const rows = [
                { [t("pages.purchaseOrders.date")]: new Date().toLocaleDateString("he-IL"), [t("pages.reports.revenue")]: totalRevenue, [t("pages.reports.foodCost")]: totalCost, [t("pages.reports.margin")]: margin.toFixed(1) },
                ...topDishes.map((d) => ({ [t("pages.menuCosts.dish")]: d.name, [t("pages.reports.revenue")]: d.revenue, [t("pages.reports.growth")]: d.growth })),
              ]
              downloadExcel(rows, `report_${new Date().toISOString().slice(0, 10)}`, "report")
              toast.success(t("pages.ingredients.fileDownloaded"))
            }}
          >
            <Download className="w-4 h-4 ml-2" />
            {t("pages.reports.exportExcel")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-5 h-5 text-muted-foreground" />
              <Badge className={cn("text-xs", revenueChange >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
                {revenueChange >= 0 ? <TrendingUp className="w-3 h-3 ml-1" /> : <TrendingDown className="w-3 h-3 ml-1" />}
                {Math.abs(revenueChange)}%
              </Badge>
            </div>
            <p className="text-2xl font-bold">₪{totalRevenue.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">{t("pages.reports.revenue")}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <ShoppingCart className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">₪{totalCost.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">{t("pages.reports.foodCost")}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <PieChart className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{margin.toFixed(1)}%</p>
            <p className="text-sm text-muted-foreground">{t("pages.reports.grossMargin")}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Utensils className="w-5 h-5 text-muted-foreground" />
            {t("pages.reports.topDishes")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topDishes.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("pages.reports.noSalesData")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-right pb-3 font-medium">{t("pages.menuCosts.dish")}</th>
                    <th className="text-center pb-3 font-medium">{t("pages.reports.revenue")}</th>
                    <th className="text-center pb-3 font-medium">{t("pages.reports.change")}</th>
                  </tr>
                </thead>
                <tbody>
                  {topDishes.map((dish, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-3 font-medium">{dish.name}</td>
                      <td className="text-center py-3">₪{dish.revenue.toLocaleString()}</td>
                      <td className="text-center py-3">
                        <Badge variant="secondary" className={dish.growth >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}>
                          {dish.growth >= 0 ? "+" : ""}{dish.growth}%
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
    </div>
  )
}
