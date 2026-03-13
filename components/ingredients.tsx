"use client"

import React, { useState, useEffect, useCallback } from "react"
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
  ChevronDown,
  GripVertical,
  Columns3,
  EyeOff,
  Rows2,
  Rows3,
  Rows4,
} from "lucide-react"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { downloadExcel } from "@/lib/export-excel"
import { fetchWebPriceForIngredient } from "@/lib/ai-extract"
import { useTranslations } from "@/lib/use-translations"

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

function CheapestPricePopover({
  ingredient,
  webPrice,
  onFetchWebPrice,
  webPriceLoading,
  pricePerKgFn,
  t,
}: {
  ingredient: Ingredient
  webPrice?: { price: number; store: string; unit: string; source: string }
  onFetchWebPrice: () => void
  webPriceLoading: boolean
  pricePerKgFn: (p: number, u: string) => number
  t: (key: string) => string
}) {
  const gc = ingredient.globalCheapest
  const wp = webPrice
  const cheapest =
    gc && wp
      ? pricePerKgFn(gc.price, gc.unit) <= pricePerKgFn(wp.price, wp.unit)
        ? { price: gc.price, unit: gc.unit }
        : { price: wp.price, unit: wp.unit }
      : gc
        ? { price: gc.price, unit: gc.unit }
        : wp
          ? { price: wp.price, unit: wp.unit }
          : null
  const hasAny = gc || webPrice
  const displayPrice = cheapest ? `₪${cheapest.price.toFixed(1)}/${cheapest.unit}` : null
  const isCheaper = ingredient.priceSource === "mine" && gc && pricePerKgFn(gc.price, gc.unit) < pricePerKgFn(ingredient.price, ingredient.unit)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors hover:bg-muted",
            isCheaper && "text-green-600 dark:text-green-400",
            !hasAny && "text-muted-foreground"
          )}
        >
          {displayPrice || (hasAny ? t("pages.ingredients.clickToView") : "—")}
          <ChevronDown className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="space-y-2">
          {gc ? (
            <div className={cn("text-sm", isCheaper && "text-green-600 dark:text-green-400 font-medium")}>
              <span className="text-muted-foreground">{t("pages.ingredients.fromSuppliers")}:</span> ₪{gc.price.toFixed(1)}/{gc.unit}
              {gc.supplier && <span className="text-primary"> {t("pages.ingredients.at")} {gc.supplier}</span>}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">{t("pages.ingredients.fromSuppliers")}: —</div>
          )}
          {webPrice ? (
            <div className="text-sm text-blue-600 dark:text-blue-400 space-y-1">
              <div>
                <span className="text-muted-foreground">{t("pages.ingredients.fromInternet")}:</span> ₪{webPrice.price.toFixed(1)}/{webPrice.unit}
                <span className="font-medium"> {t("pages.ingredients.at")} {webPrice.store}</span>
              </div>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-primary"
                onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(ingredient.name + " " + webPrice.store + " מחיר קנייה")}`, "_blank")}
              >
                {t("pages.ingredients.buyOnline")} →
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onFetchWebPrice}
              disabled={webPriceLoading}
            >
              {webPriceLoading ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : <Globe className="w-3 h-3 ml-1" />}
              {t("pages.ingredients.checkOnline")}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function Ingredients() {
  const t = useTranslations()
  const tRef = React.useRef(t)
  tRef.current = t
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

  const INGREDIENTS_COLUMN_ORDER_KEY = "ingredients-column-order"
  const defaultColumnOrder = ["name", "price", "source", "unit", "waste", "stock", "minStock", "supplier", "sku", "status", "actions"] as const
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return [...defaultColumnOrder]
    try {
      const stored = localStorage.getItem(INGREDIENTS_COLUMN_ORDER_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as string[]
        const valid = defaultColumnOrder.filter((c) => parsed.includes(c))
        const missing = defaultColumnOrder.filter((c) => !parsed.includes(c))
        if (valid.length + missing.length === defaultColumnOrder.length) return [...valid, ...missing]
      }
    } catch (_) {}
    return [...defaultColumnOrder]
  })
  const INGREDIENTS_COLUMN_VISIBILITY_KEY = "ingredients-column-visibility"
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {}
    try {
      const stored = localStorage.getItem(INGREDIENTS_COLUMN_VISIBILITY_KEY)
      if (stored) return JSON.parse(stored) as Record<string, boolean>
    } catch (_) {}
    return {}
  })
  const visibleColumnOrder = columnOrder.filter((k) => columnVisibility[k] !== false)
  const toggleColumnVisibility = useCallback((key: string) => {
    setColumnVisibility((prev) => {
      const next = { ...prev, [key]: prev[key] === false }
      try { localStorage.setItem(INGREDIENTS_COLUMN_VISIBILITY_KEY, JSON.stringify(next)) } catch (_) {}
      return next
    })
  }, [])
  const displayColumnOrder = visibleColumnOrder.filter((k) => (k !== "source" && k !== "actions") || isOwner)
  const handleColumnReorder = useCallback((fromIndex: number, toIndex: number) => {
    setColumnOrder((prev) => {
      const display = prev.filter((k) => columnVisibility[k] !== false && ((k !== "source" && k !== "actions") || isOwner))
      if (fromIndex < 0 || fromIndex >= display.length || toIndex < 0 || toIndex >= display.length) return prev
      const displayOrder = [...display]
      const [moved] = displayOrder.splice(fromIndex, 1)
      displayOrder.splice(toIndex, 0, moved)
      const rest = prev.filter((k) => !displayOrder.includes(k))
      const next = [...displayOrder, ...rest]
      try { localStorage.setItem(INGREDIENTS_COLUMN_ORDER_KEY, JSON.stringify(next)) } catch (_) {}
      return next
    })
  }, [columnVisibility, isOwner])

  const INGREDIENTS_ROW_DENSITY_KEY = "ingredients-row-density"
  type RowDensity = "compact" | "normal" | "expanded"
  const [rowDensity, setRowDensity] = useState<RowDensity>(() => {
    if (typeof window === "undefined") return "normal"
    try {
      const stored = localStorage.getItem(INGREDIENTS_ROW_DENSITY_KEY) as RowDensity | null
      if (stored && ["compact", "normal", "expanded"].includes(stored)) return stored
    } catch (_) {}
    return "normal"
  })
  const setRowDensityAndStore = useCallback((d: RowDensity) => {
    setRowDensity(d)
    try { localStorage.setItem(INGREDIENTS_ROW_DENSITY_KEY, d) } catch (_) {}
  }, [])
  const densityCellClass = rowDensity === "compact" ? "py-1 px-1.5" : rowDensity === "expanded" ? "py-3 px-3" : "py-2 px-2"

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
      const ings = Array.from(byId.values())
      setIngredients(ings)
      setSuppliers(["כל הספקים", ...Array.from(supSet).sort()])
      setRestaurantSuppliers(Array.from(restSupSet).sort())
      if (isOwner && ings.length > 0) {
        const webCache: Record<string, { price: number; store: string; unit: string; source: string }> = {}
        await Promise.all(
          ings.map(async (ing) => {
            try {
              const id = ing.name.replace(/\//g, "_").replace(/\./g, "_") || "unknown"
              const snap = await getDoc(doc(db, "webPriceCache", id))
              const d = snap.data()
              if (d && typeof d.price === "number") {
                webCache[ing.name] = { price: d.price, store: (d.store as string) || "—", unit: (d.unit as string) || "קג", source: "cache" }
              }
            } catch {
              //
            }
          })
        )
        setWebPriceByIngredient((prev) => ({ ...prev, ...webCache }))
      }
    } catch (e) {
      console.error("load ingredients:", e)
      toast.error(tRef.current("pages.ingredients.loadError"))
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
        try {
          const id = ingredientName.replace(/\//g, "_").replace(/\./g, "_") || "unknown"
          await setDoc(doc(db, "webPriceCache", id), {
            price: data.price,
            store: data.store,
            unit: data.unit,
            checkedAt: new Date().toISOString(),
          })
        } catch {
          //
        }
      } else {
        toast.error(tRef.current("pages.ingredients.priceCheckFailed"))
      }
    } catch (e) {
      toast.error((e as Error)?.message || tRef.current("pages.ingredients.priceCheckError"))
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
      toast.error(t("pages.ingredients.selectIngredient"))
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
      toast.success(t("pages.ingredients.recipeDeleted").replace("{name}", recipeName))
      setRecipes((prev) => prev.filter((r) => r.id !== recipeName))
      refreshIngredients?.()
    } catch (e) {
      toast.error((e as Error)?.message || t("pages.ingredients.deleteError"))
    } finally {
      setDeletingIngredientId(null)
    }
  }

  const handleSaveCompound = async () => {
    const name = compoundName.trim()
    if (!name) {
      toast.error(t("pages.ingredients.enterRecipeName"))
      return
    }
    if (compoundItems.length === 0) {
      toast.error(t("pages.ingredients.addAtLeastOne"))
      return
    }
    if (!currentRestaurantId) return
    const exists = ingredients.some((i) => i.name === name) || recipes.some((r) => r.id === name)
    if (exists) {
      toast.error(t("pages.ingredients.nameExists"))
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
      toast.success(t("pages.ingredients.recipeCreated").replace("{name}", name))
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
      toast.error(t("pages.ingredients.enterIngredientName"))
      return
    }
    if (!currentRestaurantId) return
    const exists = ingredients.some((i) => i.name === name)
    if (exists) {
      toast.error(t("pages.ingredients.ingredientExists"))
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
      toast.success(t("pages.ingredients.ingredientAdded").replace("{name}", name))
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
      toast.success(t("pages.ingredients.ingredientDeleted").replace("{name}", ing.name))
      loadIngredients()
      refreshIngredients?.()
    } catch (e) {
      toast.error((e as Error)?.message || t("pages.ingredients.deleteError"))
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
      toast.success(t("pages.ingredients.ingredientUpdated").replace("{name}", editIngredient.name))
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
    if (ingredient.stock === 0) return { status: t("pages.ingredients.stockOut"), sortKey: "out", color: "bg-red-100 text-red-700", icon: XCircle }
    if (ingredient.minStock > 0 && ingredient.stock < ingredient.minStock) return { status: t("pages.ingredients.stockLow"), sortKey: "low", color: "bg-amber-100 text-amber-700", icon: AlertTriangle }
    return { status: t("pages.ingredients.stockOk"), sortKey: "ok", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 }
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
      supplier: t("pages.ingredients.compoundRecipe"),
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
          const statusA = a.isCompound ? "compound" : getStockStatus(a).sortKey
          const statusB = b.isCompound ? "compound" : getStockStatus(b).sortKey
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
        <h1 className="text-2xl font-bold mb-1">{t("nav.ingredients")}</h1>
        <p className="text-muted-foreground">{t("pages.ingredients.selectRestaurant")}</p>
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
                  <p className="text-sm text-muted-foreground">{t("pages.ingredients.totalIngredients")}</p>
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
                <div className="p-2 rounded-xl bg-red-500/10">
                  <XCircle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("pages.ingredients.outOfStockLabel")}</p>
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
                  <p className="text-sm text-muted-foreground">{t("pages.ingredients.inventoryValue")}</p>
                  <p className="text-2xl font-bold">{stats.totalValue.toLocaleString()} ₪</p>
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
              <span className="font-bold text-lg">{t("pages.ingredients.manageIngredients")}</span>
              <Badge variant="secondary">{filteredIngredients.length} {t("pages.ingredients.ingredients")}</Badge>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" className="rounded-full" onClick={() => setCompoundOpen(true)}>
                <ChefHat className="w-4 h-4 ml-2" />
                {t("pages.ingredients.newRecipe")}
              </Button>
              <Dialog open={isAddDialogOpen} onOpenChange={(o) => { setIsAddDialogOpen(o); if (!o) resetAddIngForm() }}>
                <DialogTrigger asChild>
                  <Button className="rounded-full">
                    <Plus className="w-4 h-4 ml-2" />
                    {t("pages.ingredients.newIngredient")}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>➕ {t("pages.ingredients.newIngredient")}</DialogTitle>
                    <p className="text-sm text-muted-foreground">{t("pages.ingredients.addIngredientDesc")}</p>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="add-ing-name">{t("pages.ingredients.ingredientName")} *</Label>
                        <Input id="add-ing-name" value={addIngName} onChange={(e) => setAddIngName(e.target.value)} placeholder={t("pages.ingredients.namePlaceholder")} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="add-ing-price">{t("pages.ingredients.price")} ₪ *</Label>
                        <Input id="add-ing-price" type="number" value={addIngPrice} onChange={(e) => setAddIngPrice(e.target.value)} placeholder="0" min={0} step={0.01} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="add-ing-unit">{t("pages.ingredients.unit")}</Label>
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
                        <Label htmlFor="add-ing-waste">{t("pages.ingredients.waste")}</Label>
                        <Input id="add-ing-waste" type="number" value={addIngWaste} onChange={(e) => setAddIngWaste(parseFloat(e.target.value) || 0)} placeholder="0" min={0} max={100} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="add-ing-supplier">{t("pages.ingredients.supplier")}</Label>
                      <Input id="add-ing-supplier" value={addIngSupplier} onChange={(e) => setAddIngSupplier(e.target.value)} placeholder={t("pages.ingredients.supplierPlaceholder")} list="add-ing-supplier-list" />
                      <datalist id="add-ing-supplier-list">
                        {suppliers.filter((s) => s !== "כל הספקים").map((s) => (
                          <option key={s} value={s} />
                        ))}
                      </datalist>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="add-ing-stock">{t("pages.ingredients.currentStock")}</Label>
                        <Input id="add-ing-stock" type="number" value={addIngStock} onChange={(e) => setAddIngStock(parseFloat(e.target.value) || 0)} placeholder="0" min={0} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="add-ing-minstock">{t("pages.ingredients.minStockLabel")}</Label>
                        <Input id="add-ing-minstock" type="number" value={addIngMinStock} onChange={(e) => setAddIngMinStock(parseFloat(e.target.value) || 0)} placeholder="0" min={0} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="add-ing-sku">מק״ט</Label>
                        <Input id="add-ing-sku" value={addIngSku} onChange={(e) => setAddIngSku(e.target.value)} placeholder={t("pages.ingredients.skuPlaceholder")} />
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
                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>{t("pages.settings.cancel")}</Button>
                    <Button onClick={handleSaveAddIngredient} disabled={addIngSaving}>
                      {addIngSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                      {t("pages.ingredients.saveIngredient")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={editIngredientOpen} onOpenChange={(o) => { setEditIngredientOpen(o); if (!o) setEditIngredient(null) }}>
                <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{t("pages.ingredients.editIngredient")}</DialogTitle>
                    <p className="text-sm text-muted-foreground">
                      {editIngredient && `${t("pages.ingredients.ingredient")}: ${editIngredient.name}`}
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
                  toast.success(t("pages.ingredients.fileDownloaded"))
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
                placeholder={t("pages.ingredients.searchPlaceholder")}
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
                  <SelectItem key={sup} value={sup}>{sup === "כל הספקים" ? t("pages.ingredients.allSuppliers") : sup === "מתכון מורכב" ? t("pages.ingredients.compoundRecipe") : sup}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder={t("pages.ingredients.stockStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pages.ingredients.allStock")}</SelectItem>
                <SelectItem value="low">{t("pages.ingredients.lowStockLabel")}</SelectItem>
                <SelectItem value="zero">{t("pages.ingredients.stockOut")}</SelectItem>
                <SelectItem value="ok">{t("pages.ingredients.stockOk")}</SelectItem>
              </SelectContent>
            </Select>
            {isOwner && (
              <Select value={priceSourceFilter} onValueChange={(v) => setPriceSourceFilter(v as "all" | "mine" | "market")}>
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue placeholder={t("pages.ingredients.priceSource")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("pages.ingredients.allPrices")}</SelectItem>
                  <SelectItem value="mine">{t("pages.ingredients.myPrice")}</SelectItem>
                  <SelectItem value="market">{t("pages.ingredients.marketPrice")}</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 shrink-0"
              title={t("pages.ingredients.rowDensity")}
              onClick={() => setRowDensityAndStore(rowDensity === "compact" ? "normal" : rowDensity === "normal" ? "expanded" : "compact")}
            >
              {rowDensity === "compact" ? <Rows2 className="w-4 h-4" /> : rowDensity === "expanded" ? <Rows4 className="w-4 h-4" /> : <Rows3 className="w-4 h-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0" title={t("pages.ingredients.tableDisplay")}>
                  <Columns3 className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[180px]">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{t("pages.ingredients.rowDensity")}</div>
                {(["compact", "normal", "expanded"] as RowDensity[]).map((d) => (
                  <DropdownMenuCheckboxItem key={d} checked={rowDensity === d} onCheckedChange={() => setRowDensityAndStore(d)}>
                    {d === "compact" ? t("pages.ingredients.densityCompact") : d === "expanded" ? t("pages.ingredients.densityExpanded") : t("pages.ingredients.densityNormal")}
                  </DropdownMenuCheckboxItem>
                ))}
                <div className="border-t my-1" />
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{t("pages.ingredients.showHideColumns")}</div>
                {defaultColumnOrder.filter((k) => (k !== "source" && k !== "actions") || isOwner).map((k) => {
                  const isVisible = columnVisibility[k] !== false
                  const colLabels: Record<string, string> = {
                    name: t("pages.ingredients.ingredientName"),
                    price: t("pages.ingredients.price"),
                    source: t("pages.ingredients.source"),
                    unit: t("pages.ingredients.unit"),
                    waste: t("pages.ingredients.waste"),
                    stock: t("pages.ingredients.stock"),
                    minStock: t("pages.ingredients.minStockLabel"),
                    supplier: t("pages.ingredients.supplier"),
                    sku: t("pages.ingredients.sku"),
                    status: t("pages.ingredients.stockStatus"),
                    actions: t("pages.adminPanel.actions") || "פעולות",
                  }
                  const label = colLabels[k] || k
                  return (
                    <DropdownMenuCheckboxItem key={k} checked={isVisible} onCheckedChange={() => toggleColumnVisibility(k)}>
                      {label}
                    </DropdownMenuCheckboxItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto" dir="rtl">
            <Table>
              <TableHeader>
                <TableRow>
                  {displayColumnOrder.map((key, colIndex) => {
                    const labels: Record<string, string> = {
                      name: t("pages.ingredients.ingredientName"),
                      price: t("pages.ingredients.price"),
                      source: t("pages.ingredients.source"),
                      unit: t("pages.ingredients.unit"),
                      waste: t("pages.ingredients.waste"),
                      stock: t("pages.ingredients.stock"),
                      minStock: t("pages.ingredients.minStockLabel"),
                      supplier: t("pages.ingredients.supplier"),
                      sku: t("pages.ingredients.sku"),
                      status: t("pages.ingredients.stockStatus"),
                      actions: t("pages.adminPanel.actions"),
                    }
                    const sortKeys: Record<string, string> = {
                      name: "name",
                      price: "price_asc",
                      unit: "unit",
                      waste: "waste_asc",
                      stock: "stock_asc",
                      minStock: "minStock_asc",
                      supplier: "supplier",
                      sku: "sku",
                      status: "status",
                    }
                    const isSortable = key in sortKeys
                    const sortKey = sortKeys[key]
                    return (
                      <TableHead
                        key={key}
                        className={cn("text-right", densityCellClass, isSortable && "cursor-pointer hover:bg-muted/50 select-none")}
                        draggable
                        title={t("pages.ingredients.dragToReorderColumns")}
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(colIndex)); e.dataTransfer.effectAllowed = "move" }}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move" }}
                        onDrop={(e) => {
                          e.preventDefault()
                          const from = parseInt(e.dataTransfer.getData("text/plain"), 10)
                          if (!isNaN(from)) handleColumnReorder(from, colIndex)
                        }}
                        onClick={() => {
                          if (!isSortable) return
                          if (key === "name") setSortBy((s) => (s === "name" ? "name_desc" : "name"))
                          else if (key === "price") setSortBy((s) => (s === "price_asc" ? "price_desc" : "price_asc"))
                          else if (key === "waste") setSortBy((s) => (s === "waste_asc" ? "waste_desc" : "waste_asc"))
                          else if (key === "stock") setSortBy((s) => (s === "stock_asc" ? "stock_desc" : "stock_asc"))
                          else if (key === "minStock") setSortBy((s) => (s === "minStock_asc" ? "minStock_desc" : "minStock_asc"))
                          else setSortBy(sortKey)
                        }}
                      >
                        <span className="flex items-center justify-end gap-1">
                          <GripVertical className="w-3 h-3 text-muted-foreground/60 cursor-grab active:cursor-grabbing shrink-0" />
                          {labels[key] || key}
                          {key === "name" && (sortBy === "name" || sortBy === "name_desc") && (sortBy === "name" ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />)}
                          {key === "price" && (sortBy === "price_asc" || sortBy === "price_desc") && (sortBy === "price_desc" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />)}
                          {key === "waste" && (sortBy === "waste_asc" || sortBy === "waste_desc") && (sortBy === "waste_desc" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />)}
                          {key === "stock" && (sortBy === "stock_asc" || sortBy === "stock_desc") && (sortBy === "stock_desc" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />)}
                          {key === "minStock" && (sortBy === "minStock_asc" || sortBy === "minStock_desc") && (sortBy === "minStock_desc" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />)}
                          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); toggleColumnVisibility(key) }} title={t("pages.ingredients.hideColumn")}>
                            <EyeOff className="w-3 h-3" />
                          </Button>
                        </span>
                      </TableHead>
                    )
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIngredients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={displayColumnOrder.length} className="text-center py-8 text-muted-foreground">
                      אין רכיבים. הוסף רכיבים דרך העלאה או עץ מוצר.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredIngredients.map((ingredient, index) => {
                    const isCompound = "isCompound" in ingredient && ingredient.isCompound
                    const stockStatus = isCompound ? { status: "מתכון", color: "bg-primary/10 text-primary", icon: ChefHat } : getStockStatus(ingredient)
                    const StatusIcon = stockStatus.icon
                    const colSpan = displayColumnOrder.length
                    const cellByKey: Record<string, React.ReactNode> = {
                      name: <TableCell key="name" className={cn("font-medium text-right", densityCellClass)}>{isCompound && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded ml-1">🧪 מתכון</span>}{ingredient.name}</TableCell>,
                      price: <TableCell key="price" className={cn("text-right font-semibold", densityCellClass)}>{isCompound ? "—" : `${ingredient.price} ש"ח`}</TableCell>,
                      source: <TableCell key="source" className={cn("text-right", densityCellClass)}>{isCompound ? "—" : (ingredient.priceSource === "market" ? <Badge variant="secondary" className="text-xs whitespace-nowrap">מחיר שוק</Badge> : <Badge variant="outline" className="text-xs whitespace-nowrap">מחיר שלי</Badge>)}</TableCell>,
                      unit: <TableCell key="unit" className={cn("text-right", densityCellClass)}>{ingredient.unit}</TableCell>,
                      waste: <TableCell key="waste" className={cn("text-right", densityCellClass)}>{isCompound ? "—" : `${ingredient.waste}%`}</TableCell>,
                      stock: <TableCell key="stock" className={cn("text-right font-semibold", densityCellClass)}>{isCompound ? "—" : ingredient.stock}</TableCell>,
                      minStock: <TableCell key="minStock" className={cn("text-right text-muted-foreground", densityCellClass)}>{isCompound ? "—" : ingredient.minStock}</TableCell>,
                      supplier: <TableCell key="supplier" className={cn("text-right", densityCellClass)}><Badge variant="outline">{ingredient.supplier || "—"}</Badge></TableCell>,
                      sku: <TableCell key="sku" className={cn("text-right text-muted-foreground text-sm", densityCellClass)}>{ingredient.sku || "—"}</TableCell>,
                      status: <TableCell key="status" className={cn("text-right", densityCellClass)}><Badge className={stockStatus.color}><StatusIcon className="w-3 h-3 ml-1" />{stockStatus.status}</Badge></TableCell>,
                      actions: <TableCell key="actions" className={cn("text-right", densityCellClass)}>
                        <div className="flex gap-1 justify-end">
                          {!isCompound && (
                            <Button size="sm" variant="ghost" onClick={() => openEditIngredient(ingredient)} className="h-8 w-8 p-0" title="ערוך רכיב">
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => isCompound ? handleDeleteCompoundRecipe(ingredient.name) : handleDeleteIngredient(ingredient)} className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" title={isCompound ? "מחק מתכון" : "מחק רכיב"} disabled={deletingIngredientId === ingredient.id}>
                            {deletingIngredientId === ingredient.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </Button>
                        </div>
                      </TableCell>,
                    }
                    return (
                      <React.Fragment key={ingredient.id}>
                      <motion.tr
                        key={ingredient.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className={cn("hover:bg-muted/50", isCompound && "bg-primary/5")}
                      >
                        {displayColumnOrder.map((k) => cellByKey[k] ? <React.Fragment key={k}>{cellByKey[k]}</React.Fragment> : null)}
                      </motion.tr>
                      {isOwner && !isCompound && (
                        <TableRow className="bg-muted/30 hover:bg-muted/40">
                          <TableCell colSpan={displayColumnOrder.length} className="py-1.5 pr-4 text-right">
                            <CheapestPricePopover
                              ingredient={ingredient}
                              webPrice={webPriceByIngredient[ingredient.name]}
                              onFetchWebPrice={() => fetchWebPrice(ingredient.name)}
                              webPriceLoading={webPriceLoading === ingredient.name}
                              pricePerKgFn={pricePerKg}
                              t={t}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
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
