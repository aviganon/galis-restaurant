"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { collection, getDocs, query, where, addDoc, updateDoc, deleteDoc, doc, getDoc, writeBatch, collectionGroup } from "firebase/firestore"
import { db, auth } from "@/lib/firebase"
import { appendRestaurantAuditLog } from "@/lib/restaurant-operations"
import { loadGlobalPriceSubdocsMap, type PriceSubEntry } from "@/lib/ingredient-assigned-price"
import { convertQty } from "@/lib/unit-conversion"
import { toWhatsappNumber, buildOrderMessage } from "@/lib/phone"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { FileText, Clock, CheckCircle2, Loader2, Search, ShoppingCart, Package, ClipboardList, RefreshCw, Mail, MessageCircle, Save, Trash2, Plus, ChevronDown } from "lucide-react"
import { toast } from "sonner"
import { FilePreviewModal } from "@/components/file-preview-modal"
import { Button } from "@/components/ui/button"
import { useTranslations } from "@/lib/use-translations"
import { supplierFirestoreDocId } from "@/lib/supplier-firestore-id"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

interface OrderSuggestion {
  name: string
  currentStock: number
  minStock: number
  suggestedQty: number
  unit: string
  price: number
  supplier: string
  /** צריכה יומית משוערת לפי דוח מכירות (ביחידת המלאי) */
  dailyUse?: number
}

interface PurchaseOrder {
  id: string
  orderNumber: string
  supplier: string
  items: { name: string; quantity: number; unit: string; price: number }[]
  total: number
  status: string
  createdAt: string
  expectedDelivery?: string
  /** אסמכתא לחשבונית / מספר חיצוני */
  linkedInvoiceRef?: string
}
interface RestaurantSupplier {
  id: string
  name: string
  email: string
  phone: string
}

interface UploadRecord {
  id: string
  fileName: string
  uploadedAt: string
  ingredientCount: number
  supplier: string
  status?: string
  source?: "manual" | "email"
}

type OrderItem = { name: string; quantity: number; unit: string; price: number }

const STOCK_COUNT_ACCEPT = ".xlsx,.xls,.csv,.pdf,.rtf,image/*"

function Section({ title, count, icon: Icon, defaultOpen = false, children }: { title: string; count?: number; icon: typeof Package; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between gap-2 p-4 text-right">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-2 rounded-xl bg-primary/10 shrink-0"><Icon className="w-5 h-5 text-primary" /></div>
              <h3 className="font-bold text-base truncate">{title}{typeof count === "number" ? <span className="text-muted-foreground font-normal"> ({count})</span> : null}</h3>
            </div>
            <ChevronDown className={cn("w-5 h-5 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

export function PurchaseOrders() {
  const t = useTranslations()
  const { currentRestaurantId, refreshIngredients } = useApp()
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [rawIngredients, setRawIngredients] = useState<Array<{ name: string; stock: number; minStock: number; unit: string; price: number; supplier: string }>>([])
  const [dailyUsage, setDailyUsage] = useState<Record<string, number>>({})
  const [coverageDays, setCoverageDays] = useState(7)
  const [pricesMap, setPricesMap] = useState<Map<string, PriceSubEntry[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [restaurantSuppliers, setRestaurantSuppliers] = useState<RestaurantSupplier[]>([])
  const [selSup, setSelSup] = useState<RestaurantSupplier | null>(null)
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [orderNotes, setOrderNotes] = useState("")
  const [orderLinkedInvoiceRef, setOrderLinkedInvoiceRef] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploads, setUploads] = useState<UploadRecord[]>([])
  const [stockCountFile, setStockCountFile] = useState<File | null>(null)
  const [stockCountModalOpen, setStockCountModalOpen] = useState(false)
  const stockFileInputRef = useRef<HTMLInputElement>(null)

  const loadData = useCallback(async () => {
    if (!currentRestaurantId) { setLoading(false); return }
    setLoading(true)
    try {
      const [ordersSnap, ingSnap, pMap, recSnap, salesDoc] = await Promise.all([
        getDocs(query(collection(db, "purchaseOrders"), where("restaurantId", "==", currentRestaurantId))),
        getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients")),
        loadGlobalPriceSubdocsMap(db),
        getDocs(collection(db, "restaurants", currentRestaurantId, "recipes")),
        getDoc(doc(db, "restaurants", currentRestaurantId, "appState", `salesReport_${currentRestaurantId}`)),
      ])
      setPricesMap(pMap)
      const list: PurchaseOrder[] = ordersSnap.docs.map(d => {
        const data = d.data()
        return { id: d.id, orderNumber: (data.orderNumber as string) || d.id, supplier: (data.supplier as string) || "", items: Array.isArray(data.items) ? data.items : [], total: typeof data.total === "number" ? data.total : 0, status: (data.status as string) || "draft", createdAt: (data.createdAt as string) || "", expectedDelivery: data.expectedDelivery as string | undefined, linkedInvoiceRef: typeof data.linkedInvoiceRef === "string" ? data.linkedInvoiceRef : undefined }
      })
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setOrders(list)
      // רכיבים גולמיים — ההמלצות עצמן מחושבות ב-useMemo לפי ימי כיסוי
      const rawIngs: Array<{ name: string; stock: number; minStock: number; unit: string; price: number; supplier: string }> = []
      const ingUnits: Record<string, string> = {}
      ingSnap.forEach(d => {
        const data = d.data()
        const unit = (data.unit as string) || "יח"
        ingUnits[d.id] = unit
        rawIngs.push({
          name: d.id,
          stock: typeof data.stock === "number" ? data.stock : 0,
          minStock: typeof data.minStock === "number" ? data.minStock : 0,
          unit,
          price: typeof data.price === "number" ? data.price : 0,
          supplier: ((data.supplier as string) || "").trim() || "—",
        })
      })
      setRawIngredients(rawIngs)

      // צריכה יומית לכל רכיב לפי דוח המכירות (מכירות × מתכון, עם המרת יחידות)
      const recipesMap: Record<string, { ingredients: { name: string; qty?: number; unit?: string; isSubRecipe?: boolean }[]; yieldQty: number }> = {}
      recSnap.forEach(d => {
        const data = d.data()
        recipesMap[d.id] = {
          ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
          yieldQty: typeof data.yieldQty === "number" && data.yieldQty > 0 ? data.yieldQty : 1,
        }
      })
      const salesData = salesDoc.data() || {}
      const dailySales = (salesData.dailySales as Record<string, { avg?: number }>) || {}
      const period = (salesData.salesReportPeriod as string) || "unknown"
      const periodDays = period === "monthly" ? 30 : period === "weekly" ? 7 : 1
      const usage: Record<string, number> = {}
      const addUsage = (dishId: string, servingsPerDay: number, depth: number) => {
        if (depth > 6) return
        const rec = recipesMap[dishId]
        if (!rec) return
        const yieldQty = rec.yieldQty || 1
        for (const ing of rec.ingredients) {
          const perServing = (Number(ing.qty) || 0) / yieldQty
          const amountPerDay = perServing * servingsPerDay
          if (amountPerDay <= 0) continue
          if (ing.isSubRecipe) {
            addUsage(ing.name, amountPerDay, depth + 1)
          } else {
            usage[ing.name] = (usage[ing.name] || 0) + convertQty(amountPerDay, ing.unit, ingUnits[ing.name] || ing.unit)
          }
        }
      }
      Object.entries(dailySales).forEach(([dishId, v]) => {
        const perDay = (Number(v?.avg) || 0) / periodDays
        if (perDay > 0) addUsage(dishId, perDay, 0)
      })
      setDailyUsage(usage)
      try {
        const asDoc = await getDoc(doc(db, "restaurants", currentRestaurantId, "appState", "assignedSuppliers"))
        const assigned: string[] = Array.isArray(asDoc.data()?.list) ? asDoc.data()!.list : []
        const supplierNames = new Set<string>(assigned.map((s) => String(s || "").trim()).filter(Boolean))
        ingSnap.forEach((d) => {
          const sup = String(d.data()?.supplier || "").trim()
          if (sup) supplierNames.add(sup)
        })
        const supDocs = await Promise.all(
          Array.from(supplierNames).map((name) => getDoc(doc(db, "suppliers", supplierFirestoreDocId(name))))
        )
        const map = new Map<string, RestaurantSupplier>()
        Array.from(supplierNames).forEach((name) => {
          map.set(name, { id: name, name, email: "", phone: "" })
        })
        supDocs.forEach((d) => {
          if (!d.exists()) return
          const data = d.data()
          const name = String(data?.name || "").trim() || d.id
          map.set(name, {
            id: name,
            name,
            email: (data?.email as string) || "",
            phone: (data?.phone as string) || "",
          })
        })
        setRestaurantSuppliers(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "he")))
      } catch(e) { console.error(e) }
      try {
        const [upSnap, inboundSnap] = await Promise.all([
          getDocs(collection(db, "restaurants", currentRestaurantId, "uploads")),
          getDocs(query(collectionGroup(db, "inboundJobs"), where("restaurantId", "==", currentRestaurantId))),
        ])
        const manualUps: UploadRecord[] = upSnap.docs.map(d => {
          const v = d.data()
          return {
            id: d.id,
            fileName: (v.fileName as string) || d.id,
            uploadedAt: (v.uploadedAt as string) || (v.createdAt as string) || "",
            ingredientCount: Number(v.ingredientCount) || 0,
            supplier: (v.supplier as string) || "",
            source: "manual",
          }
        })
        const inboundUps: UploadRecord[] = inboundSnap.docs.map((d) => {
          const v = d.data()
          const paths = Array.isArray(v.attachmentPaths) ? (v.attachmentPaths as string[]) : []
          const first = paths[0] || ""
          const fileName = first.split("/").pop() || (v.subject as string) || d.id
          return {
            id: d.id,
            fileName,
            uploadedAt: (v.receivedAt as string) || (v.createdAt as string) || "",
            ingredientCount: 0,
            supplier: (v.fromEmail as string) || "",
            status: (v.status as string) || "pending",
            source: "email",
          }
        })
        const ups: UploadRecord[] = [...manualUps, ...inboundUps]
        ups.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
        setUploads(ups)
      } catch(e) { console.error(e) }
    } catch { setOrders([]); setRawIngredients([]); setDailyUsage({}) } finally { setLoading(false) }
  }, [currentRestaurantId])

  useEffect(() => { void loadData() }, [loadData])

  // המלצות הזמנה: מקסימום בין (מלאי<מינימום) לבין (צריכה יומית × ימי כיסוי)
  const suggestions = useMemo<OrderSuggestion[]>(() => {
    const out: OrderSuggestion[] = []
    for (const ing of rawIngredients) {
      const dailyUse = dailyUsage[ing.name] || 0
      const target = Math.max(ing.minStock, Math.ceil(dailyUse * coverageDays))
      const belowMin = ing.stock < ing.minStock || (ing.stock === 0 && ing.minStock === 0)
      if (ing.stock < target || belowMin) {
        out.push({
          name: ing.name,
          currentStock: ing.stock,
          minStock: ing.minStock,
          suggestedQty: Math.max(1, Math.ceil(target - ing.stock)),
          unit: ing.unit,
          price: ing.price,
          supplier: ing.supplier,
          dailyUse: dailyUse > 0 ? dailyUse : undefined,
        })
      }
    }
    out.sort((a, b) => (a.supplier || "").localeCompare(b.supplier || ""))
    return out
  }, [rawIngredients, dailyUsage, coverageDays])

  const handleStockCountFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f) return
    setStockCountFile(f)
    setStockCountModalOpen(true)
  }

  const confirmStockCount = useCallback(
    async (items: Array<{ name: string; qty: number; unit?: string }>) => {
      if (!currentRestaurantId) return
      try {
        const BATCH = 400
        for (let i = 0; i < items.length; i += BATCH) {
          const slice = items.slice(i, i + BATCH)
          const batch = writeBatch(db)
          for (const row of slice) {
            const payload: Record<string, unknown> = {
              stock: row.qty,
              lastUpdated: new Date().toISOString(),
            }
            if (row.unit?.trim()) payload.unit = row.unit.trim()
            batch.set(doc(db, "restaurants", currentRestaurantId, "ingredients", row.name), payload, { merge: true })
          }
          await batch.commit()
        }
        refreshIngredients?.()
        await loadData()
        toast.success(`${t("pages.purchaseOrders.stockCountSuccess")} (${items.length})`)
        setStockCountFile(null)
      } catch (err) {
        console.error(err)
        toast.error((err as Error)?.message || "שגיאה בעדכון מלאי")
      }
    },
    [currentRestaurantId, refreshIngredients, loadData, t]
  )

  // מחיר הספק הנבחר לרכיב, עם נפילה למחיר הרכיב הראשי
  const priceForSupplier = useCallback((name: string, supplierName: string, fallback: number) => {
    const entry = pricesMap.get(name)?.find((p) => p.supplier.trim() === supplierName.trim())
    return entry && entry.price > 0 ? entry.price : fallback
  }, [pricesMap])

  const suggestionsBySupplier = useMemo(() => {
    const map = new Map<string, OrderSuggestion[]>()
    for (const s of suggestions) {
      const key = (s.supplier || "").trim() || "—"
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "he"))
      .map(([supplier, items]) => ({ supplier, items }))
  }, [suggestions])

  // בחירת ספק: טוען אוטומטית את פריטי ההמלצות שלו עם מחיר הספק
  const selectSupplier = useCallback((sup: RestaurantSupplier | null) => {
    setSelSup(sup)
    if (!sup) { setOrderItems([]); return }
    const items: OrderItem[] = suggestions
      .filter((s) => (s.supplier || "").trim() === sup.name.trim())
      .map((s) => ({ name: s.name, quantity: Math.max(1, s.suggestedQty), unit: s.unit, price: priceForSupplier(s.name, sup.name, s.price) }))
    setOrderItems(items)
  }, [suggestions, priceForSupplier])

  const addItem = (name: string, unit: string, price: number, qty: number) => {
    setOrderItems((prev) => {
      const ex = prev.find((i) => i.name === name)
      if (ex) return prev.map((i) => (i.name === name ? { ...i, quantity: i.quantity + qty } : i))
      return [...prev, { name, quantity: qty, unit, price }]
    })
  }

  const orderTot = orderItems.reduce((s, i) => s + i.quantity * i.price, 0)

  // ספירת מספרי הפריטים שחסרים לכל ספק (לצ'יפים)
  const supplierShortCounts = useMemo(() => {
    return suggestionsBySupplier.map(({ supplier, items }) => ({
      supplier,
      count: items.length,
      subtotal: items.reduce((sum, s) => sum + s.suggestedQty * priceForSupplier(s.name, supplier, s.price), 0),
    }))
  }, [suggestionsBySupplier, priceForSupplier])

  const saveOrder = async (method?: "email" | "whatsapp") => {
    if (!currentRestaurantId || !selSup || !orderItems.length) return
    const num = "ORD-" + Date.now().toString().slice(-6)
    const msg = buildOrderMessage({ orderNumber: num, supplierName: selSup.name, items: orderItems, total: orderTot })

    // פותחים את הקישור סינכרונית *לפני* ה-await כדי לא לאבד את user-gesture (iOS Safari חוסם אחרת)
    if (method === "whatsapp") {
      const wa = toWhatsappNumber(selSup.phone)
      if (wa) window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank")
    } else if (method === "email" && selSup.email) {
      window.open(`mailto:${selSup.email}?subject=${encodeURIComponent("הזמנה " + num)}&body=${encodeURIComponent(msg)}`, "_blank")
    }

    setSaving(true)
    try {
      const linkedRef = orderLinkedInvoiceRef.trim()
      await addDoc(collection(db, "purchaseOrders"), { restaurantId: currentRestaurantId, orderNumber: num, supplier: selSup.name, supplierEmail: selSup.email || "", supplierPhone: selSup.phone || "", items: orderItems, total: orderTot, status: method ? "sent" : "draft", createdAt: new Date().toISOString().split("T")[0], notes: orderNotes, ...(linkedRef ? { linkedInvoiceRef: linkedRef } : {}) })
      void appendRestaurantAuditLog(db, currentRestaurantId, {
        action: "purchase_order_created",
        summary: `הזמנה ${num} — ${selSup.name} (₪${orderTot.toFixed(2)})`,
        meta: { orderNumber: num, supplier: selSup.name, total: orderTot, status: method ? "sent" : "draft" },
        actorUid: auth.currentUser?.uid ?? null,
        actorEmail: auth.currentUser?.email ?? null,
      })
      setOrderItems([]); setSelSup(null); setOrderNotes(""); setOrderLinkedInvoiceRef("")
      await loadData()
      toast.success(method === "whatsapp" ? "ההזמנה נשמרה — נפתח WhatsApp לשליחה" : method === "email" ? "ההזמנה נשמרה — נפתח המייל לשליחה" : "ההזמנה נשמרה כטיוטה")
    } catch(e) { console.error(e); toast.error("שגיאה בשמירת ההזמנה") } finally { setSaving(false) }
  }

  const delOrder = async (id: string) => {
    if (!confirm("למחוק הזמנה?")) return
    await deleteDoc(doc(db, "purchaseOrders", id))
    setOrders(prev => prev.filter(o => o.id !== id))
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "draft": return { label: "טיוטה", color: "bg-gray-100 text-gray-700", icon: FileText }
      case "sent": return { label: "נשלחה", color: "bg-blue-100 text-blue-700", icon: Clock }
      case "confirmed": return { label: "אושרה", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 }
      case "delivered": return { label: "התקבלה", color: "bg-purple-100 text-purple-700", icon: CheckCircle2 }
      case "cancelled": return { label: "בוטלה", color: "bg-red-100 text-red-700", icon: FileText }
      default: return { label: status, color: "bg-gray-100 text-gray-700", icon: FileText }
    }
  }

  const filteredOrders = orders.filter(o => o.orderNumber.includes(searchTerm) || o.supplier.includes(searchTerm))
  const stats = { total: orders.length, pending: orders.filter(o => o.status === "sent" || o.status === "confirmed").length, delivered: orders.filter(o => o.status === "delivered").length, totalValue: orders.filter(o => o.status !== "cancelled").reduce((s, o) => s + o.total, 0) }

  // רכיבים שאפשר להוסיף ידנית: המלצות שעדיין לא בהזמנה (של הספק הנבחר אם נבחר, אחרת הכל)
  const addableSuggestions = useMemo(() => {
    const inOrder = new Set(orderItems.map((i) => i.name))
    const base = selSup ? suggestionsBySupplier.filter(({ supplier }) => supplier.trim() === selSup.name.trim()) : suggestionsBySupplier
    return base
      .map(({ supplier, items }) => ({ supplier, items: items.filter((i) => !inOrder.has(i.name)) }))
      .filter(({ items }) => items.length > 0)
  }, [orderItems, selSup, suggestionsBySupplier])

  const noPhone = !!selSup && !toWhatsappNumber(selSup.phone)
  const noEmail = !!selSup && !selSup.email

  if (loading) return <div className="p-4 md:p-6 flex items-center justify-center min-h-[40vh]"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
  if (!currentRestaurantId) return <div className="p-4 md:p-6"><p className="text-muted-foreground">בחר מסעדה</p></div>

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto" dir="rtl">
      <input
        ref={stockFileInputRef}
        type="file"
        className="hidden"
        accept={STOCK_COUNT_ACCEPT}
        onChange={handleStockCountFileChange}
      />
      <FilePreviewModal
        open={stockCountModalOpen}
        onOpenChange={(open) => {
          setStockCountModalOpen(open)
          if (!open) setStockCountFile(null)
        }}
        file={stockCountFile}
        type="p"
        stockCountMode
        currentRestaurantId={currentRestaurantId}
        onConfirmStockCount={confirmStockCount}
      />

      {/* כותרת */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-2 rounded-xl bg-primary/10"><ShoppingCart className="w-5 h-5 text-primary" /></div>
          <div>
            <h1 className="font-bold text-xl">הזמנת ספקים</h1>
            <p className="text-sm text-muted-foreground">{suggestions.length > 0 ? `${suggestions.length} רכיבים להזמנה` : "המלאי תקין — אין המלצות להזמנה"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="po-coverage-days" className="text-xs text-muted-foreground whitespace-nowrap">כיסוי (ימים)</label>
          <Input id="po-coverage-days" type="number" min={1} value={coverageDays} onChange={(e) => setCoverageDays(Math.max(1, Number(e.target.value) || 1))} className="h-8 w-16 text-center" />
          <Button variant="outline" size="sm" onClick={() => loadData()} className="gap-1"><RefreshCw className="w-4 h-4" /> רענן</Button>
        </div>
      </div>

      {/* בונה ההזמנה — הלב */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* צ'יפים: לאיזה ספק חסר מה */}
          {supplierShortCounts.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">בחר ספק להזמנה:</p>
              <div className="flex flex-wrap gap-2">
                {supplierShortCounts.map(({ supplier, count, subtotal }) => {
                  const sup = restaurantSuppliers.find((s) => s.name.trim() === supplier.trim())
                  const active = selSup?.name?.trim() === supplier.trim()
                  const label = supplier === "—" ? "ללא ספק" : supplier
                  return (
                    <button
                      key={supplier}
                      type="button"
                      disabled={!sup}
                      onClick={() => sup && selectSupplier(sup)}
                      className={cn(
                        "px-3 py-2 rounded-xl border text-sm text-right transition-colors disabled:opacity-50",
                        active ? "border-primary bg-primary/10" : "hover:bg-muted",
                      )}
                    >
                      <span className="font-semibold">{label}</span>
                      <span className="block text-xs text-muted-foreground">{count} פריטים · ₪{subtotal.toFixed(0)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* בחירת ספק ידנית */}
          <div>
            <label className="text-sm font-medium mb-1 block">ספק</label>
            <Select value={selSup?.id || ""} onValueChange={(v) => selectSupplier(restaurantSuppliers.find((x) => x.id === v) || null)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="בחר ספק..." /></SelectTrigger>
              <SelectContent position="popper" className="z-[9999] w-full">
                {restaurantSuppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {restaurantSuppliers.length === 0 && <p className="text-xs text-muted-foreground mt-1">לא נמצאו ספקים. הוסף ספק במסך ספקים או שייך ספק לרכיב.</p>}
          </div>

          {selSup && (
            <>
              {/* טבלת פריטי ההזמנה */}
              {orderItems.length > 0 ? (
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-right px-3 py-2">רכיב</th>
                        <th className="text-center px-3 py-2 w-24">כמות</th>
                        <th className="text-center px-3 py-2">יחידה</th>
                        <th className="text-center px-3 py-2">מחיר יח׳</th>
                        <th className="text-center px-3 py-2">סה״כ</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {orderItems.map((item, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-3 py-2 font-medium">{item.name}</td>
                          <td className="px-3 py-2"><Input type="number" value={item.quantity} min={1} className="w-20 h-8 text-center mx-auto" onChange={(e) => setOrderItems((p) => p.map((i, j) => j === idx ? { ...i, quantity: Math.max(1, Number(e.target.value) || 1) } : i))} /></td>
                          <td className="px-3 py-2 text-center text-muted-foreground">{item.unit}</td>
                          <td className="px-3 py-2 text-center tabular-nums">₪{item.price.toFixed(2)}</td>
                          <td className="px-3 py-2 text-center tabular-nums">₪{(item.quantity * item.price).toFixed(2)}</td>
                          <td className="px-3 py-2 text-center"><button onClick={() => setOrderItems((p) => p.filter((_, j) => j !== idx))} className="text-red-500 hover:text-red-700" aria-label="הסר"><Trash2 className="w-4 h-4" /></button></td>
                        </tr>
                      ))}
                      <tr className="border-t bg-muted/30 font-bold">
                        <td colSpan={4} className="px-3 py-2">סה״כ הזמנה</td>
                        <td className="px-3 py-2 text-center text-lg tabular-nums">₪{orderTot.toFixed(2)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground border rounded-lg p-4 text-center">אין פריטים מומלצים לספק זה. הוסף רכיב ידנית למטה.</p>
              )}

              {/* הוספת רכיב */}
              {addableSuggestions.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-1 block flex items-center gap-1"><Plus className="w-4 h-4" /> הוסף רכיב</label>
                  <Select value="" onValueChange={(v) => { const ing = suggestions.find((i) => i.name === v); if (ing) addItem(ing.name, ing.unit, priceForSupplier(ing.name, selSup.name, ing.price), Math.max(1, ing.suggestedQty)) }}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="בחר רכיב להוספה..." /></SelectTrigger>
                    <SelectContent position="popper" className="z-[9999] w-full max-h-[min(70vh,24rem)]">
                      {addableSuggestions.map(({ supplier, items }) => (
                        <SelectGroup key={supplier}>
                          <SelectLabel className="text-xs font-semibold px-2 py-1.5">{supplier === "—" ? "ללא ספק" : supplier}</SelectLabel>
                          {items.map((i) => <SelectItem key={i.name} value={i.name}>{i.name} ({i.suggestedQty} {i.unit})</SelectItem>)}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* אסמכתא + הערות */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("pages.purchaseOrders.linkedInvoiceRefLabel")}</label>
                  <Input className="bg-background" value={orderLinkedInvoiceRef} onChange={(e) => setOrderLinkedInvoiceRef(e.target.value)} placeholder={t("pages.purchaseOrders.linkedInvoiceRefPlaceholder")} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">הערות</label>
                  <Input className="bg-background" value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} placeholder="הערות אופציונליות..." />
                </div>
              </div>

              {/* פעולות שליחה */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button disabled={saving || !orderItems.length} variant="outline" onClick={() => saveOrder()} className="gap-1"><Save className="w-4 h-4" /> שמור טיוטה</Button>
                <Button disabled={saving || !orderItems.length || noEmail} onClick={() => saveOrder("email")} className="gap-1 bg-blue-600 hover:bg-blue-700 text-white"><Mail className="w-4 h-4" /> שלח במייל</Button>
                <Button disabled={saving || !orderItems.length || noPhone} onClick={() => saveOrder("whatsapp")} className="gap-1 bg-green-600 hover:bg-green-700 text-white"><MessageCircle className="w-4 h-4" /> שלח ב-WhatsApp</Button>
                {saving && <span className="text-sm text-muted-foreground animate-pulse">שומר...</span>}
              </div>
              {(noPhone || noEmail) && (
                <p className="text-xs text-amber-600">
                  {noPhone && "לספק אין מספר טלפון תקין — לא ניתן לשלוח ב-WhatsApp. "}
                  {noEmail && "לספק אין כתובת מייל — לא ניתן לשלוח במייל. "}
                  ניתן לעדכן במסך «ספקים».
                </p>
              )}
            </>
          )}

          {!selSup && suggestions.length === 0 && (
            <div className="flex items-center gap-3 text-muted-foreground p-2"><Package className="w-8 h-8 opacity-50" /><p>המלאי תקין — אין המלצות להזמנה. בחר ספק ידנית כדי ליצור הזמנה.</p></div>
          )}
        </CardContent>
      </Card>

      {/* הזמנות שמורות */}
      <Section title="הזמנות שמורות" count={orders.length} icon={FileText} defaultOpen={orders.length > 0 && suggestions.length === 0}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "סה״כ הזמנות", value: String(stats.total), color: "text-primary" },
              { label: "ממתינות", value: String(stats.pending), color: "text-amber-500" },
              { label: "התקבלו", value: String(stats.delivered), color: "text-emerald-500" },
              { label: "שווי", value: "₪" + stats.totalValue.toLocaleString(), color: "text-blue-500" },
            ].map(s => (
              <div key={s.label} className="rounded-xl border p-3 text-center"><p className={"text-2xl font-bold " + s.color}>{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            ))}
          </div>
          <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input className="w-full border rounded-lg px-3 py-2 pr-10 bg-background text-sm" placeholder="חפש הזמנה..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
          <div className="space-y-3">
            {filteredOrders.length === 0 ? <div className="text-center py-8 text-muted-foreground">אין הזמנות</div>
            : filteredOrders.map(order => {
              const sc = getStatusConfig(order.status)
              return (
                <div key={order.id} className="bg-card border rounded-xl p-4">
                  <div className="flex items-start justify-between mb-1">
                    <div><span className="font-bold ml-2">{order.orderNumber}</span><span className="text-muted-foreground">{order.supplier}</span></div>
                    <Badge className={sc.color}>{sc.label}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mb-2">{order.items.length} פריטים &middot; ₪{order.total.toLocaleString()} &middot; {order.createdAt}</div>
                  <div className="mb-2">
                    <label className="text-xs text-muted-foreground block mb-0.5">{t("pages.purchaseOrders.linkedInvoiceRefLabel")}</label>
                    <Input
                      key={`${order.id}-ref-${order.linkedInvoiceRef ?? ""}`}
                      className="h-8 text-sm bg-background max-w-md"
                      defaultValue={order.linkedInvoiceRef ?? ""}
                      placeholder={t("pages.purchaseOrders.linkedInvoiceRefPlaceholder")}
                      onBlur={async (e) => {
                        const v = e.target.value.trim()
                        const prev = order.linkedInvoiceRef ?? ""
                        if (v === prev) return
                        try {
                          await updateDoc(doc(db, "purchaseOrders", order.id), { linkedInvoiceRef: v || null })
                          setOrders((prevList) => prevList.map((o) => (o.id === order.id ? { ...o, linkedInvoiceRef: v } : o)))
                          void appendRestaurantAuditLog(db, currentRestaurantId!, {
                            action: "purchase_order_invoice_link",
                            summary: `הזמנה ${order.orderNumber}: אסמכתא חשבונית עודכנה`,
                            meta: { orderId: order.id, linkedInvoiceRef: v },
                            actorUid: auth.currentUser?.uid ?? null,
                            actorEmail: auth.currentUser?.email ?? null,
                          })
                        } catch (err) {
                          console.error(err)
                          toast.error(t("pages.purchaseOrders.linkedInvoiceRefSaveError"))
                        }
                      }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <select className="text-xs border rounded px-2 py-1 bg-background" value={order.status} onChange={(e) => {
                      const next = e.target.value
                      const prev = order.status
                      if (next === prev || !currentRestaurantId) return
                      void updateDoc(doc(db, "purchaseOrders", order.id), { status: next })
                        .then(() => {
                          setOrders((p) => p.map((o) => (o.id === order.id ? { ...o, status: next } : o)))
                          void appendRestaurantAuditLog(db, currentRestaurantId, {
                            action: "purchase_order_status",
                            summary: `הזמנה ${order.orderNumber}: ${prev} → ${next}`,
                            meta: { orderId: order.id, orderNumber: order.orderNumber, from: prev, to: next },
                            actorUid: auth.currentUser?.uid ?? null,
                            actorEmail: auth.currentUser?.email ?? null,
                          })
                        })
                        .catch((err) => console.error(err))
                    }}>
                      <option value="draft">טיוטה</option>
                      <option value="sent">נשלחה</option>
                      <option value="confirmed">אושרה</option>
                      <option value="delivered">התקבלה</option>
                      <option value="cancelled">בוטלה</option>
                    </select>
                    <button onClick={() => delOrder(order.id)} className="text-xs text-red-500 border rounded px-2 py-1 hover:bg-red-50">מחק</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Section>

      {/* ספירת מלאי */}
      <Section title={t("pages.purchaseOrders.stockCountTitle")} icon={ClipboardList}>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("pages.purchaseOrders.stockCountDesc")}</p>
          <Button type="button" onClick={() => stockFileInputRef.current?.click()} className="w-full sm:w-auto">
            {t("pages.purchaseOrders.stockCountChooseFile")}
          </Button>
        </div>
      </Section>

      {/* היסטוריית העלאות */}
      <Section title="היסטוריית העלאות" count={uploads.length} icon={Package}>
        <div className="space-y-3">
          {uploads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="font-medium">אין היסטוריית העלאות</p>
              <p className="text-sm mt-1">מוצגים כאן גם קבצים ידניים וגם קבצים שנקלטו ממייל למסעדה</p>
            </div>
          ) : uploads.map(up => (
            <div key={up.id} className="bg-card border rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-2xl">📄</div>
                <div>
                  <p className="font-medium text-sm">{up.fileName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {up.supplier && <span className="ml-2">{up.source === "email" ? "שולח: " : "ספק: "}{up.supplier}</span>}
                    {up.ingredientCount > 0 && <span>{up.ingredientCount} רכיבים</span>}
                    {up.status && <span className="mr-2">סטטוס: {up.status}</span>}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium">{up.uploadedAt?.split("T")[0] || up.uploadedAt}</p>
                <p className="text-xs text-muted-foreground">{up.source === "email" ? "מייל נכנס" : "העלאה"}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

export { PurchaseOrders as OrdersPanel }
