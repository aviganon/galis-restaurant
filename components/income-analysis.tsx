"use client"

import { useState, useEffect, useCallback } from "react"
import { collection, getDocs, getDoc, doc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { recipeCountsAsMenuDish } from "@/lib/recipe-menu-visibility"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, TrendingUp } from "lucide-react"

const VAT_RATE = 1.17

type DishIncome = { name: string; daily: number; share: number }

export function IncomeAnalysis() {
  const { currentRestaurantId } = useApp()
  const [dishes, setDishes] = useState<DishIncome[]>([])
  const [dailyTotal, setDailyTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!currentRestaurantId) { setLoading(false); return }
    setLoading(true)
    try {
      const [recSnap, salesDoc] = await Promise.all([
        getDocs(collection(db, "restaurants", currentRestaurantId, "recipes")),
        getDoc(doc(db, "restaurants", currentRestaurantId, "appState", `salesReport_${currentRestaurantId}`)),
      ])
      const dailySales = (salesDoc.data()?.dailySales as Record<string, { avg: number; trend: number }>) || {}
      const list: { name: string; daily: number }[] = []
      let total = 0
      recSnap.docs.forEach((r) => {
        const data = r.data()
        if (!recipeCountsAsMenuDish(data)) return
        const sellingPrice = (typeof data.sellingPrice === "number" ? data.sellingPrice : 0) / VAT_RATE
        const sales = dailySales[r.id]?.avg ?? 0
        const daily = sellingPrice * sales
        if (daily <= 0) return
        total += daily
        list.push({ name: r.id, daily })
      })
      list.sort((a, b) => b.daily - a.daily)
      setDailyTotal(total)
      setDishes(list.map((d) => ({ ...d, share: total > 0 ? (d.daily / total) * 100 : 0 })))
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [currentRestaurantId])

  useEffect(() => { void load() }, [load])

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
  if (!currentRestaurantId) return <div className="p-6"><p className="text-muted-foreground">בחר מסעדה</p></div>

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl bg-primary/10"><TrendingUp className="w-5 h-5 text-primary" /></div>
        <h1 className="font-bold text-xl">ניתוח הכנסות</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-emerald-600 tabular-nums">₪{dailyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p><p className="text-xs text-muted-foreground">הכנסה יומית משוערת (ללא מע״מ)</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-primary tabular-nums">₪{(dailyTotal * 30).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p><p className="text-xs text-muted-foreground">הכנסה חודשית משוערת</p></CardContent></Card>
      </div>

      <Card><CardContent className="p-4">
        <h2 className="font-semibold text-sm mb-3">הכנסה לפי מנה</h2>
        {dishes.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין נתוני מכירות. עדכן מכירות במסך הדוחות/מכירות כדי לראות ניתוח.</p>
        ) : (
          <div className="space-y-2">
            {dishes.map((d) => (
              <div key={d.name}>
                <div className="flex justify-between text-sm mb-0.5"><span className="truncate">{d.name}</span><span className="tabular-nums text-muted-foreground">₪{d.daily.toLocaleString(undefined, { maximumFractionDigits: 0 })}/יום · {d.share.toFixed(0)}%</span></div>
                <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${d.share}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>
    </div>
  )
}

export default IncomeAnalysis
