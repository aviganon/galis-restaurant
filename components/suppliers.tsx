"use client"

import { useState, useEffect, useCallback } from "react"
import { collection, getDocs, doc, getDoc, setDoc, writeBatch, deleteDoc, addDoc } from "firebase/firestore"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { db } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Search,
  Truck,
  Package,
  Loader2,
  Plus,
  X,
  Trash2,
  Edit2,
} from "lucide-react"
import { toast } from "sonner"

interface SupplierInfo {
  name: string
  products: number
  totalValue: number
  source: "assigned" | "restaurant"
}

const isOwnerRole = (role: string, isSystemOwner?: boolean) => isSystemOwner || role === "owner"

export function Suppliers() {
  const { currentRestaurantId, userRole, isSystemOwner, refreshIngredients, restaurants } = useApp()
  const isOwner = isOwnerRole(userRole, isSystemOwner)
  const [suppliers, setSuppliers] = useState<SupplierInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  const [addSupplierOpen, setAddSupplierOpen] = useState(false)
  const [addSupplierSaving, setAddSupplierSaving] = useState(false)

  const [selectedSupplierDetail, setSelectedSupplierDetail] = useState<string | null>(null)
  const [supplierDetailName, setSupplierDetailName] = useState("")
  const [supplierDetailInfo, setSupplierDetailInfo] = useState<{ phone?: string; email?: string; contact?: string; address?: string } | null>(null)
  const [supplierDetailItems, setSupplierDetailItems] = useState<{ name: string; price: number; unit: string; waste: number; stock: number; minStock: number; sku: string }[]>([])
  const [supplierDetailLoading, setSupplierDetailLoading] = useState(false)
  const [nsmName, setNsmName] = useState("")
  const [nsmItems, setNsmItems] = useState<{ name: string; price: number; unit: string; waste: number; stock: number; minStock: number; sku: string }[]>([])
  const [nsmItemName, setNsmItemName] = useState("")
  const [nsmItemPrice, setNsmItemPrice] = useState("")
  const [nsmItemUnit, setNsmItemUnit] = useState("ק\"ג")
  const [nsmItemWaste, setNsmItemWaste] = useState("0")
  const [nsmItemStock, setNsmItemStock] = useState("0")
  const [nsmItemMinStock, setNsmItemMinStock] = useState("0")
  const [nsmItemSku, setNsmItemSku] = useState("")
  const [deletingIngredientName, setDeletingIngredientName] = useState<string | null>(null)
  const [editingIngredient, setEditingIngredient] = useState<{ name: string; price: number; unit: string; waste: number; stock: number; minStock: number; sku: string } | null>(null)
  const [editIngPrice, setEditIngPrice] = useState("")
  const [editIngUnit, setEditIngUnit] = useState("ק\"ג")
  const [editIngWaste, setEditIngWaste] = useState("0")
  const [editIngStock, setEditIngStock] = useState("0")
  const [editIngMinStock, setEditIngMinStock] = useState("0")
  const [editIngSku, setEditIngSku] = useState("")
  const [editIngSaving, setEditIngSaving] = useState(false)
  const [deleteSupplierDialogOpen, setDeleteSupplierDialogOpen] = useState(false)
  const [deletingSupplierName, setDeletingSupplierName] = useState<string | null>(null)

  const handleDeleteSupplierFromRestaurant = async () => {
    const name = supplierDetailName
    if (!name || !currentRestaurantId || name === "ללא ספק") return
    setDeletingSupplierName(name)
    try {
      const supplierInfo = suppliers.find((s) => s.name === name)
      const isAssigned = supplierInfo?.source === "assigned"

      const restIngSnap = await getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients"))
      const toUpdate: string[] = []
      restIngSnap.forEach((d) => {
        if ((d.data().supplier as string) === name) toUpdate.push(d.id)
      })
      if (toUpdate.length > 0) {
        const now = new Date().toISOString()
        for (let i = 0; i < toUpdate.length; i += 500) {
          const batch = writeBatch(db)
          toUpdate.slice(i, i + 500).forEach((ingId) => {
            batch.update(doc(db, "restaurants", currentRestaurantId, "ingredients", ingId), { supplier: "", lastUpdated: now })
          })
          await batch.commit()
        }
      }

      if (isAssigned) {
        const asRef = doc(db, "restaurants", currentRestaurantId, "appState", "assignedSuppliers")
        const asSnap = await getDoc(asRef)
        const current: string[] = Array.isArray(asSnap.data()?.list) ? asSnap.data()!.list : []
        const nextList = current.filter((s) => s !== name)
        await setDoc(asRef, { list: nextList }, { merge: true })
        try {
          const restName = restaurants?.find((r) => r.id === currentRestaurantId)?.name || currentRestaurantId
          await addDoc(collection(db, "ownerNotifications"), {
            type: "supplier_removed",
            restaurantId: currentRestaurantId,
            restaurantName: restName,
            supplierName: name,
            read: false,
            createdAt: new Date().toISOString(),
          })
        } catch (_) {}
      }

      toast.success(`ספק "${name}" הוסר — הרכיבים נשארו עם ללא ספק וניתן לשייך להם ספק`)
      setDeleteSupplierDialogOpen(false)
      setSelectedSupplierDetail(null)
      loadSuppliers()
    } catch (e) {
      toast.error((e as Error)?.message || "שגיאה במחיקה")
    } finally {
      setDeletingSupplierName(null)
    }
  }

  const handleDeleteIngredientFromSupplier = async (ingredientName: string) => {
    if (!currentRestaurantId) return
    setDeletingIngredientName(ingredientName)
    try {
      await deleteDoc(doc(db, "restaurants", currentRestaurantId, "ingredients", ingredientName))
      toast.success(`רכיב "${ingredientName}" נמחק`)
      setSupplierDetailItems((prev) => prev.filter((i) => i.name !== ingredientName))
      loadSuppliers()
    } catch (e) {
      toast.error((e as Error)?.message || "שגיאה במחיקה")
    } finally {
      setDeletingIngredientName(null)
    }
  }

  const openEditIngredient = (item: { name: string; price: number; unit: string; waste: number; stock: number; minStock: number; sku: string }) => {
    setEditingIngredient(item)
    setEditIngPrice(String(item.price))
    setEditIngUnit(item.unit)
    setEditIngWaste(String(item.waste))
    setEditIngStock(String(item.stock))
    setEditIngMinStock(String(item.minStock))
    setEditIngSku(item.sku || "")
  }

  const handleSaveEditIngredient = async () => {
    if (!editingIngredient || !currentRestaurantId || !supplierDetailName) return
    setEditIngSaving(true)
    try {
      const price = parseFloat(String(editIngPrice)) || 0
      const waste = parseFloat(String(editIngWaste)) || 0
      const stock = parseFloat(String(editIngStock)) || 0
      const minStock = parseFloat(String(editIngMinStock)) || 0
      await setDoc(
        doc(db, "restaurants", currentRestaurantId, "ingredients", editingIngredient.name),
        {
          price,
          unit: editIngUnit,
          waste,
          stock,
          minStock,
          sku: editIngSku.trim() || "",
          supplier: supplierDetailName,
          lastUpdated: new Date().toISOString(),
        },
        { merge: true }
      )
      toast.success(`רכיב "${editingIngredient.name}" עודכן`)
      setSupplierDetailItems((prev) =>
        prev.map((i) =>
          i.name === editingIngredient.name
            ? { ...i, price, unit: editIngUnit, waste, stock, minStock, sku: editIngSku.trim() }
            : i
        )
      )
      setEditingIngredient(null)
      loadSuppliers()
      refreshIngredients?.()
    } catch (e) {
      toast.error((e as Error)?.message || "שגיאה בעדכון")
    } finally {
      setEditIngSaving(false)
    }
  }

  const loadSuppliers = useCallback(async () => {
    if (!currentRestaurantId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [restSnap, asDoc, globalSnap] = await Promise.all([
        getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients")),
        getDoc(doc(db, "restaurants", currentRestaurantId, "appState", "assignedSuppliers")),
        getDocs(collection(db, "ingredients")),
      ])
      const assignedList: string[] = Array.isArray(asDoc.data()?.list) ? asDoc.data()!.list : []
      const bySupplier = new Map<string, { products: number; totalValue: number; source: "assigned" | "restaurant" }>()
      const seenIds = new Set<string>()
      restSnap.forEach((d) => {
        seenIds.add(d.id)
        const data = d.data()
        const sup = (data.supplier as string) || "ללא ספק"
        const price = typeof data.price === "number" ? data.price : 0
        const stock = typeof data.stock === "number" ? data.stock : 0
        const existing = bySupplier.get(sup) || { products: 0, totalValue: 0, source: "restaurant" as const }
        const src: "assigned" | "restaurant" = assignedList.includes(sup) ? "assigned" : "restaurant"
        bySupplier.set(sup, {
          products: existing.products + 1,
          totalValue: existing.totalValue + price * stock,
          source: existing.source === "assigned" ? "assigned" : src,
        })
      })
      globalSnap.forEach((d) => {
        if (seenIds.has(d.id)) return
        const data = d.data()
        const sup = (data.supplier as string) || ""
        if (!isOwner && sup && !assignedList.includes(sup)) return
        const supKey = sup || "ללא ספק"
        const price = typeof data.price === "number" ? data.price : 0
        const stock = typeof data.stock === "number" ? data.stock : 0
        const existing = bySupplier.get(supKey) || { products: 0, totalValue: 0, source: "assigned" as const }
        bySupplier.set(supKey, {
          products: existing.products + 1,
          totalValue: existing.totalValue + price * stock,
          source: assignedList.includes(sup) ? "assigned" : existing.source,
        })
      })
      setSuppliers(
        Array.from(bySupplier.entries()).map(([name, v]) => ({
          name,
          products: v.products,
          totalValue: v.totalValue,
          source: v.source,
        }))
      )
    } catch (e) {
      console.error("load suppliers:", e)
    } finally {
      setLoading(false)
    }
  }, [currentRestaurantId, isOwner])

  useEffect(() => {
    loadSuppliers()
  }, [loadSuppliers])

  const loadSupplierDetail = useCallback(async (supplierName: string) => {
    if (supplierName === "ללא ספק" || !currentRestaurantId) return
    setSupplierDetailName(supplierName)
    setSupplierDetailLoading(true)
    setSupplierDetailInfo(null)
    setSupplierDetailItems([])
    try {
      const supplierId = supplierName.replace(/\//g, "_").trim()
      const [supDoc, restIngSnap, globalIngSnap] = await Promise.all([
        getDoc(doc(db, "suppliers", supplierId)),
        getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients")),
        getDocs(collection(db, "ingredients")),
      ])
      const supData = supDoc.data()
      if (supData) {
        setSupplierDetailInfo({
          phone: supData.phone ?? undefined,
          email: supData.email ?? undefined,
          contact: supData.contact ?? undefined,
          address: supData.address ?? undefined,
        })
      }
      const items: { name: string; price: number; unit: string; waste: number; stock: number; minStock: number; sku: string }[] = []
      const addIng = (d: { id: string; data: () => Record<string, unknown> }) => {
        const data = d.data()
        if ((data.supplier as string) === supplierName) {
          items.push({
            name: d.id,
            price: typeof data.price === "number" ? data.price : 0,
            unit: (data.unit as string) || "ק\"ג",
            waste: typeof data.waste === "number" ? data.waste : 0,
            stock: typeof data.stock === "number" ? data.stock : 0,
            minStock: typeof data.minStock === "number" ? data.minStock : 0,
            sku: (data.sku as string) || "",
          })
        }
      }
      restIngSnap.forEach(addIng)
      globalIngSnap.forEach((d) => {
        if (!items.some((i) => i.name === d.id)) addIng(d)
      })
      setSupplierDetailItems(items)
    } catch (e) {
      console.error("load supplier detail:", e)
      toast.error("שגיאה בטעינת פרטי הספק")
    } finally {
      setSupplierDetailLoading(false)
    }
  }, [currentRestaurantId])

  useEffect(() => {
    if (selectedSupplierDetail && selectedSupplierDetail !== "ללא ספק") {
      loadSupplierDetail(selectedSupplierDetail)
    } else {
      setSupplierDetailInfo(null)
      setSupplierDetailItems([])
      setSupplierDetailName("")
    }
  }, [selectedSupplierDetail, loadSupplierDetail])

  const filteredSuppliers = (suppliers || []).filter(
    (s) => (s?.name ?? "").includes(searchQuery)
  )

  const addNsmItem = () => {
    const name = nsmItemName.trim()
    const price = parseFloat(String(nsmItemPrice)) || 0
    const waste = parseFloat(String(nsmItemWaste)) || 0
    const stock = parseFloat(String(nsmItemStock)) || 0
    const minStock = parseFloat(String(nsmItemMinStock)) || 0
    if (!name) {
      toast.error("הזן שם רכיב")
      return
    }
    setNsmItems((prev) => [...prev.filter((i) => i.name !== name), { name, price, unit: nsmItemUnit, waste, stock, minStock, sku: nsmItemSku.trim() }])
    setNsmItemName("")
    setNsmItemPrice("")
    setNsmItemUnit("ק\"ג")
    setNsmItemWaste("0")
    setNsmItemStock("0")
    setNsmItemMinStock("0")
    setNsmItemSku("")
  }

  const removeNsmItem = (name: string) => {
    setNsmItems((prev) => prev.filter((i) => i.name !== name))
  }

  const resetAddSupplierModal = () => {
    setNsmName("")
    setNsmItems([])
    setNsmItemName("")
    setNsmItemPrice("")
    setNsmItemUnit("ק\"ג")
    setNsmItemWaste("0")
    setNsmItemStock("0")
    setNsmItemMinStock("0")
    setNsmItemSku("")
  }

  const handleSaveRestaurantSupplier = async () => {
    const supName = nsmName.trim()
    if (!supName) {
      toast.error("הזן שם ספק")
      return
    }
    if (nsmItems.length === 0) {
      toast.error("הוסף לפחות רכיב אחד")
      return
    }
    if (!currentRestaurantId) return
    setAddSupplierSaving(true)
    try {
      const batch = writeBatch(db)
      const now = new Date().toISOString()
      nsmItems.forEach((item) => {
        batch.set(doc(db, "restaurants", currentRestaurantId, "ingredients", item.name), {
          price: item.price,
          unit: item.unit,
          waste: item.waste ?? 0,
          stock: item.stock ?? 0,
          minStock: item.minStock ?? 0,
          sku: item.sku ?? "",
          supplier: supName,
          lastUpdated: now,
        }, { merge: true })
      })
      await batch.commit()
      toast.success(`ספק ${supName} נוסף בהצלחה`)
      setAddSupplierOpen(false)
      resetAddSupplierModal()
      loadSuppliers()
      refreshIngredients?.()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAddSupplierSaving(false)
    }
  }

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
        <h1 className="text-2xl font-bold mb-1">ספקים</h1>
        <p className="text-muted-foreground">בחר מסעדה</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1">ספקים</h1>
          <p className="text-muted-foreground">ספקים לפי רכיבים במערכת</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setAddSupplierOpen(true)}>
            <Plus className="w-4 h-4 ml-1" />
            ספק חדש
          </Button>
          <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="חפש ספק..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10"
          />
          </div>
        </div>
      </div>

      {filteredSuppliers.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            אין ספקים. ספקים מופיעים אוטומטית כאשר מוסיפים רכיבים עם שדה ספק.
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">לחץ על ספק כדי לראות את הפרטים והרכיבים שלו</p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
            {filteredSuppliers.map((supplier) => (
              <Card
                key={supplier.name}
                className={cn(
                  "border-0 shadow-sm cursor-pointer transition-colors",
                  selectedSupplierDetail === supplier.name ? "ring-2 ring-primary bg-muted/50" : "hover:bg-muted/50"
                )}
                onClick={() => supplier.name !== "ללא ספק" && setSelectedSupplierDetail(selectedSupplierDetail === supplier.name ? null : supplier.name)}
              >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Truck className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{supplier.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Package className="w-3 h-3" />
                    {supplier.products} רכיבים
                    {supplier.source === "assigned" && (
                      <Badge variant="outline" className="mr-1 text-xs font-normal">שויך</Badge>
                    )}
                    {supplier.source === "restaurant" && supplier.name !== "ללא ספק" && (
                      <Badge variant="secondary" className="mr-1 text-xs font-normal">של המסעדה</Badge>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                    ₪{supplier.totalValue.toLocaleString()}
                  </Badge>
                  <span className="text-muted-foreground">›</span>
                </div>
              </CardContent>
            </Card>
          ))}
          </div>
          {selectedSupplierDetail && selectedSupplierDetail !== "ללא ספק" && (
            <div className="space-y-4 p-5 rounded-xl border bg-muted/30">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h3 className="text-lg font-semibold">{supplierDetailName || selectedSupplierDetail}</h3>
                {isOwner && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteSupplierDialogOpen(true)}
                  >
                    <Trash2 className="w-4 h-4 ml-1" />
                    מחק ספק
                  </Button>
                )}
              </div>
              {supplierDetailLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {supplierDetailInfo && (supplierDetailInfo.phone || supplierDetailInfo.email || supplierDetailInfo.contact || supplierDetailInfo.address) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                      {supplierDetailInfo.phone && (
                        <div>
                          <p className="text-muted-foreground mb-0.5">טלפון</p>
                          <p className="font-medium">{supplierDetailInfo.phone}</p>
                        </div>
                      )}
                      {supplierDetailInfo.email && (
                        <div>
                          <p className="text-muted-foreground mb-0.5">אימייל</p>
                          <p className="font-medium">{supplierDetailInfo.email}</p>
                        </div>
                      )}
                      {supplierDetailInfo.contact && (
                        <div>
                          <p className="text-muted-foreground mb-0.5">איש קשר</p>
                          <p className="font-medium">{supplierDetailInfo.contact}</p>
                        </div>
                      )}
                      {supplierDetailInfo.address && (
                        <div>
                          <p className="text-muted-foreground mb-0.5">כתובת</p>
                          <p className="font-medium">{supplierDetailInfo.address}</p>
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium mb-2">רכיבים ({(supplierDetailItems || []).length})</p>
                    {(supplierDetailItems || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">אין רכיבים להצגה</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-right">רכיב</TableHead>
                              <TableHead className="text-right">מחיר</TableHead>
                              <TableHead className="text-right">יחידה</TableHead>
                              <TableHead className="text-right">פחת %</TableHead>
                              <TableHead className="text-right">מלאי</TableHead>
                              <TableHead className="text-right">מינ׳</TableHead>
                              <TableHead className="text-right">מק״ט</TableHead>
                              <TableHead className="text-right w-20">פעולות</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(supplierDetailItems || []).map((i) => (
                              <TableRow key={i.name}>
                                <TableCell className="font-medium text-right">{i.name}</TableCell>
                                <TableCell className="text-right">₪{i.price.toFixed(2)}</TableCell>
                                <TableCell className="text-right">{i.unit}</TableCell>
                                <TableCell className="text-right">{i.waste}%</TableCell>
                                <TableCell className="text-right">{i.stock}</TableCell>
                                <TableCell className="text-right">{i.minStock}</TableCell>
                                <TableCell className="text-right">{i.sku || "—"}</TableCell>
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                                        onClick={(e) => { e.stopPropagation(); openEditIngredient(i) }}
                                        title="ערוך"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </Button>
                                      {isOwner && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                          onClick={(e) => { e.stopPropagation(); handleDeleteIngredientFromSupplier(i.name) }}
                                          disabled={deletingIngredientName === i.name}
                                          title="מחק"
                                        >
                                          {deletingIngredientName === i.name ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                        </Button>
                                      )}
                                    </div>
                                  </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      <AlertDialog open={deleteSupplierDialogOpen} onOpenChange={(o) => { setDeleteSupplierDialogOpen(o) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>הסרת ספק מהמסעדה</AlertDialogTitle>
            <AlertDialogDescription>
              האם להסיר את הספק &quot;{supplierDetailName}&quot; מהמסעדה? כל הרכיבים של ספק זה יימחקו. {suppliers.find((s) => s.name === supplierDetailName)?.source === "assigned" ? "הספק יוסר גם מרשימת הספקים המשויכים." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingSupplierName}>ביטול</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDeleteSupplierFromRestaurant}
              disabled={!!deletingSupplierName}
            >
              {deletingSupplierName ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Trash2 className="w-4 h-4 ml-1" />}
              הסר ספק
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editingIngredient} onOpenChange={(o) => { if (!o) setEditingIngredient(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>עריכת רכיב</DialogTitle>
            <p className="text-sm text-muted-foreground">{editingIngredient?.name}</p>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs">מחיר ₪</Label>
              <Input value={editIngPrice} onChange={(e) => setEditIngPrice(e.target.value)} type="number" placeholder="0" min={0} step={0.01} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">יחידה</Label>
              <Select value={editIngUnit} onValueChange={setEditIngUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="גרם">גרם</SelectItem>
                  <SelectItem value={'ק"ג'}>ק&quot;ג</SelectItem>
                  <SelectItem value="מל">מל</SelectItem>
                  <SelectItem value="ליטר">ליטר</SelectItem>
                  <SelectItem value="יחידה">יחידה</SelectItem>
                  <SelectItem value="חבילה">חבילה</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">פחת %</Label>
              <Input value={editIngWaste} onChange={(e) => setEditIngWaste(e.target.value)} type="number" placeholder="0" min={0} step={0.1} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">מלאי</Label>
              <Input value={editIngStock} onChange={(e) => setEditIngStock(e.target.value)} type="number" placeholder="0" min={0} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">מינ׳ מלאי</Label>
              <Input value={editIngMinStock} onChange={(e) => setEditIngMinStock(e.target.value)} type="number" placeholder="0" min={0} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">מק״ט</Label>
              <Input value={editIngSku} onChange={(e) => setEditIngSku(e.target.value)} placeholder="קוד מוצר" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingIngredient(null)}>ביטול</Button>
            <Button onClick={handleSaveEditIngredient} disabled={editIngSaving}>
              {editIngSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
              שמור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addSupplierOpen} onOpenChange={(o) => { setAddSupplierOpen(o); if (!o) resetAddSupplierModal() }}>
        <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90dvh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">🏭</span>
              ספק חדש למסעדה
            </DialogTitle>
            <p className="text-sm text-muted-foreground">הוסף ספק עם רכיבים — יישמר במסעדה שלך בלבד</p>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 space-y-4 mt-4">
            <div className="space-y-2">
              <Label>שם הספק *</Label>
              <Input value={nsmName} onChange={(e) => setNsmName(e.target.value)} placeholder="תנובה, אסם..." className="w-full" />
            </div>
            <div className="space-y-2">
              <Label>רכיבים *</Label>
              <div className="max-h-40 sm:max-h-52 overflow-y-auto border rounded-lg p-2 space-y-2">
                {nsmItems.map((i) => (
                  <div key={i.name} className="flex items-center justify-between gap-2 py-1 px-2 bg-muted rounded">
                    <span className="truncate">
                      {i.name} — ₪{i.price.toFixed(2)} / {i.unit}
                      {i.waste ? ` | פחת ${i.waste}%` : ""}
                      {i.stock != null ? ` | מלאי ${i.stock}` : ""}
                      {i.minStock != null ? ` | מינ׳ ${i.minStock}` : ""}
                      {i.sku ? ` | מק״ט ${i.sku}` : ""}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => removeNsmItem(i.name)} className="text-destructive h-8 w-8 p-0 shrink-0">
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                {nsmItems.length === 0 && <p className="text-sm text-muted-foreground py-2">הוסף רכיבים</p>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 items-end">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">שם רכיב *</Label>
                  <Input value={nsmItemName} onChange={(e) => setNsmItemName(e.target.value)} placeholder="שם הרכיב" className="w-full" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNsmItem())} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">מחיר ₪</Label>
                  <Input value={nsmItemPrice} onChange={(e) => setNsmItemPrice(e.target.value)} type="number" placeholder="0" min={0} step={0.01} className="w-full" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">יחידה</Label>
                  <Select value={nsmItemUnit} onValueChange={setNsmItemUnit}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="גרם">גרם</SelectItem>
                      <SelectItem value={'ק"ג'}>ק&quot;ג</SelectItem>
                      <SelectItem value="מל">מל</SelectItem>
                      <SelectItem value="ליטר">ליטר</SelectItem>
                      <SelectItem value="יחידה">יחידה</SelectItem>
                      <SelectItem value="חבילה">חבילה</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">מק״ט</Label>
                  <Input value={nsmItemSku} onChange={(e) => setNsmItemSku(e.target.value)} placeholder="קוד מוצר" className="w-full" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">פחת %</Label>
                  <Input value={nsmItemWaste} onChange={(e) => setNsmItemWaste(e.target.value)} type="number" placeholder="0" min={0} step={0.1} className="w-full" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">מלאי</Label>
                  <Input value={nsmItemStock} onChange={(e) => setNsmItemStock(e.target.value)} type="number" placeholder="0" min={0} step={0.01} className="w-full" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">מינ׳ מלאי</Label>
                  <Input value={nsmItemMinStock} onChange={(e) => setNsmItemMinStock(e.target.value)} type="number" placeholder="0" min={0} step={0.01} className="w-full" />
                </div>
                <div>
                  <Button size="sm" onClick={addNsmItem} className="w-full">➕ הוסף</Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t pt-4 mt-4">
            <Button variant="outline" onClick={() => setAddSupplierOpen(false)}>ביטול</Button>
            <Button onClick={handleSaveRestaurantSupplier} disabled={addSupplierSaving}>
              {addSupplierSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
              💾 שמור ספק
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
