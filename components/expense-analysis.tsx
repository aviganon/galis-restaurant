"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, TrendingDown } from "lucide-react"

type Fixed = { category: string; amount: number; frequency: "monthly" | "yearly" }
type PO = { total: number; status: string; createdAt: string }

export function ExpenseAnalysis() {
  const { currentRestaurantId } = useApp()
  const [fixed, setFixed] = useState<Fixed[]>([])
  const [orders, setOrders] = useState<PO[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!currentRestaurantId) { setLoading(false); return }
    setLoading(true)
    try {
      const [fxSnap, poSnap] = await Promise.all([
        getDocs(collection(db, "restaurants", currentRestaurantId, "fixedExpenses")),
        getDocs(query(collection(db, "purchaseOrders"), where("restaurantId", "==", currentRestaurantId))),
      ])
      setFixed(fxSnap.docs.map((d) => { const v = d.data(); return { category: (v.category as string) || "אחר", amount: typeof v.amount === "number" ? v.amount : 0, frequency: v.frequency === "yearly" ? "yearly" : "monthly" } }))
      setOrders(poSnap.docs.map((d) => { const v = d.data(); return { total: typeof v.total === "number" ? v.total : 0, status: (v.status as string) || "draft", createdAt: (v.createdAt as string) || "" } }))
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [currentRestaurantId])

  useEffect(() => { void load() }, [load])

  const monthlyFixed = useMemo(() => fixed.reduce((s, e) => s + (e.frequency === "yearly" ? e.amount / 12 : e.amount), 0), [fixed])

  const byCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of fixed) {
      const v = e.frequency === "yearly" ? e.amount / 12 : e.amount
      m.set(e.category, (m.get(e.category) || 0) + v)
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [fixed])

  const purchasesByMonth = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of orders) {
      if (o.status === "cancelled" || !o.createdAt) continue
      const month = o.createdAt.slice(0, 7) // YYYY-MM
      m.set(month, (m.get(month) || 0) + o.total)
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6)
  }, [orders])

  const maxCat = Math.max(1, ...byCategory.map(([, v]) => v))
  const maxMonth = Math.max(1, ...purchasesByMonth.map(([, v]) => v))

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
  if (!currentRestaurantId) return <div className="p-6"><p className="text-muted-foreground">בחר מסעדה</p></div>

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl bg-primary/10"><TrendingDown className="w-5 h-5 text-primary" /></div>
        <h1 className="font-bold text-xl">ניתוח הוצאות חודשי</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-primary tabular-nums">₪{monthlyFixed.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p><p className="text-xs text-muted-foreground">הוצאות קבועות (חודשי)</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-amber-500 tabular-nums">₪{(purchasesByMonth[0]?.[1] || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p><p className="text-xs text-muted-foreground">רכש בחודש האחרון</p></CardContent></Card>
      </div>

      <Card><CardContent className="p-4">
        <h2 className="font-semibold text-sm mb-3">הוצאות קבועות לפי קטגוריה</h2>
        {byCategory.length === 0 ? <p className="text-sm text-muted-foreground">אין נתונים. הוסף הוצאות במסך «הוצאות קבועות».</p> : (
          <div className="space-y-2">
            {byCategory.map(([cat, v]) => (
              <div key={cat}>
                <div className="flex justify-between text-sm mb-0.5"><span>{cat}</span><span className="tabular-nums text-muted-foreground">₪{v.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${(v / maxCat) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>

      <Card><CardContent className="p-4">
        <h2 className="font-semibold text-sm mb-3">רכש מספקים לפי חודש (6 אחרונים)</h2>
        {purchasesByMonth.length === 0 ? <p className="text-sm text-muted-foreground">אין הזמנות ספקים.</p> : (
          <div className="space-y-2">
            {purchasesByMonth.map(([month, v]) => (
              <div key={month}>
                <div className="flex justify-between text-sm mb-0.5"><span>{month}</span><span className="tabular-nums text-muted-foreground">₪{v.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${(v / maxMonth) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>
    </div>
  )
}

export default ExpenseAnalysis
