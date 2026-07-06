"use client"

import { useState, useEffect, useCallback } from "react"
import { collection, getDocs, addDoc, deleteDoc, doc } from "firebase/firestore"
import { db, auth } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Plus, Trash2, Users, Phone, Mail } from "lucide-react"
import { toast } from "sonner"

type Employee = {
  id: string
  fullName: string
  idNumber: string
  position: string
  phone: string
  email: string
  startDate: string
  employmentType: string
}

const EMPLOYMENT_TYPES = ["שעתי", "חודשי (גלובלי)", "יומי", "קבלן"]

export function Employees() {
  const { currentRestaurantId } = useApp()
  const [items, setItems] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fullName, setFullName] = useState("")
  const [idNumber, setIdNumber] = useState("")
  const [position, setPosition] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [startDate, setStartDate] = useState("")
  const [employmentType, setEmploymentType] = useState(EMPLOYMENT_TYPES[0])

  const load = useCallback(async () => {
    if (!currentRestaurantId) { setLoading(false); return }
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, "restaurants", currentRestaurantId, "employees"))
      const list: Employee[] = snap.docs.map((d) => { const v = d.data(); return { id: d.id, fullName: (v.fullName as string) || "", idNumber: (v.idNumber as string) || "", position: (v.position as string) || "", phone: (v.phone as string) || "", email: (v.email as string) || "", startDate: (v.startDate as string) || "", employmentType: (v.employmentType as string) || "" } })
      list.sort((a, b) => a.fullName.localeCompare(b.fullName, "he"))
      setItems(list)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [currentRestaurantId])

  useEffect(() => { void load() }, [load])

  const add = async () => {
    if (!currentRestaurantId || !fullName.trim()) { toast.error("יש למלא שם עובד"); return }
    setSaving(true)
    try {
      await addDoc(collection(db, "restaurants", currentRestaurantId, "employees"), {
        fullName: fullName.trim(), idNumber: idNumber.trim(), position: position.trim(),
        phone: phone.trim(), email: email.trim(), startDate, employmentType,
        active: true, createdAt: new Date().toISOString(), createdByEmail: auth.currentUser?.email ?? null,
      })
      setFullName(""); setIdNumber(""); setPosition(""); setPhone(""); setEmail(""); setStartDate(""); setEmploymentType(EMPLOYMENT_TYPES[0])
      await load(); toast.success("העובד נוסף")
    } catch (e) { console.error(e); toast.error("שגיאה בשמירה") } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!currentRestaurantId || !confirm("למחוק עובד?")) return
    await deleteDoc(doc(db, "restaurants", currentRestaurantId, "employees", id))
    setItems((p) => p.filter((x) => x.id !== id))
  }

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
  if (!currentRestaurantId) return <div className="p-6"><p className="text-muted-foreground">בחר מסעדה</p></div>

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl bg-primary/10"><Users className="w-5 h-5 text-primary" /></div>
        <div>
          <h1 className="font-bold text-xl">ניהול עובדים</h1>
          <p className="text-sm text-muted-foreground">{items.length} עובדים</p>
        </div>
      </div>

      <Card><CardContent className="p-4 space-y-3">
        <h2 className="font-semibold text-sm">הוספת עובד</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input placeholder="שם מלא" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input placeholder="ת״ז" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
          <Input placeholder="תפקיד" value={position} onChange={(e) => setPosition(e.target.value)} />
          <Input placeholder="טלפון" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input placeholder="אימייל" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input type="date" placeholder="תאריך תחילת עבודה" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Select value={employmentType} onValueChange={setEmploymentType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{EMPLOYMENT_TYPES.map((tp) => <SelectItem key={tp} value={tp}>{tp}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button onClick={add} disabled={saving} className="gap-1"><Plus className="w-4 h-4" /> הוסף</Button>
      </CardContent></Card>

      {items.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">אין עובדים עדיין.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((emp) => (
            <div key={emp.id} className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3">
              <div className="min-w-0">
                <p className="font-medium text-sm">{emp.fullName} {emp.position && <span className="text-xs text-muted-foreground">· {emp.position}</span>}</p>
                <p className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                  {emp.employmentType && <span>{emp.employmentType}</span>}
                  {emp.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{emp.phone}</span>}
                  {emp.email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{emp.email}</span>}
                  {emp.startDate && <span>מ־{emp.startDate}</span>}
                </p>
              </div>
              <button onClick={() => remove(emp.id)} className="text-red-500 hover:text-red-700 shrink-0" aria-label="מחק"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Employees
