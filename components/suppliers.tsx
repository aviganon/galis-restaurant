"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { collection, getDocs, doc, getDoc, setDoc, writeBatch, deleteDoc, addDoc, collectionGroup, query, where } from "firebase/firestore"
import { syncSupplierIngredientsToAssignedRestaurants } from "@/lib/sync-supplier-ingredients"
import { supplierFirestoreDocId } from "@/lib/supplier-firestore-id"
import { upsertRestaurantSupplierPrice } from "@/lib/restaurant-supplier-prices"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { db, storage } from "@/lib/firebase"
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage"
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
  Upload as UploadIcon,
  ShoppingCart,
  X as XIcon,
} from "lucide-react"
import { OrdersPanel } from "@/components/purchase-orders"
import { toast } from "sonner"
import { useTranslations } from "@/lib/use-translations"
interface InvoiceItem {
  name: string
  price: number
  unit: string
  sku?: string
  qty?: number
}

interface SupplierInfo {
  name: string
  products: number
  totalValue: number
  source: "assigned" | "restaurant"
  ingredientsForChips?: { name: string; stock: number; minStock: number; unit: string; price: number }[]
  imageUrl?: string
}

const isOwnerRole = (role: string, isSystemOwner?: boolean) => isSystemOwner || role === "owner"

export default function Suppliers() {
  const t = useTranslations()
  const { currentRestaurantId, userRole, isSystemOwner, refreshIngredients, restaurants, setCurrentPage } = useApp()
  const navToInventory = () => setCurrentPage?.("inventory")
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
  const [stockChipFilter, setStockChipFilter] = useState<"all"|"ok"|"low"|"zero">("all")
  const [supplierIngFilter, setSupplierIngFilter] = useState("")
  const [reorderPanelOpen, setReorderPanelOpen] = useState(false)
  const [globalReorderOpen, setGlobalReorderOpen] = useState(false)
  const [showPurchaseOrdersPanel, setShowPurchaseOrdersPanel] = useState(false)
  const [editSupplierOpen, setEditSupplierOpen] = useState(false)
  const [editPhone, setEditPhone] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editContact, setEditContact] = useState("")
  const [editAddress, setEditAddress] = useState("")
  const [editImageFile, setEditImageFile] = useState<File|null>(null)
  const [editImageUrl, setEditImageUrl] = useState<string|null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [uploadingImg, setUploadingImg] = useState(false)
  const editImgRef = useRef<HTMLInputElement>(null)
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
  const [priceCompareOpen, setPriceCompareOpen] = useState(false)
  const [priceCompareIngredient, setPriceCompareIngredient] = useState("")
  const [priceCompareRows, setPriceCompareRows] = useState<Array<{ supplier: string; price: number; unit: string; lastUpdated?: string }>>([])
  const [priceCompareLoading, setPriceCompareLoading] = useState(false)

  const [showInvoiceUploadArea, setShowInvoiceUploadArea] = useState(false)
  const [InvoiceUploadComponent, setInvoiceUploadComponent] = useState<React.ComponentType<{
    restaurantName?: string
    onConfirm: (items: InvoiceItem[], supName: string, saveToGlobal?: boolean) => Promise<void>
    onClose: () => void
    onSuccess?: () => void
  }> | null>(null)

  useEffect(() => {
    if (showInvoiceUploadArea && !InvoiceUploadComponent) {
      import("@/components/suppliers-invoice-upload").then((m) => setInvoiceUploadComponent(() => m.SuppliersInvoiceUpload))
    }
  }, [showInvoiceUploadArea, InvoiceUploadComponent])

  const loadSuppliers = useCallback(async () => {
    if (!currentRestaurantId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [restSnap, asDoc, globalSnap, restPricesSnap] = await Promise.all([
        getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients")),
        getDoc(doc(db, "restaurants", currentRestaurantId, "appState", "assignedSuppliers")),
        getDocs(collection(db, "ingredients")),
        getDocs(query(collectionGroup(db, "prices"), where("restaurantId", "==", currentRestaurantId))),
      ])
      const assignedList: string[] = Array.isArray(asDoc.data()?.list) ? asDoc.data()!.list : []
      /** התאמה לפי שם (לא ID) — נירמול רווחים כדי שיתאים ל-admin ול-ingredients */
      const isAssignedSupplierName = (supplierField: string) => {
        const s = (supplierField || "").trim()
        if (!s || s === "ללא ספק") return false
        return assignedList.some((a) => (a || "").trim() === s)
      }
      const bySupplier = new Map<string, { products: number; totalValue: number; source: "assigned" | "restaurant" }>()
      const chipsBySupplier = new Map<string, { name: string; stock: number; minStock: number; unit: string; price: number }[]>()
      const seenIds = new Set<string>()
      restSnap.forEach((d) => {
        seenIds.add(d.id)
        const data = d.data()
        const sup = (data.supplier as string) || "ללא ספק"
        const price = typeof data.price === "number" ? data.price : 0
        const stock = typeof data.stock === "number" ? data.stock : 0
        const existing = bySupplier.get(sup) || { products: 0, totalValue: 0, source: "restaurant" as const }
        const src: "assigned" | "restaurant" = isAssignedSupplierName(sup) ? "assigned" : "restaurant"
        bySupplier.set(sup, {
          products: existing.products + 1,
          totalValue: existing.totalValue + price * stock,
          source: existing.source === "assigned" ? "assigned" : src,
        })
        const chips0 = chipsBySupplier.get(sup) || []; chips0.push({ name: d.id, stock, minStock: typeof data.minStock === "number" ? data.minStock : 0, unit: (data.unit as string)||"יחידה", price: typeof data.price === "number" ? data.price : 0 }); chipsBySupplier.set(sup, chips0)
      })
      globalSnap.forEach((d) => {
        if (seenIds.has(d.id)) return
        // מכבדים assignedSuppliers — מסעדה חדשה בלי שיוך רואה רק רכיבים שלה
        if (assignedList.length === 0) return
        const data = d.data()
        const sup = (data.supplier as string) || ""
        if (!sup) return // רכיבים גלובליים ללא ספק — לא מוצגים (רק רכיבי מסעדה עם supplier ריק)
        if (!isAssignedSupplierName(sup)) return
        const supKey = sup
        const price = typeof data.price === "number" ? data.price : 0
        const stock = typeof data.stock === "number" ? data.stock : 0
        const existing = bySupplier.get(supKey) || { products: 0, totalValue: 0, source: "assigned" as const }
        bySupplier.set(supKey, {
          products: existing.products + 1,
          totalValue: existing.totalValue + price * stock,
          source: isAssignedSupplierName(sup) ? "assigned" : existing.source,
        })
        const chips1 = chipsBySupplier.get(supKey) || []; chips1.push({ name: d.id, stock, minStock: typeof data.minStock === "number" ? data.minStock : 0, unit: (data.unit as string)||"יחידה", price: typeof data.price === "number" ? data.price : 0 }); chipsBySupplier.set(supKey, chips1)
      })
      // היסטוריית מחירים למסעדה: מאפשרת לראות אותו רכיב אצל יותר מספק אחד
      const histCountBySupplier = new Map<string, Set<string>>()
      restPricesSnap.forEach((d) => {
        const data = d.data() as Record<string, unknown>
        const sup = String(data.supplier || "").trim()
        const ing = String(data.ingredientName || "").trim()
        const price = typeof data.price === "number" ? data.price : 0
        if (!sup || !ing || price <= 0) return
        const set = histCountBySupplier.get(sup) ?? new Set<string>()
        set.add(ing)
        histCountBySupplier.set(sup, set)
        if (!chipsBySupplier.has(sup)) chipsBySupplier.set(sup, [])
      })
      histCountBySupplier.forEach((set, sup) => {
        const existing = bySupplier.get(sup) || { products: 0, totalValue: 0, source: "restaurant" as const }
        bySupplier.set(sup, {
          ...existing,
          products: Math.max(existing.products, set.size),
          source: existing.source === "assigned" ? "assigned" : (isAssignedSupplierName(sup) ? "assigned" : "restaurant"),
        })
      })
      // ספקים ששויכו מבעלים בלי רכיבים גלובליים — עדיין להציג כרטיס (0 מוצרים)
      for (const raw of assignedList) {
        const assignedName = String(raw || "").trim()
        if (!assignedName) continue
        if (!bySupplier.has(assignedName)) {
          bySupplier.set(assignedName, { products: 0, totalValue: 0, source: "assigned" })
          chipsBySupplier.set(assignedName, [])
        }
      }
      const supplierDocs = await Promise.all(
        Array.from(bySupplier.keys()).map(async (name) => {
          const id = supplierFirestoreDocId(name)
          let snap = await getDoc(doc(db, "suppliers", id))
          let imageUrl = (snap.data()?.imageUrl as string) || undefined
          // תאימות לאחור: תמונה שנשמרה תחת מזהה גולמי (לפני התיקון)
          if (!imageUrl && id !== name && !String(name).includes("/")) {
            const legacy = await getDoc(doc(db, "suppliers", name))
            if (legacy.exists()) imageUrl = (legacy.data()?.imageUrl as string) || undefined
          }
          return { name, imageUrl }
        })
      )
      const imageUrlMap: Record<string,string> = {}
      supplierDocs.forEach(({name,imageUrl})=>{ if(imageUrl) imageUrlMap[name]=imageUrl })
      setSuppliers(
        Array.from(bySupplier.entries()).map(([name, v]) => ({
          name,
          products: v.products,
          totalValue: v.totalValue,
          source: v.source,
          imageUrl: imageUrlMap[name],
          ingredientsForChips: chipsBySupplier.get(name) || [],
        }))
      )
    } catch (e) {
      console.error("load suppliers:", e)
    } finally {
      setLoading(false)
    }
  }, [currentRestaurantId])

  const handleConfirmSupplier = useCallback(
    async (items: InvoiceItem[], supName: string, saveToGlobal?: boolean) => {
      const toGlobal = !!saveToGlobal && isOwner
      if (!toGlobal && !currentRestaurantId) {
        toast.error("יש לבחור מסעדה לפני עדכון מחירי ספקים")
        return
      }
      const restId = currentRestaurantId!
      const now = new Date().toISOString()
      const supTrim = supName.trim()

      const asRef = doc(db, "restaurants", restId, "appState", "assignedSuppliers")
      const asSnap = await getDoc(asRef)
      const currentList: string[] = Array.isArray(asSnap.data()?.list) ? asSnap.data()!.list : []
      const supplierExists = supTrim && currentList.includes(supTrim)

      if (!toGlobal && supTrim) {
        if (!supplierExists) {
          await setDoc(asRef, { list: [...currentList, supTrim] }, { merge: true })
          const supplierId = supplierFirestoreDocId(supTrim)
          await setDoc(doc(db, "suppliers", supplierId), {
            name: supTrim,
            lastUpdated: now,
            createdBy: "restaurant",
          }, { merge: true })
        }
      }

      let currentStocks: Record<string, number> = {}
      if (!toGlobal) {
        const restIngSnap = await getDocs(collection(db, "restaurants", restId, "ingredients"))
        restIngSnap.forEach((d) => {
          const data = d.data()
          if ((data.supplier as string) === supTrim) {
            currentStocks[d.id] = typeof data.stock === "number" ? data.stock : 0
          }
        })
      }

      const batch = writeBatch(db)
      let count = 0
      items.forEach((item) => {
        if (!item.name?.trim()) return
        // תעודת משלוח: price=0 מותר אם יש qty
        const isDeliveryNoteItem = item.price === 0 && typeof item.qty === "number" && item.qty > 0
        if (item.price <= 0 && !isDeliveryNoteItem) return
        const qty = typeof item.qty === "number" && item.qty > 0 ? item.qty : 0
        const payload: Record<string, unknown> = {
          ...(item.price > 0 ? { price: item.price } : {}),  // לא דורסים מחיר קיים בתעודת משלוח
          unit: item.unit || "קג",
          supplier: supName,
          lastUpdated: now,
          createdBy: toGlobal ? "global" : "restaurant",
          // לא מאפסים waste/minStock — הם מוגדרים ידנית
          sku: item.sku ?? "",
        }
        if (!toGlobal) {
          payload.stock = qty > 0 ? (currentStocks[item.name.trim()] ?? 0) + qty : (currentStocks[item.name.trim()] ?? 0)
        }
        if (toGlobal) {
          batch.set(doc(db, "ingredients", item.name.trim()), { ...payload }, { merge: true })
          const priceId = (supName || "").replace(/\//g, "_").replace(/\./g, "_").trim() || "default"
          batch.set(doc(db, "ingredients", item.name.trim(), "prices", priceId), {
            price: item.price,
            unit: item.unit || "קג",
            supplier: supName,
            lastUpdated: now,
          }, { merge: true })
        } else {
          batch.set(
            doc(db, "restaurants", restId, "ingredients", item.name.trim()),
            { ...payload },
            { merge: true }
          )
        }
        count++
      })
      if (count > 0) {
        await batch.commit()
        if (!toGlobal && supName?.trim()) {
          await Promise.all(
            items
              .filter((item) => item.name?.trim() && item.price > 0)
              .map((item) =>
                upsertRestaurantSupplierPrice({
                  db,
                  restaurantId: restId,
                  ingredientName: item.name.trim(),
                  supplier: supName.trim(),
                  price: item.price,
                  unit: item.unit || "קג",
                  lastUpdated: now,
                }),
              ),
          )
        }
        if (toGlobal && supName?.trim()) {
          const toSync = items
            .filter((item) => item.name?.trim() && item.price > 0)
            .map((item) => ({
              name: item.name.trim(),
              price: item.price,
              unit: item.unit || "קג",
              supplier: supName.trim(),
              sku: item.sku ?? "",
              ...(typeof item.qty === "number" && item.qty > 0 ? { qty: item.qty } : {}),
            }))
          if (toSync.length > 0) {
            syncSupplierIngredientsToAssignedRestaurants(supName.trim(), toSync).catch((e) =>
              console.warn("sync to restaurants:", e)
            )
          }
        }
        const withStock = items.filter((i) => typeof i.qty === "number" && i.qty > 0).length
        toast.success(supplierExists
          ? `${count} רכיבים של "${supTrim}" עודכנו בהצלחה${withStock > 0 ? ` — מלאי עודכן ל־${withStock} רכיבים` : ""} — עלויות המנות יתעדכנו אוטומטית`
          : `ספק "${supTrim}" נוצר — ${count} רכיבים נוספו${withStock > 0 ? ` (מלאי עודכן ל־${withStock})` : ""} — עלויות המנות יתעדכנו אוטומטית`)
        loadSuppliers()
        refreshIngredients?.()
      } else {
        toast.warning("לא נמצאו רכיבים לשמירה — ודא ששם הרכיב מלא ושיש מחיר או כמות")
      }
    },
    [currentRestaurantId, isOwner, loadSuppliers, refreshIngredients]
  )

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

      toast.success(t("pages.suppliers.supplierRemoved").replace("{name}", name))
      setDeleteSupplierDialogOpen(false)
      setSelectedSupplierDetail(null)
      loadSuppliers()
    } catch (e) {
      toast.error((e as Error)?.message || t("pages.ingredients.deleteError"))
    } finally {
      setDeletingSupplierName(null)
    }
  }

  const handleDeleteIngredientFromSupplier = async (ingredientName: string) => {
    if (!currentRestaurantId) return
    setDeletingIngredientName(ingredientName)
    try {
      await deleteDoc(doc(db, "restaurants", currentRestaurantId, "ingredients", ingredientName))
      toast.success(t("pages.ingredients.ingredientDeleted").replace("{name}", ingredientName))
      setSupplierDetailItems((prev) => prev.filter((i) => i.name !== ingredientName))
      loadSuppliers()
    } catch (e) {
      toast.error((e as Error)?.message || t("pages.ingredients.deleteError"))
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
      if (supplierDetailName.trim() && price > 0) {
        await upsertRestaurantSupplierPrice({
          db,
          restaurantId: currentRestaurantId,
          ingredientName: editingIngredient.name,
          supplier: supplierDetailName.trim(),
          price,
          unit: editIngUnit,
        })
      }
      toast.success(t("pages.ingredients.ingredientUpdated").replace("{name}", editingIngredient.name))
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
      toast.error((e as Error)?.message || t("pages.settings.saveError"))
    } finally {
      setEditIngSaving(false)
    }
  }



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
      const supplierId = supplierFirestoreDocId(supplierName)
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
        setEditImageUrl(supData.imageUrl ?? null)
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
      toast.error(t("pages.suppliers.loadError"))
    } finally {
      setSupplierDetailLoading(false)
    }
  }, [currentRestaurantId, t])

  useEffect(() => {
    if (selectedSupplierDetail && selectedSupplierDetail !== "ללא ספק") {
      loadSupplierDetail(selectedSupplierDetail)
    } else {
      setSupplierDetailInfo(null)
      setSupplierDetailItems([])
      setSupplierDetailName("")
    }
  }, [selectedSupplierDetail, loadSupplierDetail])

  const openIngredientPriceCompare = useCallback(async (ingredientName: string) => {
    if (!currentRestaurantId) return
    setPriceCompareIngredient(ingredientName)
    setPriceCompareOpen(true)
    setPriceCompareLoading(true)
    setPriceCompareRows([])
    try {
      const snap = await getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients", ingredientName, "prices"))
      const rows = snap.docs
        .map((d) => {
          const v = d.data()
          return {
            supplier: String(v.supplier || d.id).trim(),
            price: typeof v.price === "number" ? v.price : 0,
            unit: String(v.unit || "קג"),
            lastUpdated: typeof v.lastUpdated === "string" ? v.lastUpdated : "",
          }
        })
        .filter((r) => r.supplier && r.price > 0)
        .sort((a, b) => (b.lastUpdated || "").localeCompare(a.lastUpdated || ""))
      setPriceCompareRows(rows)
    } catch (e) {
      console.error("price compare:", e)
      toast.error("שגיאה בטעינת השוואת מחירים")
    } finally {
      setPriceCompareLoading(false)
    }
  }, [currentRestaurantId])

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
      toast.success(t("pages.suppliers.supplierAdded").replace("{name}", supName))
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
        <h1 className="text-2xl font-bold mb-1">{t("nav.suppliers")}</h1>
        <p className="text-muted-foreground">{t("pages.suppliers.selectRestaurant")}</p>
      </div>
    )
  }

  const handleSaveEdit = async () => {
    if (!currentRestaurantId || !selectedSupplierDetail) return
    setSavingEdit(true)
    try {
      let imgUrl = editImageUrl
      if (editImageFile) {
        setUploadingImg(true)
        const safe = selectedSupplierDetail.replace(/[^a-zA-Z0-9]/g,"_")
        const sRef = storageRef(storage, "suppliers/"+safe+"/cover.jpg")
        await new Promise<void>((res, rej) => {
          const task = uploadBytesResumable(sRef, editImageFile!)
          task.on("state_changed", ()=>{}, rej, async () => {
            imgUrl = await getDownloadURL(sRef)
            setEditImageUrl(imgUrl)
            res(undefined)
          })
        })
        setUploadingImg(false)
      }
      const supplierDocId = supplierFirestoreDocId(selectedSupplierDetail)
      await setDoc(doc(db, "suppliers", supplierDocId), {
        name: selectedSupplierDetail.trim(),
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
        contact: editContact.trim() || null,
        address: editAddress.trim() || null,
        ...(imgUrl ? { imageUrl: imgUrl } : {}),
        updatedAt: new Date().toISOString()
      }, { merge: true })
      setSupplierDetailInfo({
        phone: editPhone || undefined,
        email: editEmail || undefined,
        contact: editContact || undefined,
        address: editAddress || undefined,
      })
      setEditSupplierOpen(false)
      toast.success("פרטי הספק עודכנו")
      if(imgUrl) setSuppliers(prev=>prev.map(s=>s.name===selectedSupplierDetail?{...s,imageUrl:imgUrl!}:s))
    } catch (e) {
      toast.error((e as Error)?.message || "שגיאה")
    }
    finally { setSavingEdit(false); setUploadingImg(false) }
  }

  const restaurantName = restaurants?.find((r) => r.id === currentRestaurantId)?.name ?? undefined
  const safeFilteredSuppliers = Array.isArray(suppliers) ? suppliers.filter((s) => (s?.name ?? "").includes(searchQuery)) : []

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1">{t("nav.suppliers")}</h1>
          <p className="text-muted-foreground">{t("pages.suppliers.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setShowInvoiceUploadArea((v) => !v)}>
            <UploadIcon className="w-4 h-4 ml-1" />
            העלאת חשבונית
          </Button>
          <Button onClick={() => setAddSupplierOpen(true)}>
            <Plus className="w-4 h-4 ml-1" />
            ספק חדש
          </Button>
          <Button variant="outline" onClick={() => setShowPurchaseOrdersPanel(true)} className="gap-1">
            <ShoppingCart className="w-4 h-4 text-blue-600" />
            <span className="text-blue-600 font-medium">הזמנות ספקים</span>
          </Button>
          <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("pages.suppliers.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10"
          />
          </div>
        </div>
      </div>

      {/* העלאת חשבוניות — נטען רק בלחיצה על הכפתור (מונע שגיאת initialization) */}
      {showInvoiceUploadArea && (
        InvoiceUploadComponent ? (
          <InvoiceUploadComponent
            restaurantName={restaurantName}
            onConfirm={handleConfirmSupplier}
            onClose={() => setShowInvoiceUploadArea(false)}
            onSuccess={loadSuppliers}
          />
        ) : (
          <div className="mb-6 flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )
      )}

      {safeFilteredSuppliers.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("pages.suppliers.noSuppliersDesc")}
          </CardContent>
        </Card>
      ) : (
        <>
          {globalReorderOpen&&(
            <div className="mb-4 p-4 rounded-xl border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
                  <ShoppingCart className="w-4 h-4"/>המלצות הזמנה — כל הספקים
                </p>
                <button onClick={()=>setGlobalReorderOpen(false)} className="text-muted-foreground hover:text-foreground"><XIcon className="w-4 h-4"/></button>
              </div>
              <div className="rounded-md border overflow-hidden"><div className="overflow-y-auto" style={{maxHeight:"340px"}}>
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-blue-50/90 dark:bg-blue-950/80 border-b z-10"><tr className="text-xs text-muted-foreground">
                    <th className="text-right py-2 px-3">ספק</th>
                    <th className="text-right py-2 px-3">רכיב</th>
                    <th className="text-center py-2 w-16">מלאי</th>
                    <th className="text-center py-2 w-16">מינ׳</th>
                    <th className="text-center py-2 w-24 text-blue-600 font-semibold">כמות להזמין</th>
                    <th className="text-center py-2 w-16">יחידה</th>
                    <th className="text-center py-2 w-20">עלות</th>
                  </tr></thead>
                  <tbody>
                    {suppliers.flatMap(s=>(s.ingredientsForChips||[]).filter(i=>i.stock<i.minStock||(i.stock===0&&i.minStock===0)).map((i,idx)=>{
                      const sq=i.minStock>0?Math.max(i.minStock-i.stock,1):1
                      return (<tr key={s.name+idx} className="border-b last:border-0 hover:bg-blue-50/50 dark:hover:bg-blue-950/30">
                        <td className="py-1.5 px-3 text-xs text-muted-foreground font-medium">{s.name}</td>
                        <td className="py-1.5 px-3 font-medium">{i.name}</td>
                        <td className="py-1.5 text-center text-red-500 font-medium">{i.stock}</td>
                        <td className="py-1.5 text-center text-muted-foreground">{i.minStock}</td>
                        <td className="py-1.5 text-center font-bold text-blue-600">{sq}</td>
                        <td className="py-1.5 text-center text-muted-foreground text-xs">{i.unit}</td>
                        <td className="py-1.5 text-center">₪{(sq*i.price).toFixed(0)}</td>
                      </tr>)
                    }))}
                  </tbody>
                </table>
              </div></div>
              <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground">
                <span>{suppliers.reduce((s,sup)=>s+(sup.ingredientsForChips||[]).filter(i=>i.stock<i.minStock||(i.stock===0&&i.minStock===0)).length,0)} פריטים מ-{suppliers.filter(s=>(s.ingredientsForChips||[]).some(i=>i.stock<i.minStock||(i.stock===0&&i.minStock===0))).length} ספקים | סה"כ משוער: <strong className="text-foreground">₪{suppliers.reduce((tot,s)=>tot+(s.ingredientsForChips||[]).filter(i=>i.stock<i.minStock||(i.stock===0&&i.minStock===0)).reduce((s2,i)=>s2+(i.minStock>0?Math.max(i.minStock-i.stock,1):1)*i.price,0),0).toFixed(0)}</strong></span>
                <button onClick={()=>setShowPurchaseOrdersPanel(true)} className="text-blue-600 hover:underline font-medium">הזמנות ספקים ←</button>
              </div>
            </div>
          )}
          <p className="text-sm text-muted-foreground mb-4">{t("pages.suppliers.clickForDetails")}</p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
            {safeFilteredSuppliers.map((supplier) => (
              <div
                key={supplier.name}
                className={cn(
                  "relative rounded-xl cursor-pointer transition-all overflow-hidden shadow-sm h-28",
                  selectedSupplierDetail === supplier.name ? "ring-2 ring-primary scale-[0.98]" : "hover:shadow-md hover:scale-[0.99]"
                )}
                style={{
                  background: supplier.imageUrl
                    ? 'url('+supplier.imageUrl+') center/cover'
                    : 'linear-gradient(135deg,hsl(var(--primary)/0.15),hsl(var(--primary)/0.05))'
                }}
                onClick={() => { if(supplier.name !== "ללא ספק") { setSelectedSupplierDetail(selectedSupplierDetail === supplier.name ? null : supplier.name); setStockChipFilter("all"); setReorderPanelOpen(false); setReorderPanelOpen(false) } }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/80"/>
                <div className="absolute inset-0 p-3 flex flex-col justify-between">
                  {/* Top: value */}
                  <div className="flex justify-end">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/40 text-white">₪{supplier.totalValue.toLocaleString()}</span>
                  </div>
                  {/* Bottom: name + chips */}
                  <div>
                    <p className="font-bold text-white text-sm leading-tight mb-1">{supplier.name === "ללא ספק" ? t("pages.suppliers.noSupplier") : supplier.name}</p>
                    <div className="flex gap-1 flex-wrap items-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/50 text-white">🛒 {supplier.products}</span>
                      {(()=>{
                        const items = supplier.ingredientsForChips||[]
                        if(!items.length) return null
                        const ok = items.filter(i=>i.stock>0&&(i.minStock===0||i.stock>=i.minStock)).length
                        const low = items.filter(i=>i.stock>0&&i.minStock>0&&i.stock<i.minStock).length
                        const zero = items.filter(i=>i.stock===0).length
                        const reorder=items.filter(i=>i.stock<i.minStock||(i.stock===0&&i.minStock===0)).length
        return <><span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/90 text-white">{ok} ✓</span>{low>0&&<span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/90 text-white">⚠ {low}</span>}{zero>0&&<span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/90 text-white">✕ {zero}</span>}{reorder>0&&<span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/90 text-white">🛒 {reorder}</span>}</>
                      })()}
                    </div>
                  </div>
                </div>
              </div>
          ))}
          </div>
          {selectedSupplierDetail && selectedSupplierDetail !== "ללא ספק" && (
            <div className="space-y-4 p-5 rounded-xl border bg-muted/30">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  {editImageUrl
                    ? <img src={editImageUrl} className="w-10 h-10 rounded-xl object-cover shrink-0" alt=""/>
                    : <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Truck className="w-5 h-5 text-primary"/></div>
                  }
                  <h3 className="text-lg font-semibold">{supplierDetailName || selectedSupplierDetail}</h3>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={()=>{ setEditPhone(supplierDetailInfo?.phone||""); setEditEmail(supplierDetailInfo?.email||""); setEditContact(supplierDetailInfo?.contact||""); setEditAddress(supplierDetailInfo?.address||""); setEditImageFile(null); setEditSupplierOpen(true) }}>
                    <Edit2 className="w-4 h-4 ml-1"/>ערוך
                  </Button>
                  {isOwner && (
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteSupplierDialogOpen(true)}>
                      <Trash2 className="w-4 h-4 ml-1"/>{t("pages.suppliers.deleteSupplier")}
                    </Button>
                  )}
                </div>
              </div>
              {editSupplierOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e=>{if(e.target===e.currentTarget)setEditSupplierOpen(false)}}>
                  <div className="bg-background rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-lg">עריכת ספק — {selectedSupplierDetail}</h3>
                      <button onClick={()=>setEditSupplierOpen(false)} className="text-muted-foreground hover:text-foreground"><XIcon className="w-5 h-5"/></button>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="relative w-16 h-16 rounded-xl overflow-hidden border bg-muted cursor-pointer hover:opacity-80" onClick={()=>editImgRef.current?.click()}>
                        {(editImageFile||editImageUrl)
                          ? <img src={editImageFile?URL.createObjectURL(editImageFile):editImageUrl!} className="w-full h-full object-cover" alt=""/>
                          : <div className="w-full h-full flex items-center justify-center"><Truck className="w-6 h-6 text-muted-foreground"/></div>
                        }
                        {uploadingImg && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-white"/></div>}
                      </div>
                      <div><button onClick={()=>editImgRef.current?.click()} className="text-sm text-primary hover:underline block">החלף תמונה</button><p className="text-xs text-muted-foreground">PNG, JPG עד 5MB</p></div>
                      <input ref={editImgRef} type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.currentTarget.files?.[0];if(f&&f.size<=5242880){setEditImageFile(f)}else if(f){toast.error("קובץ גדול מדי")}e.currentTarget.value=""}}/>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-xs text-muted-foreground block mb-1">טלפון</label><input dir="ltr" value={editPhone} onChange={e=>setEditPhone(e.target.value)} placeholder="050-0000000" className="w-full h-9 rounded-md border px-3 text-sm bg-background"/></div>
                      <div><label className="text-xs text-muted-foreground block mb-1">אימייל</label><input dir="ltr" value={editEmail} onChange={e=>setEditEmail(e.target.value)} placeholder="email@example.com" className="w-full h-9 rounded-md border px-3 text-sm bg-background"/></div>
                      <div><label className="text-xs text-muted-foreground block mb-1">איש קשר</label><input value={editContact} onChange={e=>setEditContact(e.target.value)} placeholder="שם איש קשר" className="w-full h-9 rounded-md border px-3 text-sm bg-background"/></div>
                      <div><label className="text-xs text-muted-foreground block mb-1">כתובת</label><input value={editAddress} onChange={e=>setEditAddress(e.target.value)} placeholder="רחוב, עיר" className="w-full h-9 rounded-md border px-3 text-sm bg-background"/></div>
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                      <button onClick={()=>setEditSupplierOpen(false)} className="px-4 py-2 rounded-md border text-sm hover:bg-muted">ביטול</button>
                      <button onClick={handleSaveEdit} disabled={savingEdit} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50">
                        {savingEdit&&<Loader2 className="w-3 h-3 animate-spin"/>}שמור
                      </button>
                    </div>
                  </div>
                </div>
              )}
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
                    {/* KPI chips */}
                    {(supplierDetailItems||[]).length > 0 && (()=>{
                      const items = supplierDetailItems||[];
                      const okCount = items.filter(i=>i.stock>0&&(i.minStock===0||i.stock>=i.minStock)).length;
                      const lowCount = items.filter(i=>i.stock>0&&i.minStock>0&&i.stock<i.minStock).length;
                      const zeroCount = items.filter(i=>i.stock===0).length;
                      const reorderCount=items.filter(i=>i.stock<i.minStock||(i.stock===0&&i.minStock===0)).length;
                      const chips=[
                        {key:"ok" as const, label:"פריטים במלאי", val:okCount, grad:"from-emerald-400 to-teal-500"},
                        {key:"low" as const, label:"מלאי נמוך", val:lowCount, grad:"from-amber-400 to-orange-500"},
                        {key:"zero" as const, label:"אזל מהמלאי", val:zeroCount, grad:"from-red-400 to-rose-500"},
                      ];
                      return (
                        <>
                        <div className="flex flex-wrap gap-3 mb-4">
                          {chips.map(chip=>(
                            <div key={chip.key}
                              className={`rounded-lg overflow-hidden shadow-sm cursor-pointer hover:-translate-y-0.5 transition-all ${stockChipFilter===chip.key?"ring-2 ring-offset-1 ring-primary scale-105":""}`}
                              style={{minWidth:90}}
                              onClick={()=>setStockChipFilter(stockChipFilter===chip.key?"all":chip.key)}>
                              <div className={`bg-gradient-to-br ${chip.grad} px-3 py-1.5 flex items-center gap-1.5`}>
                                <span className="text-base font-bold text-white">{chip.val}</span>
                              </div>
                              <div className={`px-2 py-0.5 ${stockChipFilter===chip.key?"bg-primary/10":"bg-muted/60"}`}>
                                <p className={`text-[10px] font-medium ${stockChipFilter===chip.key?"text-primary":"text-muted-foreground"}`}>{chip.label}</p>
                              </div>
                            </div>
                          ))}
                          {stockChipFilter!=="all"&&(
                            <button onClick={()=>setStockChipFilter("all")} className="text-xs text-muted-foreground hover:text-foreground self-center mr-1">✕ הצג הכל</button>
                          )}
                          {reorderCount>0&&(
                            <div className={`rounded-lg overflow-hidden shadow-sm cursor-pointer hover:-translate-y-0.5 transition-all ${reorderPanelOpen?"ring-2 ring-offset-1 ring-blue-500 scale-105":""}`} style={{minWidth:90}} onClick={()=>setReorderPanelOpen(v=>!v)}>
                              <div className="bg-gradient-to-br from-blue-400 to-indigo-500 px-3 py-1.5 flex items-center gap-1.5">
                                <ShoppingCart className="w-3.5 h-3.5 text-white/80"/><span className="text-base font-bold text-white">{reorderCount}</span>
                              </div>
                              <div className={`px-2 py-0.5 ${reorderPanelOpen?"bg-blue-50 dark:bg-blue-950/30":"bg-muted/60"}`}>
                                <p className={`text-[10px] font-medium ${reorderPanelOpen?"text-blue-600":"text-muted-foreground"}`}>להזמנה</p>
                              </div>
                            </div>
                          )}
                        </div>
                        {reorderPanelOpen&&reorderCount>0&&(
                          <div className="mb-4 p-4 rounded-xl border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
                            <p className="text-sm font-semibold mb-3 flex items-center gap-1.5 text-blue-700 dark:text-blue-400"><ShoppingCart className="w-4 h-4"/>המלצות להזמנה ({reorderCount} פריטים)</p>
                            <div className="rounded-md border overflow-hidden"><div className="overflow-y-auto" style={{maxHeight:"260px"}}>
                              <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-blue-50/90 dark:bg-blue-950/80 border-b z-10"><tr className="text-xs text-muted-foreground">
                                  <th className="text-right py-2 px-3">רכיב</th><th className="text-center py-2 w-20">מלאי</th><th className="text-center py-2 w-20">מינ׳</th>
                                  <th className="text-center py-2 w-24 text-blue-600 font-semibold">כמות להזמין</th><th className="text-center py-2 w-16">יחידה</th><th className="text-center py-2 w-20">עלות</th>
                                </tr></thead>
                                <tbody>
                                  {(supplierDetailItems||[]).filter(i=>i.stock<i.minStock||(i.stock===0&&i.minStock===0)).map((i,idx)=>{
                                    const sq=i.minStock>0?Math.max(i.minStock-i.stock,1):1
                                    return (<tr key={idx} className="border-b last:border-0 hover:bg-blue-50/50">
                                      <td className="py-2 px-3 font-medium">{i.name}</td>
                                      <td className="py-2 text-center text-red-500 font-medium">{i.stock}</td>
                                      <td className="py-2 text-center text-muted-foreground">{i.minStock}</td>
                                      <td className="py-2 text-center font-bold text-blue-600">{sq}</td>
                                      <td className="py-2 text-center text-muted-foreground text-xs">{i.unit}</td>
                                      <td className="py-2 text-center">₪{(sq*i.price).toFixed(0)}</td>
                                    </tr>)
                                  })}
                                </tbody>
                              </table>
                            </div></div>
                            <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground">
                              <span>סה"כ משוער: <strong className="text-foreground">₪{(supplierDetailItems||[]).filter(i=>i.stock<i.minStock||(i.stock===0&&i.minStock===0)).reduce((s,i)=>s+(i.minStock>0?Math.max(i.minStock-i.stock,1):1)*i.price,0).toFixed(0)}</strong></span>
                              <button onClick={()=>setShowPurchaseOrdersPanel(true)} className="text-blue-600 hover:underline">עבור להזמנות ←</button>
                            </div>
                          </div>
                        )}
                        </>
                      );
                    })()}
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <p className="text-sm font-medium">רכיבים ({(supplierDetailItems || []).filter(i=>
                        stockChipFilter==="all"||
                        (stockChipFilter==="ok"&&i.stock>0&&(i.minStock===0||i.stock>=i.minStock))||
                        (stockChipFilter==="low"&&i.stock>0&&i.minStock>0&&i.stock<i.minStock)||
                        (stockChipFilter==="zero"&&i.stock===0)
                      ).filter(i=>!supplierIngFilter||i.name.includes(supplierIngFilter)).length})</p>
                      {(supplierDetailItems||[]).length>5&&(
                        <div className="relative">
                          <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"/>
                          <input value={supplierIngFilter} onChange={e=>setSupplierIngFilter(e.target.value)}
                            placeholder="חיפוש..." dir="rtl"
                            className="h-8 pl-3 pr-8 rounded-md border text-sm bg-background w-40 focus:outline-none focus:ring-1 focus:ring-primary"/>
                        </div>
                      )}
                    </div>
                    {(supplierDetailItems || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">אין רכיבים להצגה</p>
                    ) : (
                      <div className="rounded-lg border overflow-hidden">
                      <div className="overflow-y-auto overflow-x-auto" style={{maxHeight:"320px"}}>
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                            <TableRow>
                              <TableHead className="text-right">רכיב</TableHead>
                              <TableHead className="text-right">מחיר</TableHead>
                              <TableHead className="text-right">יחידה</TableHead>
                              <TableHead className="text-right">פחת %</TableHead>
                              <TableHead className="text-right">מלאי</TableHead>
                              <TableHead className="text-right">מינ׳</TableHead>
                              <TableHead className="text-right">סטטוס</TableHead>
                              <TableHead className="text-right">מק״ט</TableHead>
                              <TableHead className="text-right w-32">פעולות</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(supplierDetailItems || []).filter(i=>
                              stockChipFilter==="all"||
                              (stockChipFilter==="ok"&&i.stock>0&&(i.minStock===0||i.stock>=i.minStock))||
                              (stockChipFilter==="low"&&i.stock>0&&i.minStock>0&&i.stock<i.minStock)||
                              (stockChipFilter==="zero"&&i.stock===0)
                            ).filter(i=>!supplierIngFilter||i.name.includes(supplierIngFilter)).map((i) => (
                              <TableRow key={i.name}>
                                <TableCell className="font-medium text-right">{i.name}</TableCell>
                                <TableCell className="text-right">₪{i.price.toFixed(2)}</TableCell>
                                <TableCell className="text-right">{i.unit}</TableCell>
                                <TableCell className="text-right">{i.waste}%</TableCell>
                                <TableCell className="text-right">{i.stock}</TableCell>
                                <TableCell className="text-right">{i.minStock}</TableCell>
                                <TableCell className="text-right">
                                  {i.stock===0
                                    ?<span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">אזל</span>
                                    :i.minStock>0&&i.stock<i.minStock
                                      ?<span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">נמוך</span>
                                      :<span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">תקין</span>
                                  }
                                </TableCell>
                                <TableCell className="text-right">{i.sku || "—"}</TableCell>
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 px-2 text-xs"
                                        onClick={(e) => { e.stopPropagation(); void openIngredientPriceCompare(i.name) }}
                                        title="השוואת מחירים בין ספקים"
                                      >
                                        השוואה
                                      </Button>
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

      <Dialog open={priceCompareOpen} onOpenChange={setPriceCompareOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>השוואת ספקים לרכיב: {priceCompareIngredient}</DialogTitle>
          </DialogHeader>
          {priceCompareLoading ? (
            <div className="py-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin ml-2" />
              טוען מחירים...
            </div>
          ) : priceCompareRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">אין מחירי ספקים שמורים לרכיב זה</p>
          ) : (
            <div className="space-y-2 max-h-[55vh] overflow-y-auto">
              {priceCompareRows.map((r) => (
                <div key={`${r.supplier}-${r.lastUpdated || ""}`} className="border rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{r.supplier}</p>
                    <p className="text-xs text-muted-foreground">{r.lastUpdated ? r.lastUpdated.split("T")[0] : ""}</p>
                  </div>
                  <div className="text-left">
                    <p className="font-semibold">₪{r.price.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{r.unit}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
        <DialogContent style={{width:"92vw",maxWidth:"92vw",height:"88vh",maxHeight:"88vh",overflow:"hidden",display:"flex",flexDirection:"column"}}>
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
                      <XIcon className="w-3 h-3" />
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

      {showPurchaseOrdersPanel && (
        <div style={{position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.5)'}} onClick={() => setShowPurchaseOrdersPanel(false)} />
          <div style={{position:'relative',width:'92vw',height:'88vh',background:'var(--background)',borderRadius:'12px',boxShadow:'0 25px 50px rgba(0,0,0,0.3)',overflow:'visible',display:'flex',flexDirection:'column'}}>
            <button onClick={() => setShowPurchaseOrdersPanel(false)} style={{position:'absolute',top:'12px',left:'12px',zIndex:10,width:'32px',height:'32px',borderRadius:'50%',border:'none',background:'var(--muted)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px'}}>✕</button>
            <div style={{overflowY:'auto',flex:1}}>
              <OrdersPanel />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
