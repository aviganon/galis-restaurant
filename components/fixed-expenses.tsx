"use client"

import { useState, useEffect, useCallback } from "react"
import { collection, getDocs, addDoc, deleteDoc, doc } from "firebase/firestore"
import { db, auth } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Plus, Trash2, CreditCard } from "lucide-react"
import { toast } from "sonner"

type FixedExpense = {
  id: string
  name: string
  category: string
  amount: number
  frequency: "monthly" | "yearly"
  createdAt: string
}

const CATEGORIES = ["שכירות", "שכר עבודה", "חשמל", "מים", "ארנונה", "ביטוח", "תוכנות", "רואה חשבון", "שיווק", "אחר"]

const monthlyAmount = (e: FixedExpense) => (e.frequency === "yearly" ? e.amount / 12 : e.amount)

export function FixedExpenses() {
  const { currentRestaurantId } = useApp()
  const [items, setItems] = useState<FixedExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [category, setCategory] = useState(CATEGORIES[0])
  const [amount, setAmount] = useState("")
  const [frequency, setFrequency] = useState<"monthly" | "yearly">("monthly")

  const load = useCallback(async () => {
    if (!currentRestaurantId) { setLoading(false); return }
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, "restaurants", currentRestaurantId, "fixedExpenses"))
      const list: FixedExpense[] = snap.docs.map((d) => {
        const v = d.data()
        return { id: d.id, name: (v.name as string) || "", category: (v.category as string) || "אחר", amount: typeof v.amount === "number" ? v.amount : 0, frequency: v.frequency === "yearly" ? "yearly" : "monthly", createdAt: (v.createdAt as string) || "" }
      })
      list.sort((a, b) => monthlyAmount(b) - monthlyAmount(a))
      setItems(list)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [currentRestaurantId])

  useEffect(() => { void load() }, [load])

  const add = async () => {
    if (!currentRestaurantId || !name.trim() || !amount) { toast.error("יש למלא שם וסכום"); return }
    setSaving(true)
    try {
      await addDoc(collection(db, "restaurants", currentRestaurantId, "fixedExpenses"), {
        name: name.trim(), category, amount: parseFloat(amount) || 0, frequency,
        createdAt: new Date().toISOString(), createdByEmail: auth.currentUser?.email ?? null,
      })
      setName(""); setAmount(""); setFrequency("monthly")
      await load()
      toast.success("ההוצאה נוספה")
    } catch (e) { console.error(e); toast.error("שגיאה בשמירה") } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!currentRestaurantId || !confirm("למחוק הוצאה?")) return
    await deleteDoc(doc(db, "restaurants", currentRestaurantId, "fixedExpenses", id))
    setItems((p) => p.filter((x) => x.id !== id))
  }

  const totalMonthly = items.reduce((s, e) => s + monthlyAmount(e), 0)

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
  if (!currentRestaurantId) return <div className="p-6"><p className="text-muted-foreground">בחר מסעדה</p></div>

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl bg-primary/10"><CreditCard className="w-5 h-5 text-primary" /></div>
        <div>
          <h1 className="font-bold text-xl">הוצאות קבועות</h1>
          <p className="text-sm text-muted-foreground">סה״כ חודשי: ₪{totalMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
      </div>

      <Card><CardContent className="p-4 space-y-3">
        <h2 className="font-semibold text-sm">הוספת הוצאה</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input placeholder="שם ההוצאה" value={name} onChange={(e) => setName(e.target.value)} />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="number" placeholder="סכום ₪" value={amount} min={0} onChange={(e) => setAmount(e.target.value)} />
          <Select value={frequency} onValueChange={(v) => setFrequency(v as "monthly" | "yearly")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">חודשי</SelectItem>
              <SelectItem value="yearly">שנתי</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={add} disabled={saving} className="gap-1"><Plus className="w-4 h-4" /> הוסף</Button>
      </CardContent></Card>

      {items.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">אין הוצאות קבועות עדיין.</CardContent></Card>
      ) : (
        <div className="border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr><th className="text-right px-3 py-2">שם</th><th className="text-right px-3 py-2">קטגוריה</th><th className="text-center px-3 py-2">תדירות</th><th className="text-center px-3 py-2">סכום</th><th className="text-center px-3 py-2">חודשי</th><th className="w-8" /></tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{e.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.category}</td>
                  <td className="px-3 py-2 text-center">{e.frequency === "yearly" ? "שנתי" : "חודשי"}</td>
                  <td className="px-3 py-2 text-center tabular-nums">₪{e.amount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-center tabular-nums">₪{monthlyAmount(e).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="px-3 py-2 text-center"><button onClick={() => remove(e.id)} className="text-red-500 hover:text-red-700" aria-label="מחק"><Trash2 className="w-4 h-4" /></button></td>
                </tr>
              ))}
              <tr className="border-t bg-muted/30 font-bold"><td colSpan={4} className="px-3 py-2">סה״כ חודשי</td><td className="px-3 py-2 text-center tabular-nums">₪{totalMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td><td /></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default FixedExpenses
