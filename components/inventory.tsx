"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { collection, getDocs, doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { loadGlobalPriceSubdocsMap, pickGlobalIngredientRowFromAssigned } from "@/lib/ingredient-assigned-price"
import { useApp } from "@/contexts/app-context"
import { motion } from "framer-motion"
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
  Search,
  Package,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Truck,
  Pencil,
  Check,
  X,
} from "lucide-react"
import { useTranslations } from "@/lib/use-translations"

interface InventoryItem {
  id: string
  name: string
  currentStock: number
  unit: string
  minStock: number
  maxStock: number
  supplier: string
}

const isOwnerRole = (role: string, isSystemOwner?: boolean) => isSystemOwner || role === "owner"

export function Inventory() {
  const t = useTranslations()
  const { currentRestaurantId, userRole, isSystemOwner } = useApp()
  const isOwner = isOwnerRole(userRole, isSystemOwner)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [stockFilter, setStockFilter] = useState("all")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStock, setEditStock] = useState("")
  const [editMin, setEditMin] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    if (!currentRestaurantId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const load = async () => {
      try {
        const [restSnap, asDoc] = await Promise.all([
          getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients")),
          getDoc(doc(db, "restaurants", currentRestaurantId, "appState", "assignedSuppliers")),
        ])
        const assignedList: string[] = Array.isArray(asDoc.data()?.list) ? asDoc.data()!.list : []
        // טוענים קטלוג גלובלי רק אם יש ספקים משויכים — מסעדה חדשה לא תראה רכיבים גלובליים
        const globalSnap = isOwner && assignedList.length > 0 ? await getDocs(collection(db, "ingredients")) : null
        const subPricesByIngredient =
          isOwner && assignedList.length > 0 ? await loadGlobalPriceSubdocsMap(db) : new Map()
        const byId = new Map<string, InventoryItem>()
        restSnap.forEach((d) => {
          const data = d.data()
          byId.set(d.id, {
            id: d.id,
            name: d.id,
            currentStock: typeof data.stock === "number" ? data.stock : 0,
            unit: (data.unit as string) || "ק\"ג",
            minStock: typeof data.minStock === "number" ? data.minStock : 0,
            maxStock: typeof data.maxStock === "number" ? data.maxStock : 100,
            supplier: (data.supplier as string) || "",
          })
        })
        // מסעדה חדשה בלי ספקים משויכים — לא מוצגים רכיבים מהקטלוג הגלובלי
        globalSnap?.forEach((d) => {
          if (!byId.has(d.id) && assignedList.length > 0) {
            const data = d.data()
            const picked = pickGlobalIngredientRowFromAssigned(assignedList, data, subPricesByIngredient.get(d.id))
            if (!picked) return
            byId.set(d.id, {
              id: d.id,
              name: d.id,
              currentStock: typeof data.stock === "number" ? data.stock : 0,
              unit: picked.unit || (data.unit as string) || "ק\"ג",
              minStock: typeof data.minStock === "number" ? data.minStock : 0,
              maxStock: typeof data.maxStock === "number" ? data.maxStock : 100,
              supplier: picked.supplier,
            })
          }
        })
        setItems(Array.from(byId.values()))
      } catch (e) {
        console.error("load inventory:", e)
        toast.error("שגיאה בטעינת המלאי")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentRestaurantId, isOwner])

  const getStockStatus = (item: InventoryItem) => {
    if (item.currentStock === 0) return { status: t("pages.ingredients.stockOut"), color: "bg-red-500", textColor: "text-red-600", icon: XCircle }
    if (item.minStock > 0 && item.currentStock < item.minStock) return { status: t("pages.ingredients.stockLow"), color: "bg-amber-500", textColor: "text-amber-600", icon: AlertTriangle }
    if (item.maxStock > 0 && item.currentStock >= item.maxStock * 0.8) return { status: t("pages.inventory.stockFull"), color: "bg-emerald-500", textColor: "text-emerald-600", icon: CheckCircle2 }
    return { status: t("pages.ingredients.stockOk"), color: "bg-blue-500", textColor: "text-blue-600", icon: CheckCircle2 }
  }

  const startEdit = (item: InventoryItem) => {
    setEditingId(item.id)
    setEditStock(String(item.currentStock))
    setEditMin(String(item.minStock))
  }
  const cancelEdit = () => setEditingId(null)
  const saveEdit = async (item: InventoryItem) => {
    if (!currentRestaurantId) return
    setSavingEdit(true)
    try {
      const stock = parseFloat(editStock) || 0
      const minStock = parseFloat(editMin) || 0
      await setDoc(
        doc(db, "restaurants", currentRestaurantId, "ingredients", item.id),
        { stock, minStock, lastUpdated: new Date().toISOString() },
        { merge: true },
      )
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, currentStock: stock, minStock } : i)))
      setEditingId(null)
      toast.success("המלאי עודכן")
    } catch (e) {
      console.error(e)
      toast.error("שגיאה בשמירה")
    } finally {
      setSavingEdit(false)
    }
  }

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.includes(searchTerm)
    const matchesStock =
      stockFilter === "all" ||
      (stockFilter === "low" && item.minStock > 0 && item.currentStock < item.minStock && item.currentStock > 0) ||
      (stockFilter === "zero" && item.currentStock === 0) ||
      (stockFilter === "ok" && item.currentStock >= item.minStock)
    return matchesSearch && matchesStock
  })

  // קיבוץ לפי ספק
  const groups = (() => {
    const m = new Map<string, InventoryItem[]>()
    for (const it of filteredItems) {
      const k = (it.supplier || "").trim() || "ללא ספק"
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(it)
    }
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "he"))
      .map(([supplier, list]) => ({ supplier, list: list.sort((a, b) => a.name.localeCompare(b.name, "he")) }))
  })()

  const stats = {
    totalItems: items.length,
    lowStock: items.filter((i) => i.minStock > 0 && i.currentStock < i.minStock && i.currentStock > 0).length,
    outOfStock: items.filter((i) => i.currentStock === 0).length,
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
        <h1 className="text-2xl font-bold mb-1">{t("nav.inventory")}</h1>
        <p className="text-muted-foreground">{t("pages.inventory.selectRestaurant")}</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10"><Package className="w-5 h-5 text-primary" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("pages.inventory.itemsInStock")}</p>
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
                <div className="p-2 rounded-xl bg-amber-500/10"><AlertTriangle className="w-5 h-5 text-amber-500" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("pages.ingredients.lowStockLabel")}</p>
                  <p className="text-2xl font-bold">{stats.lowStock}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-red-500/10"><XCircle className="w-5 h-5 text-red-500" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("pages.ingredients.outOfStockLabel")}</p>
                  <p className="text-2xl font-bold">{stats.outOfStock}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="font-bold text-lg">{t("pages.inventory.manageInventory")}</span>
            <Badge variant="secondary">{filteredItems.length} {t("pages.inventory.itemsCount")}</Badge>
          </div>
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder={t("pages.inventory.searchItem")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pr-10" />
            </div>
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder={t("pages.ingredients.stockStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pages.ingredients.allStock")}</SelectItem>
                <SelectItem value="low">{t("pages.ingredients.lowStockLabel")}</SelectItem>
                <SelectItem value="zero">{t("pages.ingredients.stockOut")}</SelectItem>
                <SelectItem value="ok">{t("pages.ingredients.stockOk")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {filteredItems.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t("pages.inventory.noItemsMessage")}</CardContent></Card>
      ) : (
        <div className="space-y-5">
          {groups.map(({ supplier, list }) => (
            <Card key={supplier} className="overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/40">
                <Truck className="w-4 h-4 text-primary shrink-0" />
                <h3 className="font-bold truncate">{supplier}</h3>
                <Badge variant="secondary">{list.length}</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-muted-foreground">
                    <tr>
                      <th className="text-right px-4 py-2 font-semibold">{t("pages.ingredients.ingredient")}</th>
                      <th className="text-center px-3 py-2 font-semibold">{t("pages.inventory.quantityInStock")}</th>
                      <th className="text-center px-3 py-2 font-semibold">{t("pages.ingredients.minStockLabel")}</th>
                      <th className="text-center px-3 py-2 font-semibold">{t("pages.ingredients.unit")}</th>
                      <th className="text-center px-3 py-2 font-semibold">{t("pages.ingredients.stockStatus")}</th>
                      <th className="w-20 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((item) => {
                      const st = getStockStatus(item)
                      const StatusIcon = st.icon
                      const editing = editingId === item.id
                      return (
                        <tr key={item.id} className="border-t hover:bg-muted/20">
                          <td className="px-4 py-2 font-medium">{item.name}</td>
                          <td className="px-3 py-2 text-center">
                            {editing ? (
                              <Input type="number" value={editStock} min={0} onChange={(e) => setEditStock(e.target.value)} className="h-8 w-20 text-center mx-auto" />
                            ) : (
                              <span className={`font-semibold tabular-nums ${st.textColor}`}>{item.currentStock}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums">
                            {editing ? (
                              <Input type="number" value={editMin} min={0} onChange={(e) => setEditMin(e.target.value)} className="h-8 w-20 text-center mx-auto" />
                            ) : (
                              item.minStock
                            )}
                          </td>
                          <td className="px-3 py-2 text-center text-muted-foreground">{item.unit}</td>
                          <td className="px-3 py-2 text-center">
                            <Badge className={`${st.color} text-white`}><StatusIcon className="w-3 h-3 ml-1" />{st.status}</Badge>
                          </td>
                          <td className="px-3 py-2">
                            {editing ? (
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => saveEdit(item)} disabled={savingEdit} className="p-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-50" aria-label="שמור">
                                  {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                </button>
                                <button onClick={cancelEdit} className="p-1 text-muted-foreground hover:text-foreground" aria-label="ביטול"><X className="w-4 h-4" /></button>
                              </div>
                            ) : (
                              <button onClick={() => startEdit(item)} className="mx-auto block p-1 text-muted-foreground hover:text-primary" aria-label="ערוך"><Pencil className="w-4 h-4" /></button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
