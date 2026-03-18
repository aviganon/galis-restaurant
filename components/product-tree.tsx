"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Search, Plus, FileSpreadsheet, Copy, Camera, Trash2, ChevronDown, 
  ChevronUp, X, Edit2, MoreVertical, Filter, SortAsc, SortDesc,
  Package, Utensils, DollarSign, TrendingUp, TrendingDown, ImageIcon, AlertTriangle,
  CheckCircle2, Info, ChefHat, Scale, Percent, Sparkles, BarChart2, Loader2, ShoppingCart
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Ingredients } from "@/components/ingredients"
import { MenuCosts } from "@/components/menu-costs"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog"
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
import { suggestDishFromIngredients, type ExtractedDishItem } from "@/lib/ai-extract"
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
}

interface SupplierPrice {
  name: string
  price: number
  prev: number
  unit: string
  supplier: string
}

const VAT_RATE = 1.17
const CATEGORIES = ["עיקריות", "ראשונות", "סלטים", "קינוחים", "משקאות", "תוספות", "אחר"]
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
  "תוספות": "sides",
  "אחר": "other",
}
export default function ProductTree() {
  const [activeTab, setActiveTab] = useState<"ingredients"|"suppliers"|null>(null)
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
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false)
  const [aiSuggestedDish, setAiSuggestedDish] = useState<ExtractedDishItem | null>(null)
  const [ingredientStock, setIngredientStock] = useState<Record<string, number>>({})
  const [importFile, setImportFile] = useState<File | null>(null)
  const [fpmOpen, setFpmOpen] = useState(false)
  const importFileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [isCostPanelExpanded, setIsCostPanelExpanded] = useState(true)
  const [editingDish, setEditingDish] = useState<string | null>(null)
  
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

        const newDishes: Record<string, Dish> = {}
        recSnap.forEach((d) => {
          const data = d.data()
          const ing = Array.isArray(data.ingredients) ? data.ingredients : []
          newDishes[d.id] = {
            name: d.id,
            category: data.category || "עיקריות",
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
        // בעלים ומנהלים: מכבדים assignedSuppliers — מסעדה חדשה בלי שיוך רואה רק רכיבים שלה
        if (assignedList.length > 0) {
          globalIngSnap.forEach((d) => {
            const data = d.data() as IngData
            const sup = (data.supplier || "") as string
            // רכיבים ללא ספק מהקטלוג הגלובלי — לא מוצגים במסעדות
            if (sup && assignedList.includes(sup)) mergePrice(d.id, data)
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
          const cleanDish = Object.fromEntries(Object.entries({ ...dish, isCompound: dish.isCompound ?? false }).filter(([,v])=>v!==undefined))
          await setDoc(ref, cleanDish, { merge: true })
        } else {
          await deleteDoc(ref)
        }
        refreshIngredients?.()
      } catch (e) {
        toast.error(t("pages.productTree.saveError") + ": " + (e as Error).message)
      }
    },
    [currentRestaurantId, refreshIngredients]
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
        toast.error("לא הצלחתי להציע מנה — נסה שוב")
        setIsAiSuggestOpen(false)
      }
    } catch (e) {
      toast.error((e as Error)?.message || t("pages.productTree.suggestError"))
      setIsAiSuggestOpen(false)
    } finally {
      setAiSuggestLoading(false)
    }
  }, [supplierPrices, ingredientStock])

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
      category: aiSuggestedDish.category || "עיקריות",
      sellingPrice: aiSuggestedDish.price || 0,
      ingredients,
      isCompound: false,
      yieldQty: 1,
      yieldUnit: "מנה",
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
        category: it.category || "עיקריות",
        sellingPrice: it.price || 0,
        ingredients,
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
            { ...dish, isCompound: false },
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

  // Copy to clipboard
  const handleCopyToClipboard = () => {
    const toCopy = selectedDish
      ? (() => {
          const d = dishes[selectedDish]
          if (!d) return ""
          const lines = [`מנה: ${selectedDish}`, `קטגוריה: ${d.category}`, `מחיר: ₪${(d.sellingPrice / VAT_RATE).toFixed(2)}`, "רכיבים:"]
          d.ingredients.forEach(i => lines.push(`  - ${i.name}: ${i.qty} ${i.unit}${i.waste ? ` (פחת ${i.waste}%)` : ""}`))
          return lines.join("\n")
        })()
      : filteredDishes.map(n => {
          const d = dishes[n]
          const p = (d?.sellingPrice || 0) / VAT_RATE
          return `${n} | ${d?.category || ""} | ₪${p.toFixed(2)}`
        }).join("\n")
    if (!toCopy) {
      toast.error(t("pages.productTree.noDishesToCopy"))
      return
    }
    navigator.clipboard.writeText(toCopy).then(() => toast.success(t("pages.productTree.copiedToClipboard")))
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
      // Strip undefined — Firestore rejects undefined values
      const clean = Object.fromEntries(Object.entries(updatedDish).filter(([,v])=>v!==undefined))
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
    } catch(e){ toast.error(e.message||'שגיאה') }
    finally{ setSavingDishEdit(false) }
  }
  return (
    <div className="flex flex-col bg-background">
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">{t("pages.productTree.loading")}</p>
          </div>
        </div>
      )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-8"
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
      {/* Header Alert - compact */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-2 rounded-lg bg-gradient-to-l from-primary/5 to-primary/10 border border-primary/20 p-2 flex items-center gap-2 shrink-0"
      >
        <TrendingUp className="w-4 h-4 text-primary shrink-0" />
        <p className="text-xs text-foreground/80">
          {t("pages.productTree.pricesSynced")}
        </p>
      </motion.div>

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
              </Dialog><Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowMenuCosts(true)}>
                <BarChart2 className="w-4 h-4" />
                <span className="hidden sm:inline">עלויות תפריט</span>
              </Button>

              {showMenuCosts && (
