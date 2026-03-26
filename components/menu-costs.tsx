"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { collection, getDocs, getDoc, doc, setDoc, writeBatch, type DocumentReference } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Search, TrendingUp, TrendingDown, DollarSign, UtensilsCrossed,
  Percent, AlertTriangle, CheckCircle2, Loader2, Upload, FileText, X, ChevronDown, ChevronUp,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useTranslations } from "@/lib/use-translations"
import { useLanguage } from "@/contexts/language-context"
import {
  extractWithAI,
  suggestDishesFromSalesLines,
  type ExtractedSalesItem,
  type SalesReportPeriod,
  isSupportedFormat,
} from "@/lib/ai-extract"
import { safeFirestoreRecipeId } from "@/lib/recipe-id"
import { normalizeDishCategoryToHebrew } from "@/lib/dish-category-hebrew"
import { loadRestaurantPantryForAi } from "@/lib/restaurant-pantry"
import { loadGlobalPriceSubdocsMap, pickGlobalIngredientRowFromAssigned } from "@/lib/ingredient-assigned-price"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { recipeCountsAsMenuDish } from "@/lib/recipe-menu-visibility"

const VAT_RATE = 1.17

interface MenuItem {
  id: string
  name: string
  category: string
  salePrice: number
  foodCost: number
  foodCostPercent: number
  profit: number
  profitMargin: number
  status: "excellent" | "good" | "warning" | "critical"
  salesCount: number
  addedFromSalesReport?: boolean
}

interface SalesRow {
  /** שם כפי שחולץ מהדוח (תצוגה) */
  name: string
  /** מזהה מסמך מתכון ב-Firestore */
  recipeId: string
  quantity: number
  revenue: number
}

interface FilePreviewModal {
  open: boolean
  fileName: string
  rows: SalesRow[]
  rawText: string
  existingRecipeIds: Set<string>
  /** תקופת הדוח כפי שזוהתה ב-AI (יומי / חודשי וכו') */
  salesReportPeriod?: SalesReportPeriod
  /** YYYY-MM-DD מתוך הדוח */
  salesReportDateFrom?: string
  salesReportDateTo?: string
}

const isOwnerRole = (role: string, isSystemOwner?: boolean) => isSystemOwner || role === "owner"

function salesColumnTitleForPeriod(t: (key: string) => string, period: SalesReportPeriod | undefined) {
  switch (period) {
    case "daily":
      return t("pages.menuCosts.salesColumnDaily")
    case "monthly":
      return t("pages.menuCosts.salesColumnMonthly")
    case "weekly":
      return t("pages.menuCosts.salesColumnWeekly")
    default:
      return t("pages.menuCosts.salesColumnGeneric")
  }
}

function salesPeriodShortLabel(t: (key: string) => string, period: SalesReportPeriod | undefined) {
  switch (period) {
    case "daily":
      return t("pages.menuCosts.salesReportPeriodDaily")
    case "monthly":
      return t("pages.menuCosts.salesReportPeriodMonthly")
    case "weekly":
      return t("pages.menuCosts.salesReportPeriodWeekly")
    case "unknown":
      return t("pages.menuCosts.salesReportPeriodUnknown")
    default:
      return t("pages.menuCosts.salesReportPeriodUnknown")
  }
}

function formatIsoDateDisplay(iso: string | undefined, locale: string) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ""
  return new Date(`${iso}T12:00:00`).toLocaleDateString(locale === "he" ? "he-IL" : "en-GB")
}

function mapExtractedSalesToRows(items: ExtractedSalesItem[]): SalesRow[] {
  return items
    .filter((it) => it?.name?.trim())
    .map((it) => {
      const name = String(it.name).trim()
      const qty = typeof it.qty === "number" && !Number.isNaN(it.qty) ? it.qty : 0
      const price = typeof it.price === "number" && !Number.isNaN(it.price) ? it.price : 0
      const revenue = qty > 0 && price > 0 ? qty * price : price
      return {
        name,
        recipeId: safeFirestoreRecipeId(name),
        quantity: Math.max(0, Math.round(qty)),
        revenue: Math.max(0, revenue),
      }
    })
}

type MenuCostsProps = {
  /** מצב מודאל מעץ המוצר — כיווץ כותרת/מדדים והטבלה תופסת גובה מלא */
  embeddedInProductTree?: boolean
}

export function MenuCosts({ embeddedInProductTree = false }: MenuCostsProps) {
  const t = useTranslations()
  const { locale } = useLanguage()
  const { currentRestaurantId, userRole, isSystemOwner, refreshIngredientsKey, refreshIngredients } = useApp()
  const isOwner = isOwnerRole(userRole, isSystemOwner)

  const [items, setItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("הכל")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortBy, setSortBy] = useState("name")

  const [isDragging, setIsDragging] = useState(false)
  const [isParsingFile, setIsParsingFile] = useState(false)
  const [preview, setPreview] = useState<FilePreviewModal>({
    open: false,
    fileName: "",
    rows: [],
    rawText: "",
    existingRecipeIds: new Set(),
    salesReportPeriod: undefined,
    salesReportDateFrom: undefined,
    salesReportDateTo: undefined,
  })
  /** תקופת הדוח האחרונה שנשמרה (מוצג בעמודת מכירות) */
  const [savedSalesReportPeriod, setSavedSalesReportPeriod] = useState<SalesReportPeriod | undefined>(undefined)
  const [savedSalesDateFrom, setSavedSalesDateFrom] = useState<string | undefined>(undefined)
  const [savedSalesDateTo, setSavedSalesDateTo] = useState<string | undefined>(undefined)
  const [addMissingDishesFromSales, setAddMissingDishesFromSales] = useState(true)
  const [savingSales, setSavingSales] = useState(false)
  const [showDropZone, setShowDropZone] = useState(!embeddedInProductTree)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const loadMenuCosts = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!currentRestaurantId) {
        if (!opts?.silent) setLoading(false)
        return
      }
      if (!opts?.silent) setLoading(true)
      try {
        const [recSnap, restIngSnap, asDoc, salesDoc] = await Promise.all([
          getDocs(collection(db, "restaurants", currentRestaurantId, "recipes")),
          getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients")),
          getDoc(doc(db, "restaurants", currentRestaurantId, "appState", "assignedSuppliers")),
          getDoc(doc(db, "restaurants", currentRestaurantId, "appState", `salesReport_${currentRestaurantId}`)),
        ])

        const assignedList: string[] = Array.isArray(asDoc.data()?.list) ? asDoc.data()!.list : []
        const globalIngSnap = isOwner ? await getDocs(collection(db, "ingredients")) : null
        const subPricesByIngredient =
          isOwner && assignedList.length > 0 ? await loadGlobalPriceSubdocsMap(db) : new Map()

        const prices: Record<string, number> = {}
        restIngSnap.forEach((d) => {
          const data = d.data()
          prices[d.id] = typeof data.price === "number" ? data.price : 0
        })
        globalIngSnap?.forEach((d) => {
          if (d.id in prices) return
          const picked = pickGlobalIngredientRowFromAssigned(assignedList, d.data(), subPricesByIngredient.get(d.id))
          if (picked) prices[d.id] = picked.price
        })

        const recipesMap: Record<string, { ingredients: { name: string; qty: number; unit: string; waste: number; isSubRecipe?: boolean }[]; yieldQty?: number }> = {}
        recSnap.docs.forEach((d) => {
          const data = d.data()
          recipesMap[d.id] = {
            ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
            yieldQty: typeof data.yieldQty === "number" ? data.yieldQty : 1,
          }
        })

        const calcIngCost = (name: string, qty: number, waste: number, unit: string, isSubRecipe?: boolean): number => {
          if (isSubRecipe) {
            const rec = recipesMap[name]
            if (!rec?.ingredients?.length) return 0
            const yieldQty = rec.yieldQty ?? 1
            const totalSub = rec.ingredients.reduce((s, sub) => s + calcIngCost(sub.name, sub.qty, sub.waste || 0, sub.unit, sub.isSubRecipe), 0)
            return (totalSub / yieldQty) * qty
          }
          const p = prices[name] ?? 0
          let mult = 1
          if (unit === "גרם") mult = 0.001
          else if (unit === "מל") mult = 0.001
          return qty * p * mult * (1 + waste / 100)
        }

        const salesData = salesDoc.data() as {
          dailySales?: Record<string, { avg: number }>
          salesReportPeriod?: SalesReportPeriod
          salesReportDateFrom?: string | null
          salesReportDateTo?: string | null
        } | undefined
        const dailySales = salesData?.dailySales || {}
        const period = salesData?.salesReportPeriod
        setSavedSalesReportPeriod(
          period === "daily" || period === "monthly" || period === "weekly" || period === "unknown" ? period : undefined
        )
        const df = typeof salesData?.salesReportDateFrom === "string" ? salesData.salesReportDateFrom : undefined
        const dt = typeof salesData?.salesReportDateTo === "string" ? salesData.salesReportDateTo : undefined
        setSavedSalesDateFrom(df && /^\d{4}-\d{2}-\d{2}$/.test(df) ? df : undefined)
        setSavedSalesDateTo(dt && /^\d{4}-\d{2}-\d{2}$/.test(dt) ? dt : undefined)
        const catSet = new Set<string>()
        const list: MenuItem[] = []

        recSnap.docs.forEach((r) => {
          const data = r.data()
          if (!recipeCountsAsMenuDish(data)) return
          const sellingPrice = (typeof data.sellingPrice === "number" ? data.sellingPrice : 0) / VAT_RATE
          const ing = Array.isArray(data.ingredients) ? data.ingredients : []
          let cost = 0
          ing.forEach((i: { name?: string; qty?: number; waste?: number; unit?: string; isSubRecipe?: boolean }) => {
            cost += calcIngCost(i.name || "", i.qty || 0, i.waste || 0, i.unit || "גרם", i.isSubRecipe)
          })
          const foodCostPct = sellingPrice > 0 ? (cost / sellingPrice) * 100 : 0
          const profit = sellingPrice - cost
          const profitMargin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0
          const sales = dailySales[r.id]?.avg ?? 0
          let status: "excellent" | "good" | "warning" | "critical" = "good"
          if (foodCostPct <= 25) status = "excellent"
          else if (foodCostPct <= 30) status = "good"
          else if (foodCostPct <= 35) status = "warning"
          else status = "critical"
          const normCat = normalizeDishCategoryToHebrew(
            typeof data.category === "string" ? data.category : "עיקריות"
          )
          catSet.add(normCat)
          list.push({
            id: r.id, name: r.id,
            category: normCat,
            salePrice: sellingPrice, foodCost: cost,
            foodCostPercent: foodCostPct, profit, profitMargin, status,
            salesCount: Math.round(sales),
            addedFromSalesReport: data.addedFromSalesReport === true,
          })
        })
        setItems(list)
        setCategories(["הכל", ...Array.from(catSet).sort()])
      } catch (e) {
        console.error("load menu costs:", e)
        toast.error(t("pages.menuCosts.loadError"))
      } finally {
        if (!opts?.silent) setLoading(false)
      }
    },
    [currentRestaurantId, isOwner, t]
  )

  useEffect(() => {
    void loadMenuCosts()
  }, [loadMenuCosts, refreshIngredientsKey])

  const processFile = useCallback(
    async (file: File) => {
      if (!isSupportedFormat(file)) {
        toast.error(t("pages.menuCosts.salesImportUnsupported"))
        return
      }
      setIsParsingFile(true)
      try {
        const result = await extractWithAI(file, "s")
        const rows = mapExtractedSalesToRows(result.items as ExtractedSalesItem[])
        if (!rows.length) {
          toast.error(t("pages.menuCosts.salesImportNoData"))
          return
        }
        let existingRecipeIds = new Set<string>()
        if (currentRestaurantId) {
          const recSnap = await getDocs(collection(db, "restaurants", currentRestaurantId, "recipes"))
          existingRecipeIds = new Set(recSnap.docs.map((d) => d.id))
        }
        const salesReportPeriod = result.sales_report_period
        const salesReportDateFrom = result.sales_report_date_from ?? undefined
        const salesReportDateTo = result.sales_report_date_to ?? undefined
        setPreview({
          open: true,
          fileName: file.name,
          rows,
          rawText: "",
          existingRecipeIds,
          salesReportPeriod,
          salesReportDateFrom,
          salesReportDateTo,
        })
      } catch (e) {
        console.error("menu costs sales import:", e)
        toast.error(t("pages.menuCosts.salesImportReadError"))
      } finally {
        setIsParsingFile(false)
      }
    },
    [t, currentRestaurantId]
  )

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files[0]; if (file) processFile(file)
  }, [processFile])

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)

  const handleConfirmSales = async () => {
    if (!currentRestaurantId || !preview.rows.length || savingSales) return
    setSavingSales(true)
    try {
      const salesRef = doc(db, "restaurants", currentRestaurantId, "appState", `salesReport_${currentRestaurantId}`)
      const prevSnap = await getDoc(salesRef)
      const prevDaily = (prevSnap.data()?.dailySales as Record<string, { avg: number; total: number }>) || {}
      const dailySales: Record<string, { avg: number; total: number }> = { ...prevDaily }
      preview.rows.forEach((row) => {
        dailySales[row.recipeId] = { avg: row.quantity, total: row.revenue }
      })

      const rowsToCreate = addMissingDishesFromSales
        ? preview.rows.filter((row) => !preview.existingRecipeIds.has(row.recipeId))
        : []
      let suggestedMissing = 0
      const pantry = await loadRestaurantPantryForAi(currentRestaurantId, isOwner)
      const suggestions =
        rowsToCreate.length > 0
          ? await suggestDishesFromSalesLines(
              rowsToCreate.map((r) => ({ name: r.name, quantity: r.quantity, revenue: r.revenue })),
              pantry.length > 0 ? pantry : undefined
            )
          : new Map()
      if (rowsToCreate.length > 0) {
        suggestedMissing = rowsToCreate.filter((r) => !suggestions.has(r.name)).length
      }

      const BATCH_MAX = 450
      const recipeWrites: Array<{ ref: DocumentReference; data: Record<string, unknown> }> = []
      const nowIso = new Date().toISOString()

      for (const row of rowsToCreate) {
        const sug = suggestions.get(row.name)
        const impliedUnit =
          row.quantity > 0 ? Math.round((row.revenue / row.quantity) * 100) / 100 : 0
        const sellingPrice = Math.max(
          sug?.suggested_selling_price_ils ?? 0,
          impliedUnit > 0 ? impliedUnit : 0
        )
        const ingredients = (sug?.ingredients ?? []).map((ing: { name: string; qty: number; unit: string }) => ({
          name: ing.name,
          qty: ing.qty,
          unit: ing.unit || "גרם",
          waste: 0,
        }))
        recipeWrites.push({
          ref: doc(db, "restaurants", currentRestaurantId, "recipes", row.recipeId),
          data: {
            name: row.name,
            category: normalizeDishCategoryToHebrew(sug?.category || "עיקריות"),
            sellingPrice,
            ingredients,
            isCompound: false,
            addedFromSalesReport: true,
            addedFromSalesReportAt: nowIso,
          },
        })
      }

      for (let i = 0; i < recipeWrites.length; i += BATCH_MAX) {
        const batch = writeBatch(db)
        const chunk = recipeWrites.slice(i, i + BATCH_MAX)
        chunk.forEach(({ ref, data }) => batch.set(ref, data, { merge: true }))
        await batch.commit()
      }

      const salesReportPeriod = preview.salesReportPeriod
      const salesReportDateFrom = preview.salesReportDateFrom ?? null
      const salesReportDateTo = preview.salesReportDateTo ?? null
      await setDoc(
        salesRef,
        {
          dailySales,
          updatedAt: nowIso,
          lastUpdated: nowIso,
          ...(salesReportPeriod ? { salesReportPeriod } : {}),
          salesReportDateFrom,
          salesReportDateTo,
        },
        { merge: true }
      )
      if (salesReportPeriod) setSavedSalesReportPeriod(salesReportPeriod)
      setSavedSalesDateFrom(salesReportDateFrom ?? undefined)
      setSavedSalesDateTo(salesReportDateTo ?? undefined)

      if (recipeWrites.length > 0) {
        toast.success(t("pages.menuCosts.salesSaveSuccessWithNew"))
        if (suggestedMissing > 0) toast.info(t("pages.menuCosts.salesSaveSuggestError"))
        refreshIngredients?.()
      } else {
        toast.success(t("pages.menuCosts.salesSaveSuccess"))
      }

      setPreview({
        open: false,
        fileName: "",
        rows: [],
        rawText: "",
        existingRecipeIds: new Set(),
        salesReportPeriod: undefined,
        salesReportDateFrom: undefined,
        salesReportDateTo: undefined,
      })
      await loadMenuCosts({ silent: true })
    } catch {
      toast.error(t("pages.menuCosts.salesSaveError"))
    } finally {
      setSavingSales(false)
    }
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "excellent": return { label: t("pages.menuCosts.excellent"), color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 }
      case "good":      return { label: t("pages.menuCosts.good"),      color: "bg-blue-100 text-blue-700",     icon: TrendingUp }
      case "warning":   return { label: t("pages.menuCosts.checkReview"), color: "bg-amber-100 text-amber-700", icon: AlertTriangle }
      case "critical":  return { label: t("pages.menuCosts.problematic"), color: "bg-red-100 text-red-700",    icon: TrendingDown }
      default:          return { label: t("pages.menuCosts.unknown"),    color: "bg-gray-100 text-gray-700",    icon: AlertTriangle }
    }
  }

  const filteredItems = items
    .filter((item) => {
      const matchesSearch = item.name.includes(searchTerm)
      const matchesCategory = categoryFilter === "הכל" || item.category === categoryFilter
      const matchesStatus = statusFilter === "all" || item.status === statusFilter
      return matchesSearch && matchesCategory && matchesStatus
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "cost_asc":    return a.foodCostPercent - b.foodCostPercent
        case "cost_desc":   return b.foodCostPercent - a.foodCostPercent
        case "profit_desc": return b.profit - a.profit
        case "profit_asc":  return a.profit - b.profit
        case "sales_desc":  return b.salesCount - a.salesCount
        default:            return a.name.localeCompare(b.name, "he")
      }
    })

  const stats = {
    totalItems: items.length,
    avgFoodCost: items.length > 0 ? items.reduce((s, i) => s + i.foodCostPercent, 0) / items.length : 0,
    totalRevenue: items.reduce((s, i) => s + i.salePrice * i.salesCount, 0),
    totalProfit: items.reduce((s, i) => s + i.profit * i.salesCount, 0),
    criticalItems: items.filter((i) => i.status === "critical" || i.status === "warning").length,
  }

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center",
          embeddedInProductTree ? "min-h-[100px] flex-1" : "min-h-[40vh] p-4 md:p-6",
        )}
      >
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!currentRestaurantId) {
    return (
      <div className={cn("p-4 md:p-6", embeddedInProductTree && "p-3")}>
        <h1 className="text-2xl font-bold mb-1">{t("nav.menuCosts")}</h1>
        <p className="text-muted-foreground">{t("pages.menuCosts.selectRestaurant")}</p>
      </div>
    )
  }

  const salesImportCard = (
      <Card className={cn("border-dashed", embeddedInProductTree && "shrink-0")}>
        <CardContent className="p-0">
          <button
            type="button"
            onClick={() => setShowDropZone((v) => !v)}
            className={cn(
              "flex w-full items-center justify-between font-medium text-muted-foreground transition-colors hover:text-foreground",
              embeddedInProductTree ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm",
            )}
          >
            <span className="flex items-center gap-2"><Upload className="w-4 h-4" />{t("pages.menuCosts.salesImportTitle")}</span>
            {showDropZone ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <AnimatePresence>
            {showDropZone && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div ref={dropRef} onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
                  className={cn("mx-4 mb-4 rounded-xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center gap-3 py-8 cursor-pointer",
                    isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/30")}
                  onClick={() => fileInputRef.current?.click()}>
                  {isParsingFile ? (
                    <><Loader2 className="w-8 h-8 animate-spin text-primary" /><p className="text-sm text-muted-foreground">{t("pages.menuCosts.salesImportParsing")}</p></>
                  ) : (
                    <>
                      <div className={cn("p-3 rounded-full transition-colors", isDragging ? "bg-primary/20" : "bg-muted")}>
                        <Upload className={cn("w-6 h-6", isDragging ? "text-primary" : "text-muted-foreground")} />
                      </div>
                      <div className="text-center">
                        <p className="font-medium text-sm">{isDragging ? t("pages.menuCosts.salesImportRelease") : t("pages.menuCosts.salesImportDrop")}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t("pages.menuCosts.salesImportHint")}</p>
                      </div>
                      <Button size="sm" variant="outline" type="button" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}>
                        <FileText className="w-3.5 h-3.5 ml-1.5" />{t("pages.menuCosts.salesImportChoose")}
                      </Button>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.xlsx,.xls,.csv,.rtf,.png,.jpg,.jpeg,.gif,.webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) processFile(f)
                      e.target.value = ""
                    }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
  )

  const savedDatesLine =
    (savedSalesDateFrom || savedSalesDateTo) ? (
        <p
          className={cn(
            "text-muted-foreground flex flex-wrap items-center gap-2 px-0.5",
            embeddedInProductTree ? "text-[10px] leading-tight shrink-0" : "text-xs",
          )}
        >
          <Badge variant="outline" className="font-normal shrink-0 text-[10px] py-0">
            {t("pages.menuCosts.salesReportSavedDatesBadge")}
          </Badge>
          <span>
            {(() => {
              const a = formatIsoDateDisplay(savedSalesDateFrom, locale)
              const b = formatIsoDateDisplay(savedSalesDateTo, locale)
              if (a && b && savedSalesDateFrom === savedSalesDateTo) return a
              if (a && b) return `${a} – ${b}`
              return a || b || ""
            })()}
          </span>
        </p>
      ) : null

  const bigStatsGrid = (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 auto-rows-fr">
        {[
          { icon: UtensilsCrossed, color: "bg-primary/10 text-primary",        label: t("pages.menuCosts.menuItems"),    value: stats.totalItems },
          { icon: Percent,         color: "bg-amber-500/10 text-amber-500",     label: t("pages.menuCosts.avgFoodCost"),  value: `${stats.avgFoodCost.toFixed(1)}%` },
          { icon: DollarSign,      color: "bg-emerald-500/10 text-emerald-500", label: t("pages.menuCosts.grossProfit"),  value: `${stats.totalProfit.toLocaleString()} ₪` },
          { icon: AlertTriangle,   color: "bg-red-500/10 text-red-500",         label: t("pages.menuCosts.dishesToReview"), value: stats.criticalItems },
        ].map(({ icon: Icon, color, label, value }, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} className="h-full">
            <Card className="h-full"><CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className={cn("rounded-xl p-2.5", color.split(" ")[0])}><Icon className={cn("h-6 w-6", color.split(" ")[1])} /></div>
                <div><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="text-3xl font-bold tracking-tight">{value}</p></div>
              </div>
            </CardContent></Card>
          </motion.div>
        ))}
      </div>
  )

  const compactStatsRow = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-sm sm:text-[15px] shrink-0">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <UtensilsCrossed className="h-5 w-5 shrink-0 text-primary" />
        <span className="text-base font-bold tabular-nums text-foreground sm:text-lg">{stats.totalItems}</span>
        <span className="font-medium">{t("pages.menuCosts.menuItems")}</span>
      </span>
      <span className="text-muted-foreground/50" aria-hidden>
        |
      </span>
      <span className="text-muted-foreground">
        <span className="font-medium">{t("pages.menuCosts.avgFoodCost")}:</span>{" "}
        <span className="text-base font-bold tabular-nums text-amber-700 dark:text-amber-400 sm:text-lg">
          {stats.avgFoodCost.toFixed(1)}%
        </span>
      </span>
      <span className="text-muted-foreground/50" aria-hidden>
        |
      </span>
      <span className="text-muted-foreground">
        <span className="font-medium">{t("pages.menuCosts.grossProfit")}:</span>{" "}
        <span className="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400 sm:text-lg">
          {stats.totalProfit.toLocaleString()} ₪
        </span>
      </span>
      <span className="text-muted-foreground/50" aria-hidden>
        |
      </span>
      <span className="text-muted-foreground">
        <span className="font-medium">{t("pages.menuCosts.dishesToReview")}:</span>{" "}
        <span className="text-base font-bold tabular-nums text-red-700 dark:text-red-400 sm:text-lg">
          {stats.criticalItems}
        </span>
      </span>
    </div>
  )

  const toolbarCard = (
      <Card>
        <CardContent className={cn("p-4", embeddedInProductTree && "p-2.5")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("font-bold", embeddedInProductTree ? "text-sm" : "text-lg")}>{t("nav.menuCosts")}</span>
          <Badge variant="secondary" className={embeddedInProductTree ? "text-xs px-2 py-0.5" : ""}>
            {filteredItems.length} {t("pages.menuCosts.dish")}
          </Badge>
        </div>
        <div
          className={cn(
            "flex flex-wrap gap-2",
            embeddedInProductTree ? "mt-2 items-center" : "mt-4 flex-col md:flex-row gap-3",
          )}
        >
          <div className={cn("relative", embeddedInProductTree ? "min-w-[min(100%,12rem)] flex-1 max-w-md" : "flex-1")}>
            <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t("pages.menuCosts.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={cn("pe-10", embeddedInProductTree && "h-8 text-sm")}
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className={cn("w-full md:w-[150px]", embeddedInProductTree && "h-8 w-[min(100%,7.5rem)] text-xs md:w-[7.5rem]")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{categories.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className={cn("w-full md:w-[150px]", embeddedInProductTree && "h-8 w-[min(100%,7.5rem)] text-xs md:w-[7.5rem]")}>
              <SelectValue placeholder={t("pages.menuCosts.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("pages.menuCosts.allStatuses")}</SelectItem>
              <SelectItem value="excellent">{t("pages.menuCosts.excellent")}</SelectItem>
              <SelectItem value="good">{t("pages.menuCosts.good")}</SelectItem>
              <SelectItem value="warning">{t("pages.menuCosts.checkReview")}</SelectItem>
              <SelectItem value="critical">{t("pages.menuCosts.problematic")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className={cn("w-full md:w-[180px]", embeddedInProductTree && "h-8 w-[min(100%,9.5rem)] text-xs md:w-[9.5rem]")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">שם מנה</SelectItem>
              <SelectItem value="cost_asc">עלות נמוכה</SelectItem>
              <SelectItem value="cost_desc">עלות גבוהה</SelectItem>
              <SelectItem value="profit_desc">רווח גבוה</SelectItem>
              <SelectItem value="profit_asc">רווח נמוך</SelectItem>
              <SelectItem value="sales_desc">מכירות</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
      </Card>
  )

  const dataTableCard = (
      <Card className={cn(embeddedInProductTree && "flex min-h-0 flex-1 flex-col overflow-hidden")}>
        <CardContent className={cn("p-0", embeddedInProductTree && "flex min-h-0 flex-1 flex-col")}>
          <div className={cn(embeddedInProductTree ? "min-h-0 flex-1 overflow-auto" : "overflow-x-auto")}>
            <Table>
        <TableHeader><TableRow><TableHead className="text-right">מנה</TableHead><TableHead className="text-center">קטגוריה</TableHead><TableHead className="text-center">מחיר מכירה</TableHead><TableHead className="text-center">עלות מזון</TableHead><TableHead className="text-center">% עלות</TableHead><TableHead className="text-center">רווח</TableHead><TableHead className="text-center">{salesColumnTitleForPeriod(t, savedSalesReportPeriod)}</TableHead><TableHead className="text-center">סטטוס</TableHead></TableRow></TableHeader>
        <TableBody>
          {filteredItems.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={8}
                className={cn(
                  "text-center text-muted-foreground",
                  embeddedInProductTree ? "py-4 text-sm" : "py-8",
                )}
              >
                {t("pages.menuCosts.noItems")}. {t("pages.recipes.addInProductTree")}
              </TableCell>
            </TableRow>
          ) : (
            filteredItems.map((item, index) => {
              const statusConfig = getStatusConfig(item.status); const StatusIcon = statusConfig.icon
              const costBarColor = item.foodCostPercent > 35 ? "bg-red-500" : item.foodCostPercent > 30 ? "bg-amber-500" : "bg-emerald-500"
              return (
                <motion.tr key={item.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.02 }} className="hover:bg-muted/50">
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2 flex-wrap">
                      {item.name}
                      {item.addedFromSalesReport ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-800 dark:text-amber-200">
                          {t("pages.menuCosts.badgeFromSalesReport")}
                        </Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-center"><Badge variant="outline">{item.category}</Badge></TableCell>
                  <TableCell className="text-center font-semibold">{item.salePrice.toFixed(0)} ש"ח</TableCell>
                  <TableCell className="text-center">{item.foodCost.toFixed(2)} ש"ח</TableCell>
                  <TableCell className="text-center"><div className="flex flex-col items-center gap-1"><span className={cn("font-bold", item.foodCostPercent > 35 ? "text-red-600" : item.foodCostPercent > 30 ? "text-amber-600" : "text-emerald-600")}>{item.foodCostPercent.toFixed(1)}%</span><div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden"><div className={cn("h-full", costBarColor)} style={{ width: `${Math.min(item.foodCostPercent * 2, 100)}%` }} /></div></div></TableCell>
                  <TableCell className="text-center"><span className="font-bold text-emerald-600">{item.profit.toFixed(2)} ש"ח</span><span className="text-xs text-muted-foreground block">{item.profitMargin.toFixed(1)}%</span></TableCell>
                  <TableCell className="text-center font-semibold">{item.salesCount}</TableCell>
                  <TableCell className="text-center"><Badge className={statusConfig.color}><StatusIcon className="w-3 h-3 ml-1" />{statusConfig.label}</Badge></TableCell>
                </motion.tr>
              )
            })
          )}
        </TableBody>
      </Table>
          </div>
        </CardContent>
      </Card>
  )

  return (
    <>
      {embeddedInProductTree ? (
        <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden p-2 sm:p-3">
          {savedDatesLine}
          {compactStatsRow}
          {toolbarCard}
          {dataTableCard}
          {salesImportCard}
        </div>
      ) : (
        <div className="space-y-6 overflow-y-auto p-4 md:p-6">
          {salesImportCard}
          {savedDatesLine}
          {bigStatsGrid}
          {toolbarCard}
          {dataTableCard}
        </div>
      )}

      <Dialog
        open={preview.open}
        onOpenChange={(o) => {
          if (!o)
            setPreview({
              open: false,
              fileName: "",
              rows: [],
              rawText: "",
              existingRecipeIds: new Set(),
              salesReportPeriod: undefined,
              salesReportDateFrom: undefined,
              salesReportDateTo: undefined,
            })
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-primary" />{t("pages.menuCosts.salesPreviewTitle")} — {preview.fileName}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground">{t("pages.menuCosts.salesPreviewDetectedPrefix")}</span>{" "}
              <span className="font-bold text-foreground">{preview.rows.length}</span>{" "}
              {t("pages.menuCosts.salesPreviewDetectedSuffix")} {t("pages.menuCosts.salesPreviewIntro")}
            </p>
            {preview.salesReportPeriod !== undefined ? (
              <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">{t("pages.menuCosts.salesReportPeriodLabel")}:</span>
                  <Badge variant="secondary">{salesPeriodShortLabel(t, preview.salesReportPeriod)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{t("pages.menuCosts.salesReportPeriodHint")}</p>
              </div>
            ) : null}
            {(preview.salesReportDateFrom || preview.salesReportDateTo) && (
              <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground font-medium">{t("pages.menuCosts.salesReportDateRangeLabel")}</span>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span>
                    <span className="text-muted-foreground">{t("pages.menuCosts.salesReportDateFromLabel")}: </span>
                    <span className="font-medium tabular-nums">
                      {formatIsoDateDisplay(preview.salesReportDateFrom, locale) || "—"}
                    </span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">{t("pages.menuCosts.salesReportDateToLabel")}: </span>
                    <span className="font-medium tabular-nums">
                      {formatIsoDateDisplay(preview.salesReportDateTo, locale) || "—"}
                    </span>
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{t("pages.menuCosts.salesReportDateHint")}</p>
              </div>
            )}
            <div className="flex items-start gap-3 rounded-lg border border-dashed p-3 bg-muted/30">
              <Checkbox
                id="add-missing-dishes"
                checked={addMissingDishesFromSales}
                onCheckedChange={(v) => setAddMissingDishesFromSales(v === true)}
              />
              <div className="grid gap-1">
                <Label htmlFor="add-missing-dishes" className="text-sm font-medium cursor-pointer">
                  {t("pages.menuCosts.salesAddMissingLabel")}
                </Label>
                <p className="text-xs text-muted-foreground">{t("pages.menuCosts.salesAddMissingHint")}</p>
              </div>
            </div>
            <div className="rounded-lg border overflow-hidden"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">מנה</TableHead>
                  <TableHead className="text-center">{t("pages.menuCosts.salesPreviewColStatus")}</TableHead>
                  <TableHead className="text-center">כמות</TableHead>
                  <TableHead className="text-center">הכנסה (₪)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((row, i) => {
                  const exists = preview.existingRecipeIds.has(row.recipeId)
                  return (
                    <TableRow key={`${row.recipeId}-${i}`}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={exists ? "secondary" : "default"} className={exists ? "" : "bg-amber-600 hover:bg-amber-600"}>
                          {exists ? t("pages.menuCosts.salesRowExisting") : t("pages.menuCosts.salesRowNew")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{row.quantity}</TableCell>
                      <TableCell className="text-center">{row.revenue.toLocaleString()}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table></div>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                disabled={savingSales}
                onClick={() =>
                  setPreview({
                    open: false,
                    fileName: "",
                    rows: [],
                    rawText: "",
                    existingRecipeIds: new Set(),
                    salesReportPeriod: undefined,
                    salesReportDateFrom: undefined,
                    salesReportDateTo: undefined,
                  })
                }
              >
                <X className="w-4 h-4 ml-1.5" />{t("pages.menuCosts.salesCancelButton")}
              </Button>
              <Button disabled={savingSales} onClick={() => void handleConfirmSales()}>
                {savingSales ? <Loader2 className="w-4 h-4 ml-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 ml-1.5" />}
                {savingSales ? t("pages.menuCosts.salesConfirmSaving") : t("pages.menuCosts.salesConfirmButton")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
