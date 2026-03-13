"use client"

import { useState, useEffect, useCallback } from "react"
import { collection, collectionGroup, getDocs, doc, getDoc, setDoc, deleteDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Search,
  Plus,
  Download,
  Package,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
  Edit2,
  Trash2,
  TrendingUp,
  TrendingDown,
  Loader2,
  ChefHat,
  Globe,
} from "lucide-react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { downloadExcel } from "@/lib/export-excel"
import { fetchWebPriceForIngredient } from "@/lib/ai-extract"

/** מחיר הכי זול גלובלי — לבעלים להשוואה */
interface GlobalCheapest {
  price: number
  supplier: string
  unit: string
}

interface Ingredient {
  id: string
  name: string
  price: number
  unit: string
  waste: number
  stock: number
  minStock: number
  supplier: string
  sku: string
  category: string
  lastPriceChange?: number
  /** בעלים: מחיר מהמסעדה שלי vs מחיר שוק (גלובלי מספקים אחרים) */
  priceSource?: "mine" | "market"
  /** בעלים: הכי זול גלובלי (מאיפה לקנות) */
  globalCheapest?: GlobalCheapest
}

const UNITS = ["גרם", "ק\"ג", "מל", "ליטר", "יחידה", "חבילה", "כף", "כפית"]

/** המרה למחיר ליחידת kg להשוואה (גרם/קג) */
function pricePerKg(price: number, unit: string): number {
  const u = (unit || "").toLowerCase()
  if (u.includes("ק\"ג") || u === "קג" || u === "kg") return price
  if (u === "גרם" || u === "g") return price * 1000
  return price
}
const CATEGORIES = ["אחר", "בשר", "עוף", "דגים", "חלב", "ירקות", "פירות", "תבלינים", "שמנים", "קמחים"]

const isOwnerRole = (role: string, isSystemOwner?: boolean) => isSystemOwner || role === "owner"

export function Ingredients() {
  const { currentRestaurantId, setCurrentPage, userRole, isSystemOwner, refreshIngredients } = useApp()
  const isOwner = isOwnerRole(userRole, isSystemOwner)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [suppliers, setSuppliers] = useState<string[]>([])
  const [restaurantSuppliers, setRestaurantSuppliers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [supplierFilter, setSupplierFilter] = useState("כל הספקים")
  const [stockFilter, setStockFilter] = useState("all")
  const [priceSourceFilter, setPriceSourceFilter] = useState<"all" | "mine" | "market">("all")
  const [sortBy, setSortBy] = useState("name")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [addIngSaving, setAddIngSaving] = useState(false)
  const [addIngName, setAddIngName] = useState("")
  const [addIngPrice, setAddIngPrice] = useState("")
  const [addIngUnit, setAddIngUnit] = useState("גרם")
  const [addIngWaste, setAddIngWaste] = useState(0)
  const [addIngSupplier, setAddIngSupplier] = useState("")
  const [addIngStock, setAddIngStock] = useState(0)
  const [addIngMinStock, setAddIngMinStock] = useState(0)
  const [addIngSku, setAddIngSku] = useState("")
  const [addIngCategory, setAddIngCategory] = useState("אחר")

  const [editIngredientOpen, setEditIngredientOpen] = useState(false)
  const [editIngredient, setEditIngredient] = useState<Ingredient | null>(null)
  const [editIngSupplier, setEditIngSupplier] = useState("")
  const [editIngPrice, setEditIngPrice] = useState("")
  const [editIngUnit, setEditIngUnit] = useState("גרם")
  const [editIngWaste, setEditIngWaste] = useState("0")
  const [editIngStock, setEditIngStock] = useState("0")
  const [editIngMinStock, setEditIngMinStock] = useState("0")
  const [editIngSku, setEditIngSku] = useState("")
  const [editIngCategory, setEditIngCategory] = useState("אחר")
  const [editIngSaving, setEditIngSaving] = useState(false)
  const [deletingIngredientId, setDeletingIngredientId] = useState<string | null>(null)

  // Compound recipe modal
  const [compoundOpen, setCompoundOpen] = useState(false)
  const [compoundSaving, setCompoundSaving] = useState(false)
  const [compoundName, setCompoundName] = useState("")
  const [compoundYieldQty, setCompoundYieldQty] = useState(1)
  const [compoundYieldUnit, setCompoundYieldUnit] = useState("מנה")
  const [compoundItems, setCompoundItems] = useState<{ name: string; qty: number; unit: string; waste: number; isSubRecipe?: boolean }[]>([])
  const [compoundItemName, setCompoundItemName] = useState("")
  const [compoundItemQty, setCompoundItemQty] = useState(1)
  const [compoundItemUnit, setCompoundItemUnit] = useState("גרם")
  const [compoundItemWaste, setCompoundItemWaste] = useState(0)
  const [recipes, setRecipes] = useState<{ id: string; isCompound?: boolean }[]>([])
  const [webPriceByIngredient, setWebPriceByIngredient] = useState<Record<string, { price: number; store: string; unit: string; source: string }>>({})
  const [webPriceLoading, setWebPriceLoading] = useState<string | null>(null)

  const loadIngredients = useCallback(async () => {
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
      let pricesSnap: Awaited<ReturnType<typeof getDocs>> | null = null
      if (isOwner) {
        try {
          pricesSnap = await getDocs(collectionGroup(db, "prices"))
        } catch {
          // אם טעינת prices נכשלת — ממשיכים בלי "הכי זול"
        }
      }

      const assignedList: string[] = Array.isArray(asDoc.data()?.list) ? asDoc.data()!.list : []
      const byId = new Map<string, Ingredient>()
      const supSet = new Set<string>()
      const restSupSet = new Set<string>()

      const globalCheapestByIngredient = new Map<string, GlobalCheapest>()
      if (isOwner && pricesSnap) {
        pricesSnap.forEach((d) => {
          const data = d.data()
          const parentId = d.ref.parent.parent?.id
          if (!parentId) return
          const price = typeof data.price === "number" ? data.price : 0
          if (price <= 0) return
          const unit = (data.unit as string) || "ק\"ג"
          const supplier = (data.supplier as string) || ""
          const existing = globalCheapestByIngredient.get(parentId)
          const ppkg = pricePerKg(price, unit)
          if (!existing || ppkg < pricePerKg(existing.price, existing.unit)) {
            globalCheapestByIngredient.set(parentId, { price, unit, supplier })
          }
        })
      }
      globalSnap.forEach((d) => {
        const data = d.data()
        const price = typeof data.price === "number" ? data.price : 0
        const unit = (data.unit as string) || "ק\"ג"
        const sup = (data.supplier as string) || ""
        if (isOwner && price > 0) {
          const existing = globalCheapestByIngredient.get(d.id)
          const ppkg = pricePerKg(price, unit)
          if (!existing || ppkg < pricePerKg(existing.price, existing.unit)) {
            globalCheapestByIngredient.set(d.id, { price, unit, supplier: sup })
          }
        }
      })

      restSnap.forEach((d) => {
        const data = d.data()
        const ing: Ingredient = {
          id: d.id,
          name: d.id,
          price: typeof data.price === "number" ? data.price : 0,
          unit: (data.unit as string) || "ק\"ג",
          waste: typeof data.waste === "number" ? data.waste : 0,
          stock: typeof data.stock === "number" ? data.stock : 0,
          minStock: typeof data.minStock === "number" ? data.minStock : 0,
          supplier: (data.supplier as string) || "",
          sku: (data.sku as string) || "",
          category: (data.category as string) || "אחר",
          priceSource: isOwner ? "mine" : undefined,
          globalCheapest: isOwner ? globalCheapestByIngredient.get(d.id) : undefined,
        }
        byId.set(d.id, ing)
        if (data.supplier) {
          supSet.add(data.supplier)
          restSupSet.add(data.supplier)
        }
      })
      globalSnap.forEach((d) => {
        if (byId.has(d.id)) return
        const data = d.data()
        const sup = (data.supplier as string) || ""
        if (!isOwner && sup && !assignedList.includes(sup)) return
        const ing: Ingredient = {
          id: d.id,
          name: d.id,
          price: typeof data.price === "number" ? data.price : 0,
          unit: (data.unit as string) || "ק\"ג",
          waste: typeof data.waste === "number" ? data.waste : 0,
          stock: typeof data.stock === "number" ? data.stock : 0,
          minStock: typeof data.minStock === "number" ? data.minStock : 0,
          supplier: sup,
          sku: (data.sku as string) || "",
          category: (data.category as string) || "אחר",
          priceSource: isOwner ? "market" : undefined,
          globalCheapest: isOwner ? globalCheapestByIngredient.get(d.id) : undefined,
        }
        byId.set(d.id, ing)
        if (data.supplier) supSet.add(data.supplier)
      })
      setIngredients(Array.from(byId.values()))
      setSuppliers(["כל הספקים", ...Array.from(supSet).sort()])
      setRestaurantSuppliers(Array.from(restSupSet).sort())
    } catch (e) {
      console.error("load ingredients:", e)
      toast.error("שגיאה בטעינת רכיבים")
    } finally {
      setLoading(false)
    }
  }, [currentRestaurantId, isOwner])

  useEffect(() => {
    loadIngredients()
  }, [loadIngredients])

  const fetchWebPrice = useCallback(async (ingredientName: string) => {
    setWebPriceLoading(ingredientName)
    try {
      let data: { price: number; store: string; unit: string } | null = null
      try {
        const res = await fetch("/api/ingredient-web-price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: ingredientName }),
        })
        if (res.ok) {
          const d = await res.json()
          if (d.price) data = { price: d.price, store: d.store || "—", unit: d.unit || "קג" }
        }
      } catch {
        // API לא זמין (פריסה סטטית) — נשתמש ב-AI מהלקוח
      }
      if (!data) data = await fetchWebPriceForIngredient(ingredientName)
      if (data) {
        setWebPriceByIngredient((prev) => ({
          ...prev,
          [ingredientName]: { price: data!.price, store: data!.store, unit: data!.unit, source: "ai" },
        }))
      } else {
        toast.error("לא הצלחתי למצוא מחיר באינטרנט")
      }
    } catch (e) {
      toast.error((e as Error)?.message || "שגיאה בבדיקת מחיר")
    } finally {
      setWebPriceLoading(null)
    }
  }, [])

  const loadRecipes = useCallback(async () => {
    if (!currentRestaurantId) return
    try {
      const snap = await getDocs(collection(db, "restaurants", currentRestaurantId, "recipes"))
      setRecipes(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    } catch {
      setRecipes([])
    }
  }, [currentRestaurantId])

  useEffect(() => {
    loadRecipes()
  }, [loadRecipes])

  useEffect(() => {
    if (compoundOpen) loadRecipes()
  }, [compoundOpen, loadRecipes])

  const addCompoundItem = () => {
    const name = compoundItemName.trim()
    if (!name) {
      toast.error("בחר רכיב")
      return
    }
    const isSubRecipe = recipes.some((r) => r.id === name && r.isCompound)
    setCompoundItems((prev) => [...prev.filter((i) => i.name !== name), { name, qty: compoundItemQty, unit: isSubRecipe ? "מנה" : compoundItemUnit, waste: isSubRecipe ? 0 : compoundItemWaste, isSubRecipe }])
    setCompoundItemName("")
    setCompoundItemQty(1)
    setCompoundItemUnit(isSubRecipe ? "מנה" : "גרם")
    setCompoundItemWaste(0)
  }

  const removeCompoundItem = (name: string) => {
    setCompoundItems((prev) => prev.filter((i) => i.name !== name))
  }

  const handleDeleteCompoundRecipe = async (recipeName: string) => {
    if (!currentRestaurantId) return
    setDeletingIngredientId(`recipe-${recipeName}`)
    try {
      await deleteDoc(doc(db, "restaurants", currentRestaurantId, "recipes", recipeName))
      toast.success(`מתכון "${recipeName}" נמחק`)
      setRecipes((prev) => prev.filter((r) => r.id !== recipeName))
      refreshIngredients?.()
    } catch (e) {
      toast.error((e as Error)?.message || "שגיאה במחיקה")
    } finally {
      setDeletingIngredientId(null)
    }
  }

  const handleSaveCompound = async () => {
    const name = compoundName.trim()
    if (!name) {
      toast.error("הזן שם מתכון")
      return
    }
    if (compoundItems.length === 0) {
      toast.error("הוסף לפחות רכיב אחד")
      return
    }
    if (!currentRestaurantId) return
    const exists = ingredients.some((i) => i.name === name) || recipes.some((r) => r.id === name)
    if (exists) {
      toast.error("שם זה כבר קיים")
      return
    }
    setCompoundSaving(true)
    try {
      await setDoc(doc(db, "restaurants", currentRestaurantId, "recipes", name), {
        category: "__compound__",
        sellingPrice: 0,
        isCompound: true,
        yieldQty: compoundYieldQty,
        yieldUnit: compoundYieldUnit,
        ingredients: compoundItems.map((i) => ({ name: i.name, qty: i.qty, unit: i.unit, waste: i.waste || 0, isSubRecipe: !!i.isSubRecipe })),
      }, { merge: true })
      toast.success(`מתכון "${name}" נוצר — ניתן לשייך למנות בעץ מוצר`)
      setCompoundOpen(false)
      setCompoundName("")
      setCompoundYieldQty(1)
      setCompoundYieldUnit("מנה")
      setCompoundItems([])
      loadIngredients()
      refreshIngredients?.()
      getDocs(collection(db, "restaurants", currentRestaurantId, "recipes"))
        .then((snap) => setRecipes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
        .catch(() => {})
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCompoundSaving(false)
    }
  }

  const resetAddIngForm = () => {
    setAddIngName("")
    setAddIngPrice("")
    setAddIngUnit("גרם")
    setAddIngWaste(0)
    setAddIngSupplier("")
    setAddIngStock(0)
    setAddIngMinStock(0)
    setAddIngSku("")
    setAddIngCategory("אחר")
  }

  const handleSaveAddIngredient = async () => {
    const name = addIngName.trim()
    if (!name) {
      toast.error("הזן שם רכיב")
      return
    }
    if (!currentRestaurantId) return
    const exists = ingredients.some((i) => i.name === name)
    if (exists) {
      toast.error("רכיב בשם זה כבר קיים")
      return
    }
    setAddIngSaving(true)
    try {
      await setDoc(doc(db, "restaurants", currentRestaurantId, "ingredients", name), {
        price: parseFloat(String(addIngPrice)) || 0,
        unit: addIngUnit,
        waste: addIngWaste,
        supplier: addIngSupplier.trim() || "",
        stock: addIngStock,
        minStock: addIngMinStock,
        sku: addIngSku.trim() || "",
        category: addIngCategory,
        lastUpdated: new Date().toISOString(),
      }, { merge: true })
      toast.success(`רכיב "${name}" נוסף בהצלחה`)
      setIsAddDialogOpen(false)
      resetAddIngForm()
      loadIngredients()
      refreshIngredients?.()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAddIngSaving(false)
    }
  }

  const handleDeleteIngredient = async (ing: Ingredient) => {
    if (!currentRestaurantId) return
    setDeletingIngredientId(ing.id)
    try {
      await deleteDoc(doc(db, "restaurants", currentRestaurantId, "ingredients", ing.id))
      toast.success(`רכיב "${ing.name}" נמחק`)
      loadIngredients()
      refreshIngredients?.()
    } catch (e) {
      toast.error((e as Error)?.message || "שגיאה במחיקה")
    } finally {
      setDeletingIngredientId(null)
    }
  }

  const openEditIngredient = (ing: Ingredient) => {
    setEditIngredient(ing)
    setEditIngSupplier(ing.supplier || "")
    setEditIngPrice(String(ing.price))
    setEditIngUnit(ing.unit || "גרם")
    setEditIngWaste(String(ing.waste))
    setEditIngStock(String(ing.stock))
    setEditIngMinStock(String(ing.minStock))
    setEditIngSku(ing.sku || "")
    setEditIngCategory(ing.category || "אחר")
    setEditIngredientOpen(true)
  }

  const handleSaveEditIngredient = async () => {
    if (!editIngredient || !currentRestaurantId) return
    setEditIngSaving(true)
    try {
      const price = parseFloat(String(editIngPrice)) || 0
      const waste = parseFloat(String(editIngWaste)) || 0
      const stock = parseFloat(String(editIngStock)) || 0
      const minStock = parseFloat(String(editIngMinStock)) || 0
      await setDoc(doc(db, "restaurants", currentRestaurantId, "ingredients", editIngredient.name), {
        price,
        unit: editIngUnit,
        waste,
        stock,
        minStock,
        sku: editIngSku.trim() || "",
        category: editIngCategory || "אחר",
        supplier: editIngSupplier.trim() || "",
        lastUpdated: new Date().toISOString(),
      }, { merge: true })
      toast.success(`רכיב "${editIngredient.name}" עודכן`)
      setEditIngredientOpen(false)
      setEditIngredient(null)
      loadIngredients()
      refreshIngredients?.()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setEditIngSaving(false)
    }
  }

  const getStockStatus = (ingredient: Ingredient) => {
    if (ingredient.stock === 0) return { status: "אזל", color: "bg-red-100 text-red-700", icon: XCircle }
    if (ingredient.minStock > 0 && ingredient.stock < ingredient.minStock) return { status: "נמוך", color: "bg-amber-100 text-amber-700", icon: AlertTriangle }
    return { status: "תקין", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 }
  }

  const compoundRecipesForList = recipes
    .filter((r) => r.isCompound)
    .map((r) => ({
      id: `recipe-${r.id}`,
      name: r.id,
      price: 0,
      unit: "מנה",
      waste: 0,
      stock: 0,
      minStock: 0,
      supplier: "מתכון מורכב",
      sku: "",
      category: "אחר",
      isCompound: true as const,
    }))

  const allItems: (Ingredient & { isCompound?: boolean })[] = [
    ...ingredients,
    ...compoundRecipesForList,
  ]

  const filteredIngredients = allItems
    .filter((ing) => {
      const matchesSearch = !searchTerm || ing.name.includes(searchTerm) || (ing.sku && ing.sku.includes(searchTerm))
      const matchesSupplier = supplierFilter === "כל הספקים" || ing.supplier === supplierFilter
      const matchesStatus =
        ing.isCompound ||
        stockFilter === "all" ||
        (stockFilter === "low" && ing.stock < ing.minStock && ing.stock > 0) ||
        (stockFilter === "zero" && ing.stock === 0) ||
        (stockFilter === "ok" && ing.stock >= ing.minStock)
      const matchesPriceSource =
        ing.isCompound ||
        priceSourceFilter === "all" ||
        (priceSourceFilter === "mine" && ing.priceSource === "mine") ||
        (priceSourceFilter === "market" && ing.priceSource === "market")
      return matchesSearch && matchesSupplier && matchesStatus && matchesPriceSource
    })
    .sort((a, b) => {
      if (a.isCompound && !b.isCompound) return 1
      if (!a.isCompound && b.isCompound) return -1
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name, "he")
        case "name_desc":
          return b.name.localeCompare(a.name, "he")
        case "price_desc":
          return b.price - a.price
        case "price_asc":
          return a.price - b.price
        case "unit":
          return (a.unit || "").localeCompare(b.unit || "", "he")
        case "waste_desc":
          return b.waste - a.waste
        case "waste_asc":
          return a.waste - b.waste
        case "stock_desc":
          return b.stock - a.stock
        case "stock_asc":
          return a.stock - b.stock
        case "minStock_desc":
          return b.minStock - a.minStock
        case "minStock_asc":
          return a.minStock - b.minStock
        case "supplier":
          return (a.supplier || "").localeCompare(b.supplier || "", "he")
        case "sku":
          return (a.sku || "").localeCompare(b.sku || "", "he")
        case "status": {
          const statusA = a.isCompound ? "מתכון" : getStockStatus(a).status
          const statusB = b.isCompound ? "מתכון" : getStockStatus(b).status
          return (statusA || "").localeCompare(statusB || "", "he")
        }
        default:
          return a.name.localeCompare(b.name, "he")
      }
    })

  const stats = {
    total: allItems.length,
    lowStock: ingredients.filter((i) => i.minStock > 0 && i.stock < i.minStock && i.stock > 0).length,
    outOfStock: ingredients.filter((i) => i.stock === 0).length,
    totalValue: ingredients.reduce((sum, i) => sum + i.price * i.stock, 0),
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
        <h1 className="text-2xl font-bold mb-1">רכיבים</h1>
        <p className="text-muted-foreground">בחר מסעדה כדי לראות רכיבים</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Package className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">סה"כ רכיבים</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500/10">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">מלאי נמוך</p>
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
                <div className="p-2 rounded-xl bg-red-500/10">
                  <XCircle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">אזל מהמלאי</p>
                  <p className="text-2xl font-bold">{stats.outOfStock}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/10">
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">שווי מלאי</p>
                  <p className="text-2xl font-bold">{stats.totalValue.toLocaleString()} ש"ח</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex items-center gap-2 flex-1">
              <span className="font-bold text-lg">ניהול רכיבים</span>
              <Badge variant="secondary">{filteredIngredients.length} רכיבים</Badge>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" className="rounded-full" onClick={() => setCompoundOpen(true)}>
                <ChefHat className="w-4 h-4 ml-2" />
                מתכון חדש
              </Button>
              <Dialog open={isAddDialogOpen} onOpenChange={(o) => { setIsAddDialogOpen(o); if (!o) resetAddIngForm() }}>
                <DialogTrigger asChild>
                  <Button className="rounded-full">
                    <Plus className="w-4 h-4 ml-2" />
                    רכיב חדש
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>➕ רכיב חדש</DialogTitle>
                    <p className="text-sm text-muted-foreground">הוסף רכיב לרשימת המסעדה</p>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="add-ing-name">שם הרכיב *</Label>
                        <Input id="add-ing-name" value={addIngName} onChange={(e) => setAddIngName(e.target.value)} placeholder="למשל: קמח, שמן" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="add-ing-price">מחיר ₪ *</Label>
                        <Input id="add-ing-price" type="number" value={addIngPrice} onChange={(e) => setAddIngPrice(e.target.value)} placeholder="0" min={0} step={0.01} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="add-ing-unit">יחידה</Label>
                        <Select value={addIngUnit} onValueChange={setAddIngUnit}>
                          <SelectTrigger id="add-ing-unit"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {UNITS.map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="add-ing-waste">פחת %</Label>
                        <Input id="add-ing-waste" type="number" value={addIngWaste} onChange={(e) => setAddIngWaste(parseFloat(e.target.value) || 0)} placeholder="0" min={0} max={100} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="add-ing-supplier">ספק</Label>
                      <Input id="add-ing-supplier" value={addIngSupplier} onChange={(e) => setAddIngSupplier(e.target.value)} placeholder="שם הספק" list="add-ing-supplier-list" />
                      <datalist id="add-ing-supplier-list">
                        {suppliers.filter((s) => s !== "כל הספקים").map((s) => (
                          <option key={s} value={s} />
                        ))}
                      </datalist>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="add-ing-stock">מלאי נוכחי</Label>
                        <Input id="add-ing-stock" type="number" value={addIngStock} onChange={(e) => setAddIngStock(parseFloat(e.target.value) || 0)} placeholder="0" min={0} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="add-ing-minstock">מינימום מלאי</Label>
                        <Input id="add-ing-minstock" type="number" value={addIngMinStock} onChange={(e) => setAddIngMinStock(parseFloat(e.target.value) || 0)} placeholder="0" min={0} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="add-ing-sku">מק״ט</Label>
                        <Input id="add-ing-sku" value={addIngSku} onChange={(e) => setAddIngSku(e.target.value)} placeholder="קוד מוצר" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="add-ing-category">קטגוריה</Label>
                        <Select value={addIngCategory} onValueChange={setAddIngCategory}>
                          <SelectTrigger id="add-ing-category"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>ביטול</Button>
                    <Button onClick={handleSaveAddIngredient} disabled={addIngSaving}>
                      {addIngSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                      שמור רכיב
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={editIngredientOpen} onOpenChange={(o) => { setEditIngredientOpen(o); if (!o) setEditIngredient(null) }}>
                <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>עריכת רכיב</DialogTitle>
                    <p className="text-sm text-muted-foreground">
                      {editIngredient && `רכיב: ${editIngredient.name}`}
                    </p>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>מחיר ₪ *</Label>
                        <Input
                          type="number"
                          value={editIngPrice}
                          onChange={(e) => setEditIngPrice(e.target.value)}
                          placeholder="0"
                          min={0}
                          step={0.01}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>יחידה</Label>
                        <Select value={editIngUnit} onValueChange={setEditIngUnit}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {UNITS.map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>פחת %</Label>
                        <Input
                          type="number"
                          value={editIngWaste}
                          onChange={(e) => setEditIngWaste(e.target.value)}
                          placeholder="0"
                          min={0}
                          max={100}
                          step={0.1}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>מלאי</Label>
                        <Input
                          type="number"
                          value={editIngStock}
                          onChange={(e) => setEditIngStock(e.target.value)}
                          placeholder="0"
                          min={0}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>מינ׳ מלאי</Label>
                        <Input
                          type="number"
                          value={editIngMinStock}
                          onChange={(e) => setEditIngMinStock(e.target.value)}
                          placeholder="0"
                          min={0}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>קטגוריה</Label>
                        <Select value={editIngCategory} onValueChange={setEditIngCategory}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>מק״ט</Label>
                      <Input
                        value={editIngSku}
                        onChange={(e) => setEditIngSku(e.target.value)}
                        placeholder="קוד מוצר"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>ספק</Label>
                      <Input
                        value={editIngSupplier}
                        onChange={(e) => setEditIngSupplier(e.target.value)}
                        placeholder="בחר או הזן שם ספק"
                        list="edit-ing-supplier-list"
                      />
                      <datalist id="edit-ing-supplier-list">
                        {(restaurantSuppliers || []).map((s) => (
                          <option key={s} value={s} />
                        ))}
                      </datalist>
                      <p className="text-xs text-muted-foreground">ספקים מרכיבים של המסעדה — ניתן גם להזין ספק חדש</p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditIngredientOpen(false)}>ביטול</Button>
                    <Button onClick={handleSaveEditIngredient} disabled={editIngSaving}>
                      {editIngSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                      שמור
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={compoundOpen} onOpenChange={setCompoundOpen}>
                <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <ChefHat className="w-5 h-5" />
                      מתכון מורכב חדש
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground">מתכון המורכב מרכיבים — ניתן לשייך למנות בעץ מוצר</p>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>שם המתכון *</Label>
                        <Input value={compoundName} onChange={(e) => setCompoundName(e.target.value)} placeholder="למשל: רוטב עגבניות" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label>תפוקה</Label>
                          <Input type="number" value={compoundYieldQty} onChange={(e) => setCompoundYieldQty(Number(e.target.value) || 1)} min={0.1} step={0.1} />
                        </div>
                        <div className="space-y-1">
                          <Label>יחידה</Label>
                          <Select value={compoundYieldUnit} onValueChange={setCompoundYieldUnit}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="מנה">מנה</SelectItem>
                              <SelectItem value="גרם">גרם</SelectItem>
                              <SelectItem value={'ק"ג'}>ק&quot;ג</SelectItem>
                              <SelectItem value="מל">מל</SelectItem>
                              <SelectItem value="ליטר">ליטר</SelectItem>
                              <SelectItem value="יחידה">יחידה</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>רכיבים *</Label>
                      <div className="max-h-32 overflow-y-auto border rounded-lg p-2 space-y-1">
                        {compoundItems.map((i) => (
                          <div key={i.name} className="flex items-center justify-between gap-2 py-1 px-2 bg-muted rounded text-sm">
                            <span>{i.isSubRecipe && "🧪 "}{i.name} — {i.qty} {i.unit} {i.waste ? `(${i.waste}% פחת)` : ""}</span>
                            <Button size="sm" variant="ghost" onClick={() => removeCompoundItem(i.name)} className="h-6 w-6 p-0 text-destructive">
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                        {compoundItems.length === 0 && <p className="text-sm text-muted-foreground py-2">הוסף רכיבים</p>}
                      </div>
                      <div className="flex gap-2 flex-wrap items-end">
                        <Select value={compoundItemName} onValueChange={setCompoundItemName}>
                          <SelectTrigger className="w-[180px]"><SelectValue placeholder="בחר רכיב" /></SelectTrigger>
                          <SelectContent>
                            {ingredients.map((i) => (
                              <SelectItem key={i.id} value={i.name}>{i.name}</SelectItem>
                            ))}
                            {recipes.filter((r) => r.isCompound).map((r) => (
                              <SelectItem key={r.id} value={r.id}>🧪 {r.id}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input type="number" value={compoundItemQty} onChange={(e) => setCompoundItemQty(Number(e.target.value) || 0)} placeholder="כמות" className="w-20" min={0} step={0.1} />
                        <Select value={compoundItemUnit} onValueChange={setCompoundItemUnit}>
                          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input type="number" value={compoundItemWaste} onChange={(e) => setCompoundItemWaste(Number(e.target.value) || 0)} placeholder="פחת %" className="w-16" min={0} max={100} />
                        <Button size="sm" onClick={addCompoundItem}>➕ הוסף</Button>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCompoundOpen(false)}>ביטול</Button>
                    <Button onClick={handleSaveCompound} disabled={compoundSaving || compoundItems.length === 0}>
                      {compoundSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                      שמור מתכון
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  const rows = filteredIngredients.map((i) => ({
                    "שם הרכיב": ("isCompound" in i && i.isCompound ? "🧪 " : "") + i.name,
                    "מחיר": "isCompound" in i && i.isCompound ? "—" : i.price,
                    "יחידה": i.unit,
                    "פחת %": "isCompound" in i && i.isCompound ? "—" : i.waste,
                    "מלאי": "isCompound" in i && i.isCompound ? "—" : i.stock,
                    "מינימום": "isCompound" in i && i.isCompound ? "—" : i.minStock,
                    "ספק": i.supplier,
                    "מק\"ט": i.sku,
                    "סטטוס": "isCompound" in i && i.isCompound ? "מתכון" : i.stock === 0 ? "אזל" : i.minStock > 0 && i.stock < i.minStock ? "נמוך" : "תקין",
                  }))
                  downloadExcel(rows, `רכיבים_${new Date().toISOString().slice(0, 10)}`, "רכיבים")
                  toast.success("הקובץ הורד")
                }}
              >
                <Download className="w-4 h-4 ml-2" />
                Excel
              </Button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mt-4" dir="rtl">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש מהיר: רכיב, מק״ט..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...suppliers, ...(recipes.some((r) => r.isCompound) && !suppliers.includes("מתכון מורכב") ? ["מתכון מורכב"] : [])].map((sup) => (
                  <SelectItem key={sup} value={sup}>{sup}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="סטטוס מלאי" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל המלאי</SelectItem>
                <SelectItem value="low">מלאי נמוך</SelectItem>
                <SelectItem value="zero">אזל</SelectItem>
                <SelectItem value="ok">תקין</SelectItem>
              </SelectContent>
            </Select>
            {isOwner && (
              <Select value={priceSourceFilter} onValueChange={(v) => setPriceSourceFilter(v as "all" | "mine" | "market")}>
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue placeholder="מקור מחיר" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל המחירים</SelectItem>
                  <SelectItem value="mine">מחיר שלי</SelectItem>
                  <SelectItem value="market">מחיר שוק</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto" dir="rtl">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => setSortBy((s) => (s === "name" ? "name_desc" : "name"))}
                  >
                    <span className="flex items-center justify-end gap-1">
                      שם הרכיב
                      {(sortBy === "name" || sortBy === "name_desc") && (sortBy === "name" ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />)}
                    </span>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => setSortBy((s) => (s === "price_asc" ? "price_desc" : "price_asc"))}
                  >
                    <span className="flex items-center justify-end gap-1">
                      מחיר
                      {(sortBy === "price_asc" || sortBy === "price_desc") && (sortBy === "price_desc" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />)}
                    </span>
                  </TableHead>
                  {isOwner && (
                    <TableHead className="text-right">מקור</TableHead>
                  )}
                  {isOwner && (
                    <TableHead className="text-right">הכי זול אצל</TableHead>
                  )}
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => setSortBy("unit")}
                  >
                    <span className="flex items-center justify-end gap-1">יחידה</span>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => setSortBy((s) => (s === "waste_asc" ? "waste_desc" : "waste_asc"))}
                  >
                    <span className="flex items-center justify-end gap-1">
                      פחת %
                      {(sortBy === "waste_asc" || sortBy === "waste_desc") && (sortBy === "waste_desc" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />)}
                    </span>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => setSortBy((s) => (s === "stock_asc" ? "stock_desc" : "stock_asc"))}
                  >
                    <span className="flex items-center justify-end gap-1">
                      מלאי
                      {(sortBy === "stock_asc" || sortBy === "stock_desc") && (sortBy === "stock_desc" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />)}
                    </span>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => setSortBy((s) => (s === "minStock_asc" ? "minStock_desc" : "minStock_asc"))}
                  >
                    <span className="flex items-center justify-end gap-1">
                      מינימום
                      {(sortBy === "minStock_asc" || sortBy === "minStock_desc") && (sortBy === "minStock_desc" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />)}
                    </span>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => setSortBy("supplier")}
                  >
                    <span className="flex items-center justify-end gap-1">ספק</span>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => setSortBy("sku")}
                  >
                    <span className="flex items-center justify-end gap-1">מק״ט</span>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => setSortBy("status")}
                  >
                    <span className="flex items-center justify-end gap-1">סטטוס</span>
                  </TableHead>
                  {isOwner && <TableHead className="text-right w-24">פעולות</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIngredients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isOwner ? 12 : 9} className="text-center py-8 text-muted-foreground">
                      אין רכיבים. הוסף רכיבים דרך העלאה או עץ מוצר.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredIngredients.map((ingredient, index) => {
                    const isCompound = "isCompound" in ingredient && ingredient.isCompound
                    const stockStatus = isCompound ? { status: "מתכון", color: "bg-primary/10 text-primary", icon: ChefHat } : getStockStatus(ingredient)
                    const StatusIcon = stockStatus.icon
                    return (
                      <motion.tr
                        key={ingredient.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className={cn("hover:bg-muted/50", isCompound && "bg-primary/5")}
                      >
                        <TableCell className="font-medium text-right">
                          {isCompound && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded ml-1">🧪 מתכון</span>}
                          {ingredient.name}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {isCompound ? "—" : `${ingredient.price} ש"ח`}
                        </TableCell>
                        {isOwner && (
                          <TableCell className="text-right">
                            {isCompound ? "—" : (
                              ingredient.priceSource === "market" ? (
                                <Badge variant="secondary" className="text-xs whitespace-nowrap">מחיר שוק</Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs whitespace-nowrap">מחיר שלי</Badge>
                              )
                            )}
                          </TableCell>
                        )}
                        {isOwner && (
                          <TableCell className="text-right text-sm">
                            {isCompound ? "—" : (
                              <div className="flex flex-col gap-1.5 min-w-[160px]">
                                {ingredient.globalCheapest && (
                                  <div className={cn(
                                    "block",
                                    ingredient.priceSource === "mine" &&
                                    pricePerKg(ingredient.globalCheapest.price, ingredient.globalCheapest.unit) < pricePerKg(ingredient.price, ingredient.unit) &&
                                    "text-green-600 dark:text-green-400 font-medium"
                                  )}>
                                    <span className="text-muted-foreground text-xs">מהמערכת:</span> ₪{ingredient.globalCheapest.price.toFixed(1)}/{ingredient.globalCheapest.unit}
                                    {ingredient.globalCheapest.supplier && (
                                      <span className="text-primary font-medium"> אצל {ingredient.globalCheapest.supplier}</span>
                                    )}
                                  </div>
                                )}
                                {webPriceByIngredient[ingredient.name] ? (
                                  <div className="text-blue-600 dark:text-blue-400 block">
                                    <span className="text-muted-foreground text-xs">מהאינטרנט (AI):</span> ₪{webPriceByIngredient[ingredient.name].price.toFixed(1)}/{webPriceByIngredient[ingredient.name].unit}
                                    <span className="font-medium"> אצל {webPriceByIngredient[ingredient.name].store}</span>
                                  </div>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-1 text-xs text-muted-foreground hover:text-primary"
                                    onClick={() => fetchWebPrice(ingredient.name)}
                                    disabled={webPriceLoading === ingredient.name}
                                  >
                                    {webPriceLoading === ingredient.name ? (
                                      <Loader2 className="w-3 h-3 animate-spin ml-1" />
                                    ) : (
                                      <Globe className="w-3 h-3 ml-1" />
                                    )}
                                    בדוק באינטרנט
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-right">{ingredient.unit}</TableCell>
                        <TableCell className="text-right">{isCompound ? "—" : `${ingredient.waste}%`}</TableCell>
                        <TableCell className="text-right font-semibold">{isCompound ? "—" : ingredient.stock}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{isCompound ? "—" : ingredient.minStock}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">{ingredient.supplier || "—"}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">{ingredient.sku || "—"}</TableCell>
                        <TableCell className="text-right">
                          <Badge className={stockStatus.color}>
                            <StatusIcon className="w-3 h-3 ml-1" />
                            {stockStatus.status}
                          </Badge>
                        </TableCell>
                        {isOwner && (
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              {!isCompound && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEditIngredient(ingredient)}
                                  className="h-8 w-8 p-0"
                                  title="ערוך רכיב"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => isCompound ? handleDeleteCompoundRecipe(ingredient.name) : handleDeleteIngredient(ingredient)}
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                title={isCompound ? "מחק מתכון" : "מחק רכיב"}
                                disabled={deletingIngredientId === ingredient.id}
                              >
                                {deletingIngredientId === ingredient.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </motion.tr>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
