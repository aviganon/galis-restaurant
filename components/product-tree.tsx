"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Search, Plus, FileSpreadsheet, Copy, Camera, Trash2, ChevronDown, 
  ChevronUp, X, Edit2, MoreVertical, Filter, SortAsc, SortDesc,
  Package, Utensils, DollarSign, TrendingUp, TrendingDown, ImageIcon, AlertTriangle,
  CheckCircle2, Info, ChefHat, Scale, Percent, Sparkles, BarChart2, BarChart3, Loader2, LayoutDashboard,
  Truck, Leaf,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Ingredients } from "@/components/ingredients"
import { MenuCosts } from "@/components/menu-costs"
import SuppliersComp from "@/components/suppliers"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { doc, collection, getDocs, getDoc, setDoc, deleteDoc, writeBatch } from "firebase/firestore"
import { db, storage } from "@/lib/firebase"
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage"
import { useApp } from "@/contexts/app-context"
import { FilePreviewModal } from "@/components/file-preview-modal"
import { Dashboard } from "@/components/dashboard"
import { Reports } from "@/components/reports"
import { suggestDishFromIngredients, type ExtractedDishItem } from "@/lib/ai-extract"
import { loadGlobalPriceSubdocsMap, pickGlobalIngredientRowFromAssigned } from "@/lib/ingredient-assigned-price"
import { normalizeDishCategoryToHebrew } from "@/lib/dish-category-hebrew"
import { toast } from "sonner"
import { useTranslations } from "@/lib/use-translations"
import { useLanguage } from "@/contexts/language-context"

// Types
interface Ingredient {
  name: string
  qty: number
  unit: string
  waste: number
  isSubRecipe?: boolean
}

interface Dish {
  name: string
  category: string
  sellingPrice: number
  ingredients: Ingredient[]
  isCompound?: boolean
  portions?: number
  yieldQty?: number
  yieldUnit?: string
  imageUrl?: string
  /** תיאור קצר מה-AI או ידני */
  recipeDescription?: string
  /** שלבי הכנה / מתכון מלא */
  preparationNotes?: string
}

/** Firestore דוחה ערכי undefined — מסיר שדות ברמה העליונה לפני set/batch */
function dishToFirestoreData(dish: Dish): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({ ...dish, isCompound: dish.isCompound ?? false }).filter(([, v]) => v !== undefined)
  )
}

interface SupplierPrice {
  name: string
  price: number
  prev: number
  unit: string
  supplier: string
}

const VAT_RATE = 1.17
const CATEGORIES = ["עיקריות", "ראשונות", "סלטים", "קינוחים", "משקאות", "משקאות אלכוהוליים", "תוספות", "אחר"]
const UNITS = ["גרם", "קג", 'ק"ג', "מל", "ליטר", "יחידה", "מנה", "כף", "כפית", "חבילה"]

// נרמול יחידה — מחזיר ערך תקין מתוך UNITS (למניעת קריסת Select כש-unit לא ברשימה)
const normalizeUnit = (u: string | undefined): string => {
  if (!u) return "גרם"
  const found = UNITS.find((x) => x === u)
  if (found) return found
  if (u === 'ק"ג' || u === "קג") return 'ק"ג'
  return "גרם"
}

const isOwnerRole = (role: string, isSystemOwner?: boolean) => isSystemOwner || role === "owner"
const CATEGORY_TO_KEY: Record<string, string> = {
  "עיקריות": "mainDishes",
  "ראשונות": "starters",
  "סלטים": "salads",
  "קינוחים": "desserts",
  "משקאות": "drinks",
  "משקאות אלכוהוליים": "alcoholicDrinks",
  "תוספות": "sides",
  "אחר": "other",
}
export default function ProductTree() {
  const [ingredientsModalOpen, setIngredientsModalOpen] = useState(false)
  const [suppliersModalOpen, setSuppliersModalOpen] = useState(false)
  const [dishImages, setDishImages] = useState<Record<string,string>>({})
  const [loadedDishImages, setLoadedDishImages] = useState<Set<string>>(new Set())
  const [editDishDialogOpen, setEditDishDialogOpen] = useState(false)
  const [editDishTarget, setEditDishTarget] = useState<string|null>(null)
  const [editDishName, setEditDishName] = useState("")
  const [editDishCategory, setEditDishCategory] = useState("")
  const [editDishImgFile, setEditDishImgFile] = useState<File|null>(null)
  const [savingDishEdit, setSavingDishEdit] = useState(false)
  const editDishImgInputRef = useRef<HTMLInputElement>(null)
  const t = useTranslations()
  const { dir } = useLanguage()
  const isRtl = dir === "rtl"
  const { currentRestaurantId, userRole, userPermissions, isSystemOwner, refreshIngredientsKey, refreshIngredients } = useApp()
  const canSeeCosts = userRole === "owner" || userRole === "admin" || userRole === "manager" || !!userPermissions?.canSeeCosts
  const hasFullMenu = isSystemOwner || userRole === "owner" || userRole === "admin" || userRole === "manager"
  const canSeeDashboardContent = hasFullMenu || userPermissions?.canSeeDashboard !== false
  const canSeeReportsContent = hasFullMenu || !!userPermissions?.canSeeReports
  const canOpenProductDashboardModal = canSeeDashboardContent || canSeeReportsContent
  const isOwner = isOwnerRole(userRole, isSystemOwner)
  const [dishes, setDishes] = useState<Record<string, Dish>>({})
  const [supplierPrices, setSupplierPrices] = useState<Record<string, SupplierPrice>>({})
  const [loading, setLoading] = useState(true)
  const [selectedDish, setSelectedDish] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [sortMode, setSortMode] = useState<"name" | "cost_asc" | "cost_desc" | "price_desc">("name")
  const [targetFoodCost, setTargetFoodCost] = useState(30)
  const [isAddDishModalOpen, setIsAddDishModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isAiSuggestOpen, setIsAiSuggestOpen] = useState(false)
  const [showMenuCosts, setShowMenuCosts] = useState(false)
  const [dashboardModalOpen, setDashboardModalOpen] = useState(false)
  const [dashboardModalTab, setDashboardModalTab] = useState<"dashboard" | "reports">("dashboard")
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false)
  const [aiSuggestedDish, setAiSuggestedDish] = useState<ExtractedDishItem | null>(null)
  const [ingredientStock, setIngredientStock] = useState<Record<string, number>>({})
  const [importFile, setImportFile] = useState<File | null>(null)
  const [fpmOpen, setFpmOpen] = useState(false)
  const importFileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [isCostPanelExpanded, setIsCostPanelExpanded] = useState(true)
  /** סרגל לוח בקרה / עלויות תפריט / AI — ניתן להסתיר; העדפה נשמרת במכשיר */
  const [menuToolsOpen, setMenuToolsOpen] = useState(true)
  const [editingDish, setEditingDish] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem("product-tree-menu-tools-open")
      if (raw === "false") setMenuToolsOpen(false)
    } catch {
      /* ignore */
    }
  }, [])

  const toggleMenuTools = useCallback(() => {
    setMenuToolsOpen((prev) => {
      const next = !prev
      try {
        localStorage.setItem("product-tree-menu-tools-open", String(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const [headerToolsHost, setHeaderToolsHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const el = document.getElementById("product-tree-header-tools-root")
    setHeaderToolsHost(el)
  }, [])
  
  // New dish form state
  const [newDishName, setNewDishName] = useState("")
  const [newDishCategory, setNewDishCategory] = useState("עיקריות")
  const [newDishPrice, setNewDishPrice] = useState(0)
  
  // Add ingredient form state
  const [addIngredientSearch, setAddIngredientSearch] = useState("")
  const [showIngredientDropdown, setShowIngredientDropdown] = useState(false)
  const [selectedIngredient, setSelectedIngredient] = useState<string | null>(null)
  const [selectedIngredientType, setSelectedIngredientType] = useState<"simple" | "compound">("simple")
  const [addIngredientQty, setAddIngredientQty] = useState(1)
  const [addIngredientUnit, setAddIngredientUnit] = useState("גרם")
  const [addIngredientWaste, setAddIngredientWaste] = useState(0)

  // Load recipes and ingredients from Firestore
  // מנהל: רק המסעדה שלו. בעלים: קטלוג גלובלי + assignedSuppliers + overlay מסעדה
  useEffect(() => {
    if (!currentRestaurantId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const load = async () => {
      try {
        const [recSnap, restIngSnap, asDoc, globalIngSnap] = await Promise.all([
          getDocs(collection(db, "restaurants", currentRestaurantId, "recipes")),
          getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients")),
          getDoc(doc(db, "restaurants", currentRestaurantId, "appState", "assignedSuppliers")),
          getDocs(collection(db, "ingredients")),
        ])
        const assignedList: string[] = Array.isArray(asDoc.data()?.list) ? asDoc.data()!.list : []
        const subPricesByIngredient =
          assignedList.length > 0 ? await loadGlobalPriceSubdocsMap(db) : new Map()

        const newDishes: Record<string, Dish> = {}
        recSnap.forEach((d) => {
          const data = d.data()
          const ing = Array.isArray(data.ingredients) ? data.ingredients : []
          const displayName =
            typeof data.name === "string" && data.name.trim() ? data.name.trim() : d.id
          newDishes[d.id] = {
            name: displayName,
            category: normalizeDishCategoryToHebrew(
              typeof data.category === "string" ? data.category : "עיקריות"
            ),
            sellingPrice: typeof data.sellingPrice === "number" ? data.sellingPrice : 0,
            ingredients: ing.map((i: { name?: string; qty?: number; unit?: string; waste?: number; isSubRecipe?: boolean }) => ({
              name: i.name || "",
              qty: i.qty || 0,
              unit: i.unit || "גרם",
              waste: i.waste || 0,
              isSubRecipe: !!i.isSubRecipe,
            })),
            isCompound: !!data.isCompound,
            yieldQty: typeof data.yieldQty === "number" ? data.yieldQty : 1,
            yieldUnit: (data.yieldUnit as string) || "מנה",
            imageUrl: (data.imageUrl as string) || undefined,
            recipeDescription: typeof data.recipeDescription === "string" ? data.recipeDescription : undefined,
            preparationNotes: typeof data.preparationNotes === "string" ? data.preparationNotes : undefined,
          }
        })

        const newPrices: Record<string, SupplierPrice> = {}
        const newStock: Record<string, number> = {}
        const mergePrice = (name: string, data: { price?: number; unit?: string; supplier?: string; stock?: number }) => {
          const p = typeof data.price === "number" ? data.price : 0
          if (!newPrices[name]) newPrices[name] = { name, price: p, prev: p, unit: "קג", supplier: "" }
          newPrices[name].price = p
          if (data.unit) newPrices[name].unit = data.unit
          if (data.supplier) newPrices[name].supplier = data.supplier
          if (typeof data.stock === "number") newStock[name] = data.stock
        }

        type IngData = { price?: number; unit?: string; supplier?: string; stock?: number }
        // בעלים ומנהלים: מכבדים assignedSuppliers — מחיר מספק ששויך **אחרון** לרשימה (כשיש כמה ספקים לאותו רכיב)
        if (assignedList.length > 0) {
          globalIngSnap.forEach((d) => {
            const data = d.data() as IngData
            const picked = pickGlobalIngredientRowFromAssigned(assignedList, data, subPricesByIngredient.get(d.id))
            if (picked) mergePrice(d.id, { ...picked, stock: typeof data.stock === "number" ? data.stock : undefined })
          })
        }
        restIngSnap.forEach((d) => mergePrice(d.id, d.data() as IngData))

        const imgs: Record<string,string> = {}
        Object.entries(newDishes).forEach(([n,d])=>{ if(d.imageUrl) imgs[n]=d.imageUrl })
        setDishImages(imgs)
        Object.entries(imgs).forEach(([name, url]) => {
          const img = new window.Image()
          img.onload = () => setLoadedDishImages(prev => { const s = new Set(prev); s.add(name); return s })
          img.src = url
        })
        setDishes(newDishes)
        setSelectedDish(prev => (prev && newDishes[prev] ? prev : Object.keys(newDishes)[0] || null))
        setSupplierPrices(newPrices)
        setIngredientStock(newStock)
      } catch (e) {
        console.error("load recipes/ingredients:", e)
        toast.error("שגיאה בטעינת עץ מוצר")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentRestaurantId, isOwner, refreshIngredientsKey])

  const saveTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  useEffect(() => () => {
    Object.values(saveTimeoutsRef.current).forEach(clearTimeout)
    saveTimeoutsRef.current = {}
  }, [])

  const saveDishToFirestore = useCallback(
    async (name: string, dish: Dish | null) => {
      if (!currentRestaurantId) return
      try {
        const ref = doc(db, "restaurants", currentRestaurantId, "recipes", name)
        if (dish) {
          await setDoc(ref, dishToFirestoreData(dish), { merge: true })
        } else {
          await deleteDoc(ref)
        }
        refreshIngredients?.()
      } catch (e) {
        toast.error(t("pages.productTree.saveError") + ": " + (e as Error).message)
      }
    },
    [currentRestaurantId, refreshIngredients, t]
  )

  const debouncedSaveDish = useCallback(
    (name: string, dish: Dish | null) => {
      if (saveTimeoutsRef.current[name]) clearTimeout(saveTimeoutsRef.current[name])
      saveTimeoutsRef.current[name] = setTimeout(() => {
        delete saveTimeoutsRef.current[name]
        saveDishToFirestore(name, dish)
      }, 400)
    },
    [saveDishToFirestore]
  )

  // Cost per unit for an ingredient (recursive for compounds)
  const calculateDeepCost = useCallback((itemName: string, isSubRecipe: boolean): number => {
    if (!isSubRecipe) {
      const sp = supplierPrices[itemName]
      if (!sp) return 0
      return sp.price
    }
    const recipe = dishes[itemName]
    if (!recipe || !recipe.ingredients?.length) return 0
    const yieldQty = recipe.yieldQty ?? 1
    let totalSubCost = 0
    recipe.ingredients.forEach((sub) => {
      const basePrice = calculateDeepCost(sub.name, !!sub.isSubRecipe)
      const wasteFactor = sub.isSubRecipe ? 1 : 1 + (sub.waste || 0) / 100
      totalSubCost += basePrice * (sub.qty || 0) * wasteFactor
    })
    return totalSubCost / yieldQty
  }, [supplierPrices, dishes])

  // Calculate ingredient cost
  const calcIngredientCost = useCallback((name: string, qty: number, waste: number, unit: string, isSubRecipe?: boolean): number => {
    if (isSubRecipe) {
      const unitPrice = calculateDeepCost(name, true)
      return unitPrice * qty
    }
    const sp = supplierPrices[name]
    if (!sp) return 0
    let multiplier = 1
    const spUnit = sp.unit || ""
    if ((spUnit === "קג" || spUnit === 'ק"ג') && unit === "גרם") multiplier = 0.001
    else if (spUnit === "ליטר" && unit === "מל") multiplier = 0.001
    else if (sp.unit === "30 יח'" && unit === "יחידה") multiplier = 1 / 30
    return qty * sp.price * multiplier * (1 + waste / 100)
  }, [supplierPrices, calculateDeepCost])

  // Calculate dish cost
  const calcDishCost = useCallback((dishName: string): number => {
    const dish = dishes[dishName]
    if (!dish || !dish.ingredients) return 0
    return dish.ingredients.reduce((sum, ing) =>
      sum + calcIngredientCost(ing.name, ing.qty, ing.waste, ing.unit, ing.isSubRecipe), 0)
  }, [dishes, calcIngredientCost])

  // Calculate food cost percentage
  const calcFoodCostPct = useCallback((dishName: string): number => {
    const cost = calcDishCost(dishName)
    const dish = dishes[dishName]
    const price = (dish?.sellingPrice || 0) / VAT_RATE
    return price > 0 ? (cost / price * 100) : 0
  }, [dishes, calcDishCost])

  // Get status color based on food cost
  const getStatusColor = (pct: number) => {
    if (pct === 0) return { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" }
    if (pct <= targetFoodCost) return { bg: "bg-emerald-500/10", text: "text-emerald-600", border: "border-emerald-500/30" }
    if (pct <= targetFoodCost * 1.27) return { bg: "bg-amber-500/10", text: "text-amber-600", border: "border-amber-500/30" }
    return { bg: "bg-red-500/10", text: "text-red-600", border: "border-red-500/30" }
  }

  // Filtered and sorted dishes
  const filteredDishes = useMemo(() => {
    let names = Object.keys(dishes).filter(n => !dishes[n].isCompound)
    
    if (searchQuery) {
      names = names.filter(n => n.includes(searchQuery))
    }
    if (categoryFilter && categoryFilter !== "all") {
      names = names.filter(n => dishes[n].category === categoryFilter)
    }
    
    switch (sortMode) {
      case "cost_asc":
        names.sort((a, b) => calcFoodCostPct(a) - calcFoodCostPct(b))
        break
      case "cost_desc":
        names.sort((a, b) => calcFoodCostPct(b) - calcFoodCostPct(a))
        break
      case "price_desc":
        names.sort((a, b) => (dishes[b].sellingPrice || 0) - (dishes[a].sellingPrice || 0))
        break
      default:
        names.sort((a, b) => a.localeCompare(b, "he"))
    }
    
    return names
  }, [dishes, searchQuery, categoryFilter, sortMode, calcFoodCostPct])

  // Filtered ingredients for dropdown (simple + compound recipes)
  const filteredIngredients = useMemo(() => {
    const empty = { simple: [] as string[], compound: [] as string[] }
    if (!addIngredientSearch) return empty
    const q = addIngredientSearch.toLowerCase()
    const simple = Object.keys(supplierPrices || {}).filter(n => n.toLowerCase().includes(q)).slice(0, 12)
    const compound = Object.keys(dishes || {})
      .filter(n => dishes[n]?.isCompound && n !== selectedDish && n.toLowerCase().includes(q))
      .slice(0, 5)
    return { simple, compound }
  }, [supplierPrices, dishes, addIngredientSearch, selectedDish])

  // Current dish calculations
  const currentDish = selectedDish ? dishes[selectedDish] : null
  const currentCost = selectedDish ? calcDishCost(selectedDish) : 0
  const currentPct = selectedDish ? calcFoodCostPct(selectedDish) : 0
  const currentPriceBeforeVat = currentDish ? currentDish.sellingPrice / VAT_RATE : 0
  const currentProfit = currentPriceBeforeVat - currentCost
  const currentMargin = currentPriceBeforeVat > 0 ? (currentProfit / currentPriceBeforeVat * 100) : 0

  // Update selling price
  const updateSellingPrice = (price: number) => {
    if (!selectedDish) return
    setDishes(prev => {
      const next = { ...prev, [selectedDish]: { ...prev[selectedDish], sellingPrice: price } }
      debouncedSaveDish(selectedDish, next[selectedDish])
      return next
    })
  }

  // Update ingredient
  const updateIngredient = (index: number, field: keyof Ingredient, value: number | string) => {
    if (!selectedDish) return
    setDishes(prev => {
      const dish = { ...prev[selectedDish] }
      const ingredients = [...dish.ingredients]
      ingredients[index] = { ...ingredients[index], [field]: value }
      const next = { ...prev, [selectedDish]: { ...dish, ingredients } }
      debouncedSaveDish(selectedDish, next[selectedDish])
      return next
    })
  }

  // Remove ingredient
  const removeIngredient = (index: number) => {
    if (!selectedDish) return
    setDishes(prev => {
      const dish = { ...prev[selectedDish] }
      const ingredients = dish.ingredients.filter((_, i) => i !== index)
      const next = { ...prev, [selectedDish]: { ...dish, ingredients } }
      debouncedSaveDish(selectedDish, next[selectedDish])
      return next
    })
  }

  // Add ingredient
  const addIngredient = () => {
    if (!selectedDish || !selectedIngredient) return
    const isCompound = selectedIngredientType === "compound"
    const unit = normalizeUnit(addIngredientUnit)
    setDishes(prev => {
      const dish = prev[selectedDish]
      if (!dish) return prev
      const ingredients = [...(dish.ingredients || []), {
        name: selectedIngredient,
        qty: addIngredientQty ?? 0,
        unit,
        waste: isCompound ? 0 : (addIngredientWaste ?? 0),
        isSubRecipe: isCompound,
      }]
      const next = { ...prev, [selectedDish]: { ...dish, ingredients } }
      debouncedSaveDish(selectedDish, next[selectedDish])
      return next
    })
    setSelectedIngredient(null)
    setSelectedIngredientType("simple")
    setAddIngredientSearch("")
    setAddIngredientQty(isCompound ? 1 : 100)
    setAddIngredientUnit(isCompound ? "מנה" : "גרם")
    setAddIngredientWaste(0)
  }

  // Add new dish
  const addNewDish = () => {
    if (!newDishName.trim()) return
    const newDish: Dish = {
      name: newDishName,
      category: newDishCategory,
      sellingPrice: newDishPrice,
      ingredients: [],
      isCompound: false,
      yieldQty: 1,
      yieldUnit: "מנה",
    }
    setDishes(prev => {
      const next = { ...prev, [newDishName]: newDish }
      debouncedSaveDish(newDishName, next[newDishName])
      return next
    })
    setSelectedDish(newDishName)
    setIsAddDishModalOpen(false)
    setNewDishName("")
    setNewDishPrice(79)
    setNewDishCategory("עיקריות")
  }

  const openImportFpm = useCallback((file: File) => {
    setImportFile(file)
    setIsImportModalOpen(false)
    setFpmOpen(true)
  }, [])

  const handleImportFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files?.length) return
      openImportFpm(files[0])
      e.target.value = ""
    },
    [openImportFpm]
  )

  const handleImportDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const files = e.dataTransfer.files
      if (files?.length) openImportFpm(files[0])
    },
    [openImportFpm]
  )

  const handleAiSuggest = useCallback(async () => {
    const list = Object.entries(supplierPrices).map(([name, sp]) => ({
      name,
      price: sp.price,
      unit: sp.unit || "קג",
      supplier: sp.supplier || undefined,
      stock: ingredientStock[name],
    }))
    if (list.length === 0) {
      toast.error(t("pages.productTree.noIngredientsAddFromSuppliers"))
      return
    }
    setAiSuggestLoading(true)
    setAiSuggestedDish(null)
    setIsAiSuggestOpen(true)
    try {
      const suggested = await suggestDishFromIngredients(list)
      if (suggested) {
        setAiSuggestedDish(suggested)
      } else {
        toast.error("לא הצלחתי להציע מתכון — נסה שוב")
        setIsAiSuggestOpen(false)
      }
    } catch (e) {
      toast.error((e as Error)?.message || t("pages.productTree.suggestError"))
      setIsAiSuggestOpen(false)
    } finally {
      setAiSuggestLoading(false)
    }
  }, [supplierPrices, ingredientStock, t])

  const handleAddAiSuggestedDish = useCallback(() => {
    if (!aiSuggestedDish?.name?.trim()) return
    const ingredients: Ingredient[] = (aiSuggestedDish.ingredients || []).map((ing) => ({
      name: ing.name,
      qty: ing.qty,
      unit: ing.unit || "גרם",
      waste: 0,
    }))
    const dish: Dish = {
      name: aiSuggestedDish.name.trim(),
      category: normalizeDishCategoryToHebrew(aiSuggestedDish.category || "עיקריות"),
      sellingPrice: aiSuggestedDish.price || 0,
      ingredients,
      isCompound: false,
      yieldQty: 1,
      yieldUnit: "מנה",
      recipeDescription: aiSuggestedDish.description?.trim() || undefined,
      preparationNotes: aiSuggestedDish.preparation?.trim() || undefined,
    }
    saveDishToFirestore(aiSuggestedDish.name.trim(), dish)
    setDishes((prev) => ({ ...prev, [aiSuggestedDish.name.trim()]: dish }))
    setSelectedDish(aiSuggestedDish.name.trim())
    setAiSuggestedDish(null)
    setIsAiSuggestOpen(false)
    toast.success(`המנה "${aiSuggestedDish.name}" נוספה — ניתן לערוך`)
  }, [aiSuggestedDish, saveDishToFirestore])

  const handleConfirmDishes = useCallback(async (items: ExtractedDishItem[]) => {
    const next: Record<string, Dish> = { ...dishes }
    const toSave: { name: string; dish: Dish }[] = []
    items.forEach((it) => {
      if (!it.name?.trim()) return
      const ingredients: Ingredient[] = (it.ingredients || []).map((ing) => ({
        name: ing.name,
        qty: ing.qty,
        unit: ing.unit || "גרם",
        waste: 0,
      }))
      const dish: Dish = {
        name: it.name.trim(),
        category: normalizeDishCategoryToHebrew(it.category || "עיקריות"),
        sellingPrice: it.price || 0,
        ingredients,
        recipeDescription: it.description?.trim() || undefined,
        preparationNotes: it.preparation?.trim() || undefined,
      }
      next[it.name.trim()] = dish
      toSave.push({ name: it.name.trim(), dish })
    })
    setDishes(next)

    if (currentRestaurantId && toSave.length > 0) {
      try {
        const batch = writeBatch(db)
        toSave.forEach(({ name, dish }) => {
          batch.set(
            doc(db, "restaurants", currentRestaurantId, "recipes", name),
            dishToFirestoreData({ ...dish, isCompound: false }),
            { merge: true }
          )
        })
        await batch.commit()
      } catch (e) {
        toast.error("שגיאה בשמירה ל-Firestore: " + (e as Error).message)
      }
    }

    toast.success(`${items.length} מנות יובאו בהצלחה`)
    setImportFile(null)
    setFpmOpen(false)
  }, [dishes, currentRestaurantId])

  // Delete dish
  const deleteDish = (name: string) => {
    saveDishToFirestore(name, null)
    setDishes(prev => {
      const next = { ...prev }
      delete next[name]
      return next
    })
    if (selectedDish === name) {
      setSelectedDish(Object.keys(dishes).find(n => n !== name) || null)
    }
  }

  // Duplicate dish
  const duplicateDish = (name: string) => {
    const src = dishes[name]
    if (!src) return
    let newName = `${name} (עותק)`
    let i = 1
    while (dishes[newName]) {
      i++
      newName = `${name} (עותק ${i})`
    }
    const copy: Dish = { ...src, ingredients: src.ingredients.map(ing => ({ ...ing })) }
    saveDishToFirestore(newName, copy)
    setDishes(prev => ({ ...prev, [newName]: copy }))
    setSelectedDish(newName)
    toast.success(`המנה ${newName} נוספה`)
  }

  const openDishEditDialog = (name: string) => {
    const dish = dishes[name]; if (!dish) return
    setEditDishTarget(name); setEditDishName(name)
    setEditDishCategory(dish.category || "עיקריות")
    setEditDishImgFile(null); setEditDishDialogOpen(true)
  }
  const handleSaveDishEdit = async () => {
    if (!currentRestaurantId || !editDishTarget) return
    setSavingDishEdit(true)
    try {
      const dish = dishes[editDishTarget]; if (!dish) return
      let imgUrl = dishImages[editDishTarget] || undefined
      if (editDishImgFile) {
        const safe = editDishTarget.replace(/[^a-zA-Z0-9]/g,'_')
        const sRef = storageRef(storage, 'restaurants/'+currentRestaurantId+'/dishes/'+safe+'/cover.jpg')
        await new Promise((res,rej) => {
          const task = uploadBytesResumable(sRef, editDishImgFile)
          task.on('state_changed',()=>{},rej,async()=>{ imgUrl=await getDownloadURL(sRef); res(undefined) })
        })
        if(imgUrl) {
        setDishImages(prev=>({...prev,[editDishTarget]:imgUrl!}))
        const img = new window.Image()
        img.onload = () => setLoadedDishImages(prev => { const s = new Set(prev); s.add(editDishTarget); return s })
        img.src = imgUrl!
      }
      }
      const newName = (editDishName||'').trim() || editDishTarget
      const updatedDish = {...dish, name:newName, category:editDishCategory, ...(imgUrl?{imageUrl:imgUrl}:{})}
      const clean = dishToFirestoreData(updatedDish)
      if (newName !== editDishTarget) {
        await setDoc(doc(db,'restaurants',currentRestaurantId,'recipes',newName), clean, {merge:true})
        await deleteDoc(doc(db,'restaurants',currentRestaurantId,'recipes',editDishTarget))
        setDishes(prev=>{ const n={...prev}; delete n[editDishTarget]; n[newName]=updatedDish; return n })
        if(selectedDish===editDishTarget) setSelectedDish(newName)
      } else {
        await setDoc(doc(db,'restaurants',currentRestaurantId,'recipes',editDishTarget), clean, {merge:true})
        setDishes(prev=>({...prev,[editDishTarget]:updatedDish}))
      }
      toast.success('המנה עודכנה'); setEditDishDialogOpen(false)
    } catch (e) {
      toast.error((e as Error)?.message || "שגיאה")
    }
    finally{ setSavingDishEdit(false) }
  }
  const headerToolsToolbar =
    headerToolsHost &&
    createPortal(
      <div
        className="flex flex-wrap items-center gap-2"
        dir={isRtl ? "rtl" : "ltr"}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1 h-9 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={toggleMenuTools}
          aria-expanded={menuToolsOpen}
          aria-controls="product-tree-menu-tools"
          title={menuToolsOpen ? t("pages.productTree.menuToolsHide") : t("pages.productTree.menuToolsShow")}
        >
          {menuToolsOpen ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
          <span className="hidden sm:inline max-w-[9rem] truncate">
            {menuToolsOpen ? t("pages.productTree.menuToolsHide") : t("pages.productTree.menuToolsShow")}
          </span>
        </Button>
        {menuToolsOpen && (
          <div
            id="product-tree-menu-tools"
            role="group"
            className="flex flex-wrap items-center gap-2"
          >
            {canOpenProductDashboardModal && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 border-primary/30 bg-primary/5 hover:bg-primary/10"
                onClick={() => {
                  setDashboardModalTab(canSeeDashboardContent ? "dashboard" : "reports")
                  setDashboardModalOpen(true)
                }}
              >
                {canSeeDashboardContent ? (
                  <LayoutDashboard className="w-4 h-4" />
                ) : (
                  <BarChart3 className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">
                  {canSeeDashboardContent ? t("pages.productTree.openDashboard") : t("nav.reports")}
                </span>
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowMenuCosts(true)}>
              <BarChart2 className="w-4 h-4" />
              <span className="hidden sm:inline">{t("nav.menuCosts")}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={handleAiSuggest}
              disabled={aiSuggestLoading || Object.keys(supplierPrices).length === 0}
            >
              {aiSuggestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span className="hidden sm:inline">{t("pages.productTree.aiSuggest")}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 bg-gradient-to-l from-purple-500/10 to-violet-500/10 border-purple-500/30 text-purple-600 hover:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/40"
              onClick={() => cameraInputRef.current?.click()}
              title={t("pages.productTree.identify")}
            >
              <Camera className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{t("pages.productTree.identify")}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setIngredientsModalOpen(true)}
            >
              <Leaf className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{t("nav.ingredients")}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setSuppliersModalOpen(true)}
            >
              <Truck className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{t("nav.suppliers")}</span>
            </Button>
          </div>
        )}
      </div>,
      headerToolsHost
    )

  return (
    <div className="flex flex-col bg-background">
      {headerToolsToolbar}
      {loading && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">{t("pages.productTree.loading")}</p>
          </div>
        </div>
      )}
      {canOpenProductDashboardModal && (
        <Dialog
          open={dashboardModalOpen}
          onOpenChange={(open) => {
            setDashboardModalOpen(open)
            if (open) setDashboardModalTab(canSeeDashboardContent ? "dashboard" : "reports")
          }}
        >
          <DialogContent
            className="flex max-h-[min(92vh,56rem)] w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl sm:p-0"
            showCloseButton
          >
            <DialogHeader className="shrink-0 border-b px-4 py-3 pe-14 text-start sm:px-6 sm:py-4 sm:pe-16">
              <DialogTitle className="text-start text-lg leading-snug">
                {canSeeDashboardContent && canSeeReportsContent
                  ? t("pages.productTree.dashboardModalTitleWithReports")
                  : canSeeDashboardContent
                    ? t("pages.productTree.dashboardModalTitle")
                    : t("nav.reports")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("pages.productTree.dashboardModalA11y")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {canSeeDashboardContent && canSeeReportsContent ? (
                <Tabs
                  value={dashboardModalTab}
                  onValueChange={(v) => setDashboardModalTab(v as "dashboard" | "reports")}
                  className="flex min-h-0 flex-1 flex-col gap-0"
                >
                  <TabsList className="mx-4 mt-2 mb-0 h-9 w-fit shrink-0 justify-start bg-muted/40 p-1">
                    <TabsTrigger value="dashboard" className="gap-1.5 text-xs sm:text-sm">
                      <LayoutDashboard className="h-4 w-4 shrink-0" />
                      {t("pages.productTree.dashboardTabOverview")}
                    </TabsTrigger>
                    <TabsTrigger value="reports" className="gap-1.5 text-xs sm:text-sm">
                      <BarChart3 className="h-4 w-4 shrink-0" />
                      {t("nav.reports")}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent
                    value="dashboard"
                    className="mt-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3 pt-2 data-[state=inactive]:hidden sm:px-4 sm:pb-4 [-webkit-overflow-scrolling:touch]"
                  >
                    <Dashboard embedded onCloseEmbedded={() => setDashboardModalOpen(false)} />
                  </TabsContent>
                  <TabsContent
                    value="reports"
                    className="mt-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3 pt-2 data-[state=inactive]:hidden sm:px-4 sm:pb-4 [-webkit-overflow-scrolling:touch]"
                  >
                    <Reports />
                  </TabsContent>
                </Tabs>
              ) : canSeeDashboardContent ? (
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3 sm:px-4 sm:pb-4 [-webkit-overflow-scrolling:touch]">
                  <Dashboard embedded onCloseEmbedded={() => setDashboardModalOpen(false)} />
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3 sm:px-4 sm:pb-4 [-webkit-overflow-scrolling:touch]">
                  <Reports />
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={ingredientsModalOpen} onOpenChange={setIngredientsModalOpen}>
        <DialogContent
          className={cn(
            "flex flex-col gap-0 overflow-hidden p-0 shadow-2xl",
            "h-[88vh] max-h-[88vh] w-[92vw] !max-w-[92vw]",
            "rounded-xl border border-border sm:!max-w-[92vw] sm:max-h-[88vh]",
            "top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]"
          )}
          showCloseButton
        >
          <DialogHeader className="shrink-0 border-b border-border bg-background px-4 py-3 pe-14 text-start sm:px-6 sm:py-4 sm:pe-16">
            <DialogTitle className="flex items-center gap-2 text-start text-lg">
              <Leaf className="h-5 w-5 shrink-0 text-primary" />
              {t("nav.ingredients")}
            </DialogTitle>
            <DialogDescription className="sr-only">{t("nav.ingredients")}</DialogDescription>
          </DialogHeader>
          <div
            className={cn(
              "min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-auto overscroll-contain",
              "px-2 pb-4 pt-2 sm:px-4 sm:pb-4 [-webkit-overflow-scrolling:touch]"
            )}
          >
            <Ingredients />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={suppliersModalOpen} onOpenChange={setSuppliersModalOpen}>
        <DialogContent
          className={cn(
            "flex flex-col gap-0 overflow-hidden p-0 shadow-2xl",
            "h-[88vh] max-h-[88vh] w-[92vw] !max-w-[92vw]",
            "rounded-xl border border-border sm:!max-w-[92vw] sm:max-h-[88vh]",
            "top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]"
          )}
          showCloseButton
        >
          <DialogHeader className="shrink-0 border-b border-border bg-background px-4 py-3 pe-14 text-start sm:px-6 sm:py-4 sm:pe-16">
            <DialogTitle className="flex items-center gap-2 text-start text-lg">
              <Truck className="h-5 w-5 shrink-0 text-primary" />
              {t("nav.suppliers")}
            </DialogTitle>
            <DialogDescription className="sr-only">{t("nav.suppliers")}</DialogDescription>
          </DialogHeader>
          <div
            className={cn(
              "min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-auto overscroll-contain",
              "px-2 pb-4 pt-2 sm:px-4 sm:pb-4 [-webkit-overflow-scrolling:touch]"
            )}
          >
            <SuppliersComp />
          </div>
        </DialogContent>
      </Dialog>

      <FilePreviewModal
        open={fpmOpen}
        onOpenChange={(o) => {
          setFpmOpen(o)
          if (!o) setImportFile(null)
        }}
        file={importFile}
        type="d"
        onConfirmDishes={handleConfirmDishes}
      />

      {/* Camera input for dish recognition — must be at root level */}
      <input
        ref={cameraInputRef}
        type="file"
        id="camera-dish-file"
        name="cameraDishFile"
        accept="image/*"
        className="hidden"
        onChange={e=>{
          const f=e.currentTarget.files?.[0];
          if(!f)return
          setImportFile(f);
          setFpmOpen(true);
          e.currentTarget.value="";
        }}
      />

      <input ref={editDishImgInputRef} type="file" accept="image/*" className="hidden"
        onChange={e=>{const f=e.currentTarget.files?.[0];if(f)setEditDishImgFile(f);e.currentTarget.value=""}}/>
      {editDishDialogOpen && editDishTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-8"
          onClick={e=>{if(e.target===e.currentTarget)setEditDishDialogOpen(false)}}>
          <div className="bg-background rounded-xl shadow-2xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">עריכת מנה</h3>
              <button onClick={()=>setEditDishDialogOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5"/></button>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl overflow-hidden border bg-muted cursor-pointer hover:opacity-80 shrink-0 flex items-center justify-center"
                onClick={()=>editDishImgInputRef.current?.click()}>
                {(editDishImgFile||dishImages[editDishTarget])
                  ?<img src={editDishImgFile?URL.createObjectURL(editDishImgFile):dishImages[editDishTarget]} className="w-full h-full object-cover" alt=""/>
                  :<ImageIcon className="w-6 h-6 text-muted-foreground"/>}
              </div>
              <div>
                <button onClick={()=>editDishImgInputRef.current?.click()} className="text-sm text-primary hover:underline block">
                  {dishImages[editDishTarget]||editDishImgFile?"החלף תמונה":"הוסף תמונה"}</button>
                <p className="text-xs text-muted-foreground">PNG, JPG</p>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">שם המנה</label>
              <input value={editDishName} onChange={e=>setEditDishName(e.target.value)}
                className="w-full h-9 rounded-md border px-3 text-sm bg-background" placeholder="שם המנה"/>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">קטגוריה</label>
              <select value={editDishCategory} onChange={e=>setEditDishCategory(e.target.value)}
                className="w-full h-9 rounded-md border px-3 text-sm bg-background">
                {CATEGORIES.map(cat=><option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={()=>{if(window.confirm('למחוק את "'+editDishTarget+'"?')){deleteDish(editDishTarget);setEditDishDialogOpen(false)}}}
                className="px-3 py-2 rounded-md border border-red-200 text-red-600 text-sm hover:bg-red-50 flex items-center gap-1">
                <Trash2 className="w-3.5 h-3.5"/>מחק</button>
              <button onClick={()=>{duplicateDish(editDishTarget);setEditDishDialogOpen(false)}}
                className="px-3 py-2 rounded-md border text-sm hover:bg-muted flex items-center gap-1">
                <Copy className="w-3.5 h-3.5"/>שכפל</button>
              <div className="flex-1"/>
              <button onClick={()=>setEditDishDialogOpen(false)} className="px-3 py-2 rounded-md border text-sm hover:bg-muted">ביטול</button>
              <button onClick={handleSaveDishEdit} disabled={savingDishEdit}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50">
                {savingDishEdit&&<Loader2 className="w-3 h-3 animate-spin"/>}שמור</button>
            </div>
          </div>
        </div>
      )}
      {/* Scrollable content */}
      <div className="px-4 pb-2">
      {/* Dishes Card */}
      <Card className="mb-2 border-0 shadow-lg">
        <CardContent className="p-3">
          {/* Title + Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Utensils className="w-5 h-5 text-primary" />
              <h2 className="font-bold text-lg">{t("pages.dishes")}</h2>
              <Badge variant="secondary" className="text-xs">
                {filteredDishes.length}
              </Badge>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Dialog open={isAddDishModalOpen} onOpenChange={setIsAddDishModalOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5">
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">{t("pages.productTree.addDish")}</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Plus className="w-5 h-5" />
                      {t("pages.productTree.addDish")}
                    </DialogTitle>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    <div>
                      <Label htmlFor="new-dish-name">{t("pages.productTree.dishName")}</Label>
                      <Input 
                        id="new-dish-name"
                        name="dishName"
                        value={newDishName}
                        onChange={e => setNewDishName(e.target.value)}
                        placeholder={t("pages.productTree.dishName")}
                        className="mt-1.5"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="new-dish-category">{t("pages.productTree.category")}</Label>
                      <Select value={newDishCategory} onValueChange={setNewDishCategory}>
                        <SelectTrigger id="new-dish-category" aria-label={t("pages.productTree.category")} className="mt-1.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map(cat => (
                            <SelectItem key={cat} value={cat}>{t(`pages.productTree.${CATEGORY_TO_KEY[cat] || "other"}`)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label htmlFor="new-dish-price">{t("pages.productTree.sellingPriceLabel")}</Label>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-lg font-semibold">₪</span>
                        <Input 
                          id="new-dish-price"
                          name="dishPrice"
                          type="number"
                          value={newDishPrice}
                          onChange={e => setNewDishPrice(Number(e.target.value))}
                          className="w-28"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-2">
                    <DialogClose asChild>
                      <Button variant="outline">{t("pages.productTree.cancel")}</Button>
                    </DialogClose>
                    <Button onClick={addNewDish}>
                      <Plus className="w-4 h-4 ml-1.5" />
                      {t("pages.productTree.add")}
                    </Button>
                  </div>
                </DialogContent>
                      </Dialog>

              <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <FileSpreadsheet className="w-4 h-4" />
                    <span className="hidden sm:inline">{t("pages.productTree.import")}</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <FileSpreadsheet className="w-5 h-5" />
                      {t("pages.productTree.importDishes")}
                    </DialogTitle>
                  </DialogHeader>
                  
                  <div className="py-6">
                    <input
                      ref={importFileInputRef}
                      type="file"
                      id="import-menu-file"
                      name="importMenuFile"
                      accept=".xlsx,.xls,.csv,.pdf,.doc,.docx,image/*"
                      className="hidden"
                      onChange={handleImportFileSelect}
                    />

                    <div
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation() }}
                      onDrop={handleImportDrop}
                      className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                      onClick={() => importFileInputRef.current?.click()}
                    >
                      <Package className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                      <p className="font-medium mb-2">{t("pages.productTree.dragFile")}</p>
                      <div className="flex justify-center gap-2 flex-wrap mb-4">
                        <Badge variant="secondary">Excel</Badge>
                        <Badge variant="secondary">Word</Badge>
                        <Badge variant="secondary">{t("pages.productTree.image")}</Badge>
                        <Badge variant="secondary">PDF</Badge>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); importFileInputRef.current?.click() }}
                      >
                        בחר קובץ
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground text-center mt-3">
                      {t("pages.productTree.aiExtractDesc")}
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {showMenuCosts && (
            <div style={{position:'fixed',inset:0,zIndex:70,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.5)'}} onClick={() => setShowMenuCosts(false)} />
              <div style={{position:'relative',width:'92vw',height:'88vh',background:'var(--background)',borderRadius:'12px',boxShadow:'0 25px 50px rgba(0,0,0,0.3)',overflow:'visible',display:'flex',flexDirection:'column'}}>
                <button onClick={() => setShowMenuCosts(false)} style={{position:'absolute',top:'12px',left:'12px',zIndex:10,width:'32px',height:'32px',borderRadius:'50%',border:'none',background:'var(--muted)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <X style={{width:'16px',height:'16px'}} />
                </button>
                <div style={{overflowY:'auto',flex:1}}>
                  <MenuCosts />
                </div>
              </div>
            </div>
          )}

          <Dialog open={isAiSuggestOpen} onOpenChange={(o) => { setIsAiSuggestOpen(o); if (!o) setAiSuggestedDish(null) }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  {t("pages.productTree.aiSuggestTitle")}
                </DialogTitle>
                <DialogDescription className="sr-only">{t("pages.productTree.aiSuggestDialogDesc")}</DialogDescription>
              </DialogHeader>
              {aiSuggestedDish ? (
                <div className="space-y-4 py-2">
                  <div>
                    <p className="font-medium text-lg">{aiSuggestedDish.name}</p>
                    <p className="text-sm text-muted-foreground">{aiSuggestedDish.category} • ₪{(aiSuggestedDish.price || 0).toFixed(0)}</p>
                    {aiSuggestedDish.description ? (
                      <p className="text-sm mt-2 text-muted-foreground leading-relaxed">{aiSuggestedDish.description}</p>
                    ) : null}
                  </div>
                  {aiSuggestedDish.preparation ? (
                    <div className="rounded-lg border bg-muted/40 p-3">
                      <p className="text-sm font-semibold mb-2">{t("pages.productTree.preparationNotesLabel")}</p>
                      <div className="text-sm whitespace-pre-wrap leading-relaxed">{aiSuggestedDish.preparation}</div>
                    </div>
                  ) : null}
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-sm font-semibold mb-3">{t("pages.productTree.aiSuggestNeededIngredients")}</p>
                    {(aiSuggestedDish.ingredients || []).length === 0 ? (
                      <p className="text-sm text-amber-700 dark:text-amber-400">{t("pages.productTree.aiSuggestNoMatchedIngredients")}</p>
                    ) : (
                      <ul className="space-y-2.5 text-sm">
                        {(aiSuggestedDish.ingredients || []).map((ing, i) => {
                          const sp = supplierPrices[ing.name]
                          return (
                            <li
                              key={`${ing.name}-${i}`}
                              className="rounded-md bg-background/80 border border-border/60 px-3 py-2"
                            >
                              <div className="font-medium">{ing.name}</div>
                              <div className="text-muted-foreground text-xs sm:text-sm mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                                <span>
                                  {t("pages.productTree.quantity")}: {ing.qty} {ing.unit}
                                </span>
                                {sp ? (
                                  <>
                                    <span aria-hidden>·</span>
                                    <span>
                                      {t("pages.productTree.priceLabelShort")}: ₪{sp.price.toFixed(1)}/{sp.unit}
                                    </span>
                                  </>
                                ) : null}
                                {sp?.supplier ? (
                                  <>
                                    <span aria-hidden>·</span>
                                    <span>
                                      {t("pages.productTree.supplierLabelShort")}: {sp.supplier}
                                    </span>
                                  </>
                                ) : null}
                                {ingredientStock[ing.name] != null ? (
                                  <>
                                    <span aria-hidden>·</span>
                                    <span>
                                      {t("pages.productTree.stockShort")}: {ingredientStock[ing.name]}
                                    </span>
                                  </>
                                ) : null}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                  <details className="text-sm border rounded-lg p-3 bg-muted/30">
                    <summary className="cursor-pointer font-medium text-muted-foreground">
                      {t("pages.productTree.aiSuggestShowAllPantry")} ({Object.keys(supplierPrices).length})
                    </summary>
                    <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto text-muted-foreground">
                      {Object.entries(supplierPrices).map(([name, sp]) => (
                        <li key={name}>
                          {name} — ₪{sp.price.toFixed(1)}/{sp.unit}
                          {sp.supplier && <span className="text-primary"> • איפה לרכוש: {sp.supplier}</span>}
                          {ingredientStock[name] != null ? ` (מלאי: ${ingredientStock[name]})` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => { setAiSuggestedDish(null); setIsAiSuggestOpen(false) }}>{t("pages.productTree.cancel")}</Button>
                    <Button onClick={handleAddAiSuggestedDish}>
                      <Plus className="w-4 h-4 ml-1" />
                      {t("pages.productTree.add")} {t("pages.dish")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 py-2">
                  <div className="py-6 flex flex-col items-center gap-3 text-muted-foreground text-center px-2">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <p className="font-medium">{t("pages.productTree.aiAnalyzing")}</p>
                    <p className="text-sm max-w-sm">{t("pages.productTree.aiSuggestLoadingHint")}</p>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
          
          {/* Search + Filters */}
          <div className="flex flex-wrap gap-2 mb-2">
            <div className="relative flex-1 min-w-[160px]">
              <label htmlFor="product-tree-search" className="sr-only">חפש מנה</label>
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="product-tree-search"
                name="productSearch"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t("pages.productTree.searchPlaceholder")}
                className="pr-9"
              />
            </div>
            
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger id="product-tree-category" aria-label={t("pages.productTree.category")} className="w-[140px]">
                <Filter className="w-4 h-4 ml-2" />
                <SelectValue placeholder={t("pages.productTree.allCategories")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pages.productTree.allCategories")}</SelectItem>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{t(`pages.productTree.${CATEGORY_TO_KEY[cat] || "other"}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={sortMode} onValueChange={v => setSortMode(v as typeof sortMode)}>
              <SelectTrigger id="product-tree-sort" aria-label={t("pages.productTree.sort")} className="w-[140px]">
                <SortAsc className="w-4 h-4 ml-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">{t("pages.productTree.sortAZ")}</SelectItem>
                <SelectItem value="cost_asc">{t("pages.productTree.sortCostAsc")}</SelectItem>
                <SelectItem value="cost_desc">{t("pages.productTree.sortCostDesc")}</SelectItem>
                <SelectItem value="price_desc">{t("pages.productTree.sortPriceDesc")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Dishes Grid */}
          <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto hide-scrollbar">
            {loading && (
              <div className="flex flex-wrap gap-2">
                {Array.from({length:6}).map((_,i)=>(
                  <div key={i} className="relative rounded-lg min-w-[100px] max-w-[150px] h-[90px] flex-1 animate-pulse bg-muted border border-border"/>
                ))}
              </div>
            )}
            <AnimatePresence mode="popLayout">
              {!loading && filteredDishes.map(name => {
                const dish = dishes[name]
                const pct = calcFoodCostPct(name)
                const status = getStatusColor(pct)
                const isActive = name === selectedDish
                
                return (
                  <motion.div
                    key={name}
                    role="button"
                    tabIndex={0}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onClick={() => setSelectedDish(name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        setSelectedDish(name)
                      }
                    }}
                    className={cn(
                      "relative cursor-pointer rounded-lg p-2 text-right transition-all min-w-[100px] max-w-[150px] flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive 
                        ? "shadow-lg ring-2 ring-primary/50" 
                        : "bg-card border border-border hover:border-primary/50 hover:shadow-md"
                    )}
                    style={dishImages[name] && loadedDishImages.has(name)
                      ? {backgroundImage:`url(${dishImages[name]})`,backgroundSize:'cover',backgroundPosition:'center'}
                      : isActive ? {background:'var(--primary)'} : undefined
                    }
                  >
                    {dishImages[name] && !loadedDishImages.has(name) && (
                      <div className="absolute inset-0 rounded-lg overflow-hidden">
                        <div className="w-full h-full animate-pulse bg-muted"/>
                      </div>
                    )}
                    {dishImages[name] && loadedDishImages.has(name) && <div className="absolute inset-0 rounded-lg" style={{background:'linear-gradient(to top,rgba(0,0,0,0.65) 0%,rgba(0,0,0,0.1) 60%,transparent 100%)'}}/>}
                    <button onClick={e=>{e.stopPropagation();openDishEditDialog(name)}}
                      className={cn("absolute top-1.5 left-1.5 p-1 rounded-md z-10 transition-colors",
                        dishImages[name]||isActive?"text-white/80 hover:bg-white/20":"text-muted-foreground hover:bg-muted")}>
                      <MoreVertical className="w-3.5 h-3.5"/>
                    </button>
                    
                    {/* Category */}
                    {dish.category && (
                      <p className={cn(
                        "text-[10px] font-semibold uppercase tracking-wider mb-0.5 pr-1",
                        isActive ? "text-primary-foreground/70" : "text-muted-foreground"
                      )}>
                        {CATEGORY_TO_KEY[dish.category]
                          ? t(`pages.productTree.${CATEGORY_TO_KEY[dish.category]}`)
                          : dish.category}
                      </p>
                    )}
                    
                    {/* Name */}
                    <p className={cn(
                      "font-bold text-sm leading-tight mb-2 pr-1",
                      isActive ? "text-primary-foreground" : "text-foreground"
                    )}>
                      {name}
                    </p>
                    
                    {/* Price & FC — לבעלים בלבד */}
                    <div className="flex items-center justify-between">
                      {canSeeCosts ? (
                        <>
                          <span className={cn(
                            "text-xs",
                            isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                          )}>
                            {dish.sellingPrice > 0 ? `₪${(dish.sellingPrice/VAT_RATE).toFixed(0)} לפמ` : "—"}
                          </span>
                          <Badge 
                            variant="secondary"
                            className={cn(
                              "text-[10px] font-bold",
                              isActive 
                                ? "bg-white/20 text-primary-foreground" 
                                : cn(status.bg, status.text)
                            )}
                          >
                            {pct > 0 ? `${pct.toFixed(1)}%` : `${dish.ingredients.length} ${t("pages.productTree.ingredientsCountShort")}`}
                          </Badge>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {dish.ingredients.length} {t("pages.productTree.ingredientsCountShort")}
                        </span>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>

      {/* Recipe & Cost Layout */}
      <div
        className={cn(
          "grid gap-4",
          canSeeCosts &&
            !isRtl &&
            "max-lg:grid-cols-1 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]",
          canSeeCosts && isRtl && "max-lg:grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]"
        )}
      >
        {/* Cost Panel — לבעלים בלבד */}
        {canSeeCosts && (
        <Card style={{order: isRtl ? 2 : 1}} className={cn(
          "border-0 shadow-lg transition-all",
          "lg:sticky lg:top-4 lg:self-start"
        )}>
          <CardContent className="p-0">
            {/* Panel Header - Clickable on mobile */}
            <button
              onClick={() => setIsCostPanelExpanded(!isCostPanelExpanded)}
              className="w-full p-4 flex items-center justify-between lg:cursor-default"
            >
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary" />
                <h3 className="font-bold">{t("pages.productTree.costSummary")}</h3>
              </div>
              <div className="flex items-center gap-2">
                <Badge 
                  variant="secondary"
                  className={cn(
                    "font-bold",
                    getStatusColor(currentPct).bg,
                    getStatusColor(currentPct).text
                  )}
                >
                  {currentPct.toFixed(1)}%
                </Badge>
                <ChevronDown className={cn(
                  "w-5 h-5 text-muted-foreground transition-transform lg:hidden",
                  isCostPanelExpanded && "rotate-180"
                )} />
              </div>
            </button>
            
            {/* Panel Content */}
            <AnimatePresence>
              {(isCostPanelExpanded || typeof window !== 'undefined' && window.innerWidth >= 1024) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden lg:!h-auto lg:!opacity-100"
                >
                  <div className="px-4 pb-4 space-y-4">
                    {/* Selling Price */}
                    <div className="p-3 bg-muted/50 rounded-lg space-y-1.5">
                      <div className="flex items-center gap-3">
                        <Label htmlFor="selling-price" className="text-sm">{t("pages.productTree.sellingPriceLabel")}:</Label>
                        <div className="flex items-center gap-1 flex-1">
                          <span className="text-lg font-semibold">₪</span>
                          <Input
                            id="selling-price"
                            name="sellingPrice"
                            type="number"
                            value={currentDish?.sellingPrice || 0}
                            onChange={e => updateSellingPrice(Number(e.target.value))}
                            className="h-9 font-bold"
                            min={0}
                          />
                        </div>
                      </div>
                      {currentPriceBeforeVat > 0 && (
                        <p className="text-xs text-muted-foreground flex justify-between">
                          <span>לפני מע"מ:</span>
                          <span className="font-medium">₪{currentPriceBeforeVat.toFixed(2)}</span>
                        </p>
                      )}
                    </div>
                    
                    {/* Cost Meter */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t("pages.productTree.foodCostPct")}</span>
                        <span className={cn(
                          "font-bold text-lg",
                          getStatusColor(currentPct).text
                        )}>
                          {currentPct.toFixed(1)}%
                        </span>
                      </div>
                      
                      <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className={cn(
                            "h-full rounded-full transition-colors",
                            currentPct <= targetFoodCost ? "bg-emerald-500" :
                            currentPct <= targetFoodCost * 1.27 ? "bg-amber-500" : "bg-red-500"
                          )}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(currentPct / 50 * 100, 100)}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                        />
                        {/* Target marker */}
                        <div 
                          className="absolute top-0 bottom-0 w-0.5 bg-foreground/50"
                          style={{ left: `${targetFoodCost / 50 * 100}%` }}
                        />
                      </div>
                      
                      {/* Target adjuster */}
                      <div className="flex items-center justify-center gap-2 text-sm">
                        <span className="text-muted-foreground">יעד:</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="w-6 h-6"
                          onClick={() => setTargetFoodCost(prev => Math.max(10, prev - 1))}
                        >
                          <span className="text-lg leading-none">-</span>
                        </Button>
                        <span className="font-bold w-10 text-center">{targetFoodCost}%</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="w-6 h-6"
                          onClick={() => setTargetFoodCost(prev => Math.min(50, prev + 1))}
                        >
                          <span className="text-lg leading-none">+</span>
                        </Button>
                      </div>
                    </div>
                    
                    {/* Status */}
                    <div className={cn(
                      "p-3 rounded-lg flex items-center gap-3",
                      getStatusColor(currentPct).bg,
                      getStatusColor(currentPct).border,
                      "border"
                    )}>
                      {currentPct <= targetFoodCost ? (
                        <>
                          <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                          <div>
                            <p className="font-bold text-emerald-600">{t("pages.productTree.withinTarget")}</p>
                            <p className="text-xs text-emerald-600/80">
                              {currentPct.toFixed(1)}% מתוך {targetFoodCost}%
                            </p>
                          </div>
                        </>
                      ) : currentPct <= targetFoodCost * 1.27 ? (
                        <>
                          <AlertTriangle className="w-6 h-6 text-amber-600" />
                          <div>
                            <p className="font-bold text-amber-600">{t("pages.productTree.overTarget")}</p>
                            <p className="text-xs text-amber-600/80">
                              {t("pages.productTree.overTargetDeviation")} {(currentPct - targetFoodCost).toFixed(1)}% - {t("pages.productTree.checkSuppliers")}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-6 h-6 text-red-600" />
                          <div>
                            <p className="font-bold text-red-600">{t("pages.productTree.critical")}</p>
                            <p className="text-xs text-red-600/80">
                              {t("pages.productTree.costTooHigh")} ({currentPct.toFixed(1)}%)
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    
                    {/* Breakdown */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        פירוט
                      </p>
                      
                      <ScrollArea className="h-[100px]">
                        <div className="space-y-1.5 pr-2">
                          {currentDish?.ingredients.map((ing, idx) => {
                            const cost = calcIngredientCost(ing.name, ing.qty, ing.waste, ing.unit)
                            const share = currentCost > 0 ? (cost / currentCost * 100) : 0
                            return (
                              <div key={idx} className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">{ing.name}</span>
                                <span className="font-medium">
                                  ₪{cost.toFixed(2)}
                                  <span className="text-xs text-muted-foreground mr-1">
                                    ({share.toFixed(0)}%)
                                  </span>
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </ScrollArea>
                      
                      {/* Totals */}
                      <div className="pt-3 border-t border-border space-y-2">
                        <div className="flex justify-between font-semibold">
                          <span>{t("pages.productTree.totalDishCost")}</span>
                          <span>₪{currentCost.toFixed(2)}</span>
                        </div>
                        {currentPriceBeforeVat > 0 && (
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>מחיר מכירה לפני מע"מ</span>
                            <span>₪{currentPriceBeforeVat.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-semibold">
                          <span>{t("pages.productTree.grossProfit")} <span className="text-xs font-normal text-muted-foreground">(לפני מע"מ)</span></span>
                          <span className={currentProfit > 0 ? "text-emerald-600" : "text-red-600"}>
                            ₪{currentProfit.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>{t("pages.productTree.profitMargin")}</span>
                          <span>{currentMargin.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
        )}
        {/* Recipe Editor */}
        <Card style={{order: isRtl ? 1 : 2}} className="border-0 shadow-lg min-h-0 flex flex-col">
          <CardContent className="p-3 flex flex-col min-h-0 flex-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ChefHat className="w-5 h-5 text-primary" />
                <h3 className="font-bold">{t("pages.productTree.recipe")}</h3>
                {currentDish && (
                  <Badge variant="outline" className="font-semibold">
                    {selectedDish}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground hidden sm:block">
                {t("pages.productTree.clickPencilToEdit")}
              </p>
            </div>
            
            {currentDish ? (
              <>
                {(currentDish.recipeDescription || currentDish.preparationNotes) ? (
                  <div className="mb-3 space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
                    {currentDish.recipeDescription ? (
                      <p className="text-muted-foreground leading-relaxed">{currentDish.recipeDescription}</p>
                    ) : null}
                    {currentDish.preparationNotes ? (
                      <div>
                        <p className="font-semibold mb-1">{t("pages.productTree.preparationNotesLabel")}</p>
                        <div className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{currentDish.preparationNotes}</div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {/* Ingredients Table */}
                <div className="overflow-auto -mx-2 px-2 max-h-[220px] min-h-[60px]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-right py-2 px-2 font-semibold text-muted-foreground">{t("pages.productTree.ingredientLabel")}</th>
                        <th className="text-right py-2 px-2 font-semibold text-muted-foreground hidden sm:table-cell">{t("pages.productTree.supplierLabel")}</th>
                        {canSeeCosts && <th className="text-right py-2 px-2 font-semibold text-muted-foreground">{t("pages.productTree.priceLabelShort")}</th>}
                        <th className="text-right py-2 px-2 font-semibold text-muted-foreground">{t("pages.productTree.quantity")}</th>
                        <th className="text-right py-2 px-2 font-semibold text-muted-foreground hidden sm:table-cell">{t("pages.productTree.unit")}</th>
                        <th className="text-right py-2 px-2 font-semibold text-muted-foreground hidden md:table-cell">{t("pages.productTree.waste")}</th>
                        {canSeeCosts && <th className="text-right py-2 px-2 font-semibold text-muted-foreground">{t("pages.productTree.cost")}</th>}
                        <th className="w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence>
                        {currentDish.ingredients.map((ing, idx) => {
                          const sp = supplierPrices[ing.name]
                          const isCompound = dishes[ing.name]?.isCompound
                          const cost = calcIngredientCost(ing.name, ing.qty, ing.waste, ing.unit, ing.isSubRecipe)
                          const priceChanged = sp && typeof sp.prev === "number" && Math.abs((sp.price ?? 0) - sp.prev) > 0.01
                          const pctChange = sp && typeof sp.prev === "number" && sp.prev !== 0
                            ? ((sp.price ?? 0) - sp.prev) / sp.prev * 100
                            : 0
                          
                          return (
                            <motion.tr 
                              key={`${ing.name}-${idx}`}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 10 }}
                              className={cn(
                                "border-b border-border/50 transition-colors",
                                priceChanged && "bg-amber-500/5"
                              )}
                            >
                              <td className="py-2 px-2 font-medium">
                                {ing.isSubRecipe && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded ml-1">{t("pages.productTree.subRecipe")}</span>}
                                {ing.name}
                              </td>
                              <td className="py-2 px-2 text-muted-foreground text-xs hidden sm:table-cell">
                                {isCompound ? "—" : (sp?.supplier || "—")}
                              </td>
                              {canSeeCosts && (
                              <td className="py-2 px-2">
                                <div className="flex items-center gap-1">
                                  <span className="font-semibold">
                                    {isCompound ? `₪${cost.toFixed(2)}/מנה` : `₪${(sp?.price ?? 0).toFixed(2)}`}
                                  </span>
                                  {priceChanged && (
                                    <Badge 
                                      variant="secondary" 
                                      className={cn(
                                        "text-[10px] px-1",
                                        pctChange > 0 ? "bg-red-500/10 text-red-600" : "bg-emerald-500/10 text-emerald-600"
                                      )}
                                    >
                                      {pctChange > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                      {Math.abs(pctChange).toFixed(1)}%
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                  {isCompound ? t("pages.productTree.calculated") : (sp ? `${t("pages.productTree.by")} ${sp.unit}` : "")}
                                </p>
                              </td>
                              )}
                              <td className="py-2 px-2 font-medium">
                                {ing.qty ?? 0}
                              </td>
                              <td className="py-2 px-2 hidden sm:table-cell text-muted-foreground">
                                {normalizeUnit(ing.unit)}
                              </td>
                              <td className="py-2 px-2 hidden md:table-cell text-muted-foreground">
                                {(ing.waste ?? 0) > 0 ? `${ing.waste}%` : "—"}
                              </td>
                              {canSeeCosts && (
                              <td className="py-2 px-2 font-semibold">
                                ₪{cost.toFixed(2)}
                              </td>
                              )}
                              <td className="py-2 px-1">
                                <div className="flex items-center gap-0.5">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-7 h-7 text-muted-foreground hover:text-primary"
                                    title="ערוך — יועבר לפאנל עריכה"
                                    onClick={() => {
                                      removeIngredient(idx)
                                      setSelectedIngredient(ing.name)
                                      setSelectedIngredientType(ing.isSubRecipe ? "compound" : "simple")
                                      setAddIngredientQty(ing.qty ?? 0)
                                      setAddIngredientUnit(normalizeUnit(ing.unit))
                                      setAddIngredientWaste(ing.waste ?? 0)
                                      setAddIngredientSearch(ing.name)
                                      setShowIngredientDropdown(false)
                                    }}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-7 h-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    title={t("pages.productTree.remove")}
                                    onClick={() => removeIngredient(idx)}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              </td>
                            </motion.tr>
                          )
                        })}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
                
                {/* Add Ingredient */}
                <div className="mt-2 pt-2 border-t border-border shrink-0">
                  <div className="relative">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <label htmlFor="add-ingredient-search" className="sr-only">{t("pages.productTree.searchIngredientAria")}</label>
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="add-ingredient-search"
                          name="addIngredientSearch"
                          value={addIngredientSearch}
                          onChange={e => {
                            setAddIngredientSearch(e.target.value)
                            setShowIngredientDropdown(true)
                            setSelectedIngredient(null)
                          }}
                          onFocus={() => setShowIngredientDropdown(true)}
                          placeholder={t("pages.productTree.searchIngredientPlaceholder")}
                          className="pr-9"
                        />
                        
                        {/* Dropdown */}
                        <AnimatePresence>
                          {showIngredientDropdown && ((filteredIngredients?.simple?.length ?? 0) > 0 || (filteredIngredients?.compound?.length ?? 0) > 0) && !selectedIngredient && (
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="absolute top-full right-0 left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-[240px] overflow-y-auto"
                            >
                              {(filteredIngredients?.compound?.length ?? 0) > 0 && (
                                <>
                                  <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground bg-muted/50">🧪 מתכונים</div>
                                  {(filteredIngredients.compound || []).map(name => (
                                    <button
                                      key={`c-${name}`}
                                      onClick={() => {
                                        setSelectedIngredient(name)
                                        setSelectedIngredientType("compound")
                                        setAddIngredientSearch(name)
                                        setShowIngredientDropdown(false)
                                        setAddIngredientQty(1)
                                        setAddIngredientUnit("מנה")
                                      }}
                                      className="w-full px-3 py-2 text-right hover:bg-muted flex items-center justify-between transition-colors"
                                    >
                                      <span className="font-medium">{name}</span>
                                      <span className="text-xs text-amber-600">
                                        ₪{calcDishCost(name).toFixed(2)}/מנה
                                      </span>
                                    </button>
                                  ))}
                                </>
                              )}
                              {(filteredIngredients?.simple?.length ?? 0) > 0 && (
                                <>
                                  <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground bg-muted/50 border-t border-border">🥬 {t("pages.productTree.ingredientsCountShort")}</div>
                                  {(filteredIngredients.simple || []).map(name => {
                                    const sp = supplierPrices[name]
                                    const stk = ingredientStock[name]
                                    const hasMinStock = sp && typeof (sp as any).minStock === "number"
                                    const minStk = hasMinStock ? (sp as any).minStock : 0
                                    const stockBadge = stk == null ? null
                                      : stk === 0
                                        ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium shrink-0">אזל</span>
                                        : minStk > 0 && stk < minStk
                                          ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium shrink-0">נמוך {stk}</span>
                                          : <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium shrink-0">מלאי {stk}</span>
                                    return (
                                      <button
                                        key={name}
                                        onClick={() => {
                                          setSelectedIngredient(name)
                                          setSelectedIngredientType("simple")
                                          setAddIngredientSearch(name)
                                          setShowIngredientDropdown(false)
                                          setAddIngredientUnit(normalizeUnit(sp?.unit))
                                        }}
                                        className="w-full px-3 py-2 text-right hover:bg-muted flex items-center justify-between gap-2 transition-colors"
                                      >
                                        <span className="font-medium truncate">{name}</span>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          {stockBadge}
                                          <span className="text-xs text-muted-foreground">
                                            ₪{(sp?.price ?? 0).toFixed(2)} / {sp?.unit || ""}
                                          </span>
                                        </div>
                                      </button>
                                    )
                                  })}
                                </>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    
                    {/* Add panel */}
                    <AnimatePresence>
                      {selectedIngredient && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg"
                        >
                          <p className="font-semibold text-primary mb-1">{selectedIngredient}</p>
                          {selectedIngredientType === "compound" ? (
                            <p className="text-xs text-muted-foreground mb-2">
                              {t("pages.productTree.compoundRecipeCost")}: ₪{calcDishCost(selectedIngredient).toFixed(2)}/{t("pages.productTree.perPortion")}
                            </p>
                          ) : (
                            (() => {
                              const sp = supplierPrices[selectedIngredient]
                              return sp ? (
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-2">
                                  <span>{t("pages.productTree.priceLabelShort")}: ₪{(sp.price ?? 0).toFixed(2)}</span>
                                  <span>{t("pages.productTree.unitLabelShort")}: {sp.unit || "—"}</span>
                                  {sp.supplier && <span>{t("pages.productTree.supplierLabelShort")}: {sp.supplier}</span>}
                                </div>
                              ) : null
                            })()
                          )}
                          <p className="text-xs text-muted-foreground mb-2">{t("pages.productTree.editIngredientHint")}</p>
                          {selectedIngredientType === "compound" ? (
                            <p className="text-sm font-semibold mb-3">
                              {t("pages.productTree.estimatedCost")}: ₪{(calcDishCost(selectedIngredient) * addIngredientQty).toFixed(2)}
                            </p>
                          ) : (
                            <p className="text-sm font-semibold mb-3">
                              {t("pages.productTree.estimatedCost")}: ₪{calcIngredientCost(selectedIngredient, addIngredientQty ?? 0, addIngredientWaste ?? 0, addIngredientUnit, false).toFixed(2)}
                            </p>
                          )}
                          <div className="flex flex-wrap items-end gap-3">
                            <div>
                              <Label htmlFor="add-ingredient-qty" className="text-xs">{t("pages.productTree.quantity")}</Label>
                              <Input
                                id="add-ingredient-qty"
                                name="addIngredientQty"
                                type="number"
                                value={addIngredientQty}
                                onChange={e => setAddIngredientQty(Number(e.target.value))}
                                className="w-20 h-9 mt-1"
                              />
                            </div>
                            <div>
                              <Label htmlFor="add-ingredient-unit" className="text-xs">{t("pages.productTree.unit")}</Label>
                              <Select value={normalizeUnit(addIngredientUnit)} onValueChange={setAddIngredientUnit}>
                                <SelectTrigger id="add-ingredient-unit" aria-label="יחידה" className="w-24 h-9 mt-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {UNITS.map(u => (
                                    <SelectItem key={u} value={u}>{u}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label htmlFor="add-ingredient-waste" className="text-xs">{t("pages.productTree.waste")} %</Label>
                              <Input
                                id="add-ingredient-waste"
                                name="addIngredientWaste"
                                type="number"
                                value={addIngredientWaste}
                                onChange={e => setAddIngredientWaste(Number(e.target.value))}
                                className="w-16 h-9 mt-1"
                                min={0}
                                max={100}
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={addIngredient}>
                                <CheckCircle2 className="w-4 h-4 ml-1.5" />
                                {t("pages.productTree.add")}
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => {
                                  setSelectedIngredient(null)
                                  setAddIngredientSearch("")
                                }}
                              >
                                {t("pages.productTree.cancel")}
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <Utensils className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t("pages.productTree.selectDishToEdit")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  )
}
