"use client"

import { useState, useEffect, useCallback } from "react"
import { collection, getDocs, addDoc, deleteDoc, doc } from "firebase/firestore"
import { db, auth } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Plus, Trash2, Warehouse as WarehouseIcon } from "lucide-react"
import { toast } from "sonner"

type Warehouse = { id: string; name: string; location: string; type: string; notes: string }

const TYPES = ["ראשי", "קירור", "הקפאה", "יבש", "משקאות", "אחר"]

export function Warehouses() {
  const { currentRestaurantId } = useApp()
  const [items, setItems] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [location, setLocation] = useState("")
  const [type, setType] = useState(TYPES[0])
  const [notes, setNotes] = useState("")

  const load = useCallback(async () => {
    if (!currentRestaurantId) { setLoading(false); return }
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, "restaurants", currentRestaurantId, "warehouses"))
      const list: Warehouse[] = snap.docs.map((d) => { const v = d.data(); return { id: d.id, name: (v.name as string) || "", location: (v.location as string) || "", type: (v.type as string) || "אחר", notes: (v.notes as string) || "" } })
      list.sort((a, b) => a.name.localeCompare(b.name, "he"))
      setItems(list)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [currentRestaurantId])

  useEffect(() => { void load() }, [load])

  const add = async () => {
    if (!currentRestaurantId || !name.trim()) { toast.error("יש למלא שם מחסן"); return }
    setSaving(true)
    try {
      await addDoc(collection(db, "restaurants", currentRestaurantId, "warehouses"), {
        name: name.trim(), location: location.trim(), type, notes: notes.trim(),
        active: true, createdAt: new Date().toISOString(), createdByEmail: auth.currentUser?.email ?? null,
      })
      setName(""); setLocation(""); setType(TYPES[0]); setNotes("")
      await load(); toast.success("המחסן נוסף")
    } catch (e) { console.error(e); toast.error("שגיאה בשמירה") } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!currentRestaurantId || !confirm("למחוק מחסן?")) return
    await deleteDoc(doc(db, "restaurants", currentRestaurantId, "warehouses", id))
    setItems((p) => p.filter((x) => x.id !== id))
  }

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
  if (!currentRestaurantId) return <div className="p-6"><p className="text-muted-foreground">בחר מסעדה</p></div>

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl bg-primary/10"><WarehouseIcon className="w-5 h-5 text-primary" /></div>
        <h1 className="font-bold text-xl">ניהול מחסנים</h1>
      </div>

      <Card><CardContent className="p-4 space-y-3">
        <h2 className="font-semibold text-sm">הוספת מחסן</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input placeholder="שם המחסן" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="מיקום" value={location} onChange={(e) => setLocation(e.target.value)} />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map((tp) => <SelectItem key={tp} value={tp}>{tp}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="הערות" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <Button onClick={add} disabled={saving} className="gap-1"><Plus className="w-4 h-4" /> הוסף</Button>
      </CardContent></Card>

      {items.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">אין מחסנים עדיין.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3">
              <div className="min-w-0">
                <p className="font-medium text-sm">{w.name} <span className="text-xs text-muted-foreground">· {w.type}</span></p>
                <p className="text-xs text-muted-foreground">{[w.location, w.notes].filter(Boolean).join(" · ")}</p>
              </div>
              <button onClick={() => remove(w.id)} className="text-red-500 hover:text-red-700 shrink-0" aria-label="מחק"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Warehouses
