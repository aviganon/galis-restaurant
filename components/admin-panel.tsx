"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { Shield, Key, Loader2, LogOut, Settings2, Building2, UserPlus, Users, Check, X, Copy, Ticket, UserCircle, UtensilsCrossed, Package, Truck, Trash2, Plus, Edit2, RefreshCw, Search, ArrowUpDown, ArrowUp, ArrowDown, Globe, ChevronDown, GripVertical, Columns3, Upload as UploadIcon, FileText, TrendingUp, DollarSign, Utensils, AlertTriangle, ShoppingCart } from "lucide-react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { useApp } from "@/contexts/app-context"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu"
import { getClaudeApiKey, setClaudeApiKey, testClaudeConnection } from "@/lib/claude"
import { toast } from "sonner"
import { useTranslations } from "@/lib/use-translations"
import { useLanguage } from "@/contexts/language-context"
import { LanguageSwitcher } from "@/components/language-switcher"
import { signOut } from "firebase/auth"
import { doc, setDoc, getDoc, getDocFromServer, collection, collectionGroup, query, where, getDocs, getDocsFromServer, deleteDoc, writeBatch } from "firebase/firestore"
import { FilePreviewModal } from "@/components/file-preview-modal"
import type { ExtractedSupplierItem } from "@/lib/ai-extract"
import { syncSupplierIngredientsToAssignedRestaurants } from "@/lib/sync-supplier-ingredients"
import { firestoreConfig } from "@/lib/firestore-config"
import { db, auth } from "@/lib/firebase"
import type { UserPermissions } from "@/contexts/app-context"

const VAT_RATE = 1.17

type RestWithDetails = {
  id: string
  name: string
  emoji?: string
  dishesCount: number
  fcAvg: number
  assignedSuppliers: string[]
}

type SupplierWithRests = {
  name: string
  restaurantIds: string[]
  phone?: string | null
  email?: string | null
  contact?: string | null
  address?: string | null
}

type GlobalCheapest = { price: number; supplier: string; unit: string }

type IngredientRow = {
  id: string
  name: string
  unit: string
  price: number
  waste: number
  stock: number
  minStock: number
  supplier: string
  sku: string
  source: "global" | "restaurant"
  status: "שויך" | "ממתין"
  globalCheapest?: GlobalCheapest
  imageUrl?: string
}

function getIngredientImageUrl(name: string): string {
  return `https://source.unsplash.com/56x56/?food,${encodeURIComponent(name.replace(/[()]/g,"").trim())},ingredient`
}

function pricePerKg(p: number, u: string): number {
  const x = (u || "").toLowerCase()
  if (x.includes("ק\"ג") || x === "קג" || x === "kg") return p
  if (x === "גרם" || x === "g") return p * 1000
  return p
}

function webPriceCacheDocId(name: string) {
  return name.replace(/\//g, "_").replace(/\./g, "_") || "unknown"
}

function AdminCheapestPopover({
  ing,
  webPrice,
  onWebPriceSaved,
  t,
}: {
  ing: { name: string; globalCheapest?: { price: number; supplier?: string; unit: string } }
  webPrice?: { price: number; store: string; unit: string }
  onWebPriceSaved?: (data: { price: number; store: string; unit: string }) => void
  t: (key: string) => string
}) {
  const gc = ing.globalCheapest
  const wp = webPrice

  // Is web cheaper than system?
  const webCheaperThanSystem = gc && wp
    ? pricePerKg(wp.price, wp.unit) < pricePerKg(gc.price, gc.unit)
    : false

  const cheapest =
    gc && wp
      ? pricePerKg(gc.price, gc.unit) <= pricePerKg(wp.price, wp.unit)
        ? { price: gc.price, unit: gc.unit, from: "system" as const, supplier: gc.supplier }
        : { price: wp.price, unit: wp.unit, from: "web" as const, store: wp.store }
      : gc
        ? { price: gc.price, unit: gc.unit, from: "system" as const, supplier: gc.supplier }
        : wp
          ? { price: wp.price, unit: wp.unit, from: "web" as const, store: wp.store }
          : null

  const displayPrice = cheapest ? `₪${cheapest.price.toFixed(1)}` : null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={
            !displayPrice
              ? "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors hover:bg-muted text-muted-foreground"
              : webCheaperThanSystem
              ? "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-all bg-emerald-500 hover:bg-emerald-600 text-white shadow-md active:scale-95 animate-pulse"
              : "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all bg-blue-500 hover:bg-blue-600 text-white shadow-sm hover:shadow-md active:scale-95"
          }
        >
          {webCheaperThanSystem && <span className="mr-0.5">🔥</span>}
          {displayPrice || "—"}
          <ChevronDown className="w-3 h-3 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-4">
        <div className="space-y-4">
          {gc ? (
            <div className="rounded-lg border p-3 text-sm">
              <div className="text-xs font-medium text-muted-foreground mb-1">{t("pages.adminPanel.fromSuppliers")}</div>
              <div className="font-semibold">₪{gc.price.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">/ {gc.unit}</span></div>
              {gc.supplier && <div className="text-primary text-xs mt-0.5">{t("pages.ingredients.at")} {gc.supplier}</div>}
            </div>
          ) : (
            <div className="rounded-lg border p-3 text-sm text-muted-foreground">
              <div className="text-xs font-medium mb-1">{t("pages.adminPanel.fromSuppliers")}</div>
              —
            </div>
          )}
          <WebPriceCell
            ingredientName={ing.name}
            cached={webPrice}
            onSaved={onWebPriceSaved}
            t={t}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function WebPriceCell({
  ingredientName,
  cached,
  onSaved,
  t,
}: {
  ingredientName: string
  cached?: { price: number; store: string; unit: string } | null
  onSaved?: (data: { price: number; store: string; unit: string }) => void
  t: (key: string) => string
}) {
  const [data, setData] = useState<{ price: number; store: string; unit: string } | null>(cached ?? null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (cached) setData(cached)
  }, [cached])
  const fetchWebPrice = useCallback(async () => {
    setLoading(true)
    try {
      let d: { price: number; store: string; unit: string } | null = null
      try {
        const res = await fetch("/api/ingredient-web-price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: ingredientName }),
        })
        if (res.ok) {
          const j = await res.json()
          if (j.price) d = { price: j.price, store: j.store || "—", unit: j.unit || "קג" }
        }
      } catch {
        //
      }
      if (!d) {
        const { fetchWebPriceForIngredient } = await import("@/lib/ai-extract")
        d = await fetchWebPriceForIngredient(ingredientName)
      }
      if (d) {
        setData(d)
        onSaved?.(d)
        try {
          await setDoc(doc(db, "webPriceCache", webPriceCacheDocId(ingredientName)), {
            price: d.price,
            store: d.store,
            unit: d.unit,
            checkedAt: new Date().toISOString(),
          })
        } catch {
          //
        }
      } else toast.error(t("pages.adminPanel.priceNotFound"))
    } catch (e) {
      toast.error((e as Error)?.message || t("pages.adminPanel.error"))
    } finally {
      setLoading(false)
    }
  }, [ingredientName, onSaved])
  if (data) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-sm text-blue-700 dark:text-blue-400">
          <div className="text-xs font-medium text-muted-foreground mb-1">{t("pages.adminPanel.fromInternet")}</div>
          <div className="text-xl font-bold">₪{data.price.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">/ {data.unit}</span></div>
          <div className="text-xs mt-0.5">{t("pages.ingredients.at")} {data.store}</div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(ingredientName + " " + data.store + " מחיר קנייה")}`, "_blank")}
          >
            <Globe className="w-4 h-4 ml-2" />
            {t("pages.adminPanel.buyOnline")} →
          </Button>
          <Button variant="outline" size="sm" className="shrink-0" onClick={fetchWebPrice} disabled={loading}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </Button>
        </div>
      </div>
    )
  }
  return (
    <Button variant="outline" size="sm" className="w-full gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300 dark:text-blue-400" onClick={fetchWebPrice} disabled={loading}>
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />}
      {loading ? "מחפש..." : t("pages.adminPanel.checkOnline")}
    </Button>
  )
}

export function AdminPanel() {
  const t = useTranslations()
  const { dir } = useLanguage()
  const { userRole, isSystemOwner, currentRestaurantId, restaurants, onImpersonate, onStopImpersonate, isImpersonating, onRestaurantDeleted, refreshRestaurants, refreshIngredients, setCurrentPage } = useApp()
  const isRtl = dir === "rtl"
  const textAlign = isRtl ? "text-right" : "text-left"
  const justify = isRtl ? "justify-end" : "justify-start"
  const [apiKey, setApiKey] = useState("")
  const [dashTotalRevenue, setDashTotalRevenue] = useState(0)
  const [dashTotalDishesSold, setDashTotalDishesSold] = useState(0)
  const [dashAvgFoodCost, setDashAvgFoodCost] = useState(0)
  const [dashPurchaseOrders, setDashPurchaseOrders] = useState(0)
  const [dashLoadingKpis, setDashLoadingKpis] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newRestName, setNewRestName] = useState("")
  const [newRestEmoji, setNewRestEmoji] = useState("")
  const [newRestInviteCode, setNewRestInviteCode] = useState("")
  const [creatingRest, setCreatingRest] = useState(false)
  const [newRestOpen, setNewRestOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"user"|"manager">("user")
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [createUserEmail, setCreateUserEmail] = useState("")
  const [createUserPassword, setCreateUserPassword] = useState("")
  const [createUserRole, setCreateUserRole] = useState<"manager"|"user">("user")
  const [createUserRestId, setCreateUserRestId] = useState("")
  const [createUserError, setCreateUserError] = useState<string|null>(null)
  const [creatingUser, setCreatingUser] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [assignManagerEmail, setAssignManagerEmail] = useState("")
  const [assigningManager, setAssigningManager] = useState(false)
  const [assignManagerResult, setAssignManagerResult] = useState<{ok:boolean;msg:string}|null>(null)
  const [allSystemUsers, setAllSystemUsers] = useState<{uid:string;email:string;role:string;restaurantId:string|null;restaurantName?:string;name?:string;phone?:string}[]>([])
  const [loadingAllUsers, setLoadingAllUsers] = useState(false)
  const [allUsersLoaded, setAllUsersLoaded] = useState(false)
  const [assignTarget, setAssignTarget] = useState<{uid:string;email:string}|null>(null)
  const [assignTargetRestId, setAssignTargetRestId] = useState("")
  const [savingAssign, setSavingAssign] = useState(false)
  const [restaurantUsers, setRestaurantUsers] = useState<{ uid: string; email?: string; role: string; permissions?: UserPermissions }[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [editingPermissions, setEditingPermissions] = useState<string | null>(null)
  const [generatingCode, setGeneratingCode] = useState(false)
  const [lastGeneratedCode, setLastGeneratedCode] = useState<string | null>(null)
  const [impersonateRestId, setImpersonateRestId] = useState<string>("")
  const [adminStats, setAdminStats] = useState<{ rests: number; users: number; dishes: number; ings: number } | null>(null)
  const [testingApi, setTestingApi] = useState(false)
  const [apiTestResult, setApiTestResult] = useState<string | null>(null)

  // System owner tabs
  const [systemOwnerTab, setSystemOwnerTab] = useState<"restaurants" | "suppliers" | "ingredients" | "users">("restaurants")
  const [restsWithDetails, setRestsWithDetails] = useState<RestWithDetails[]>([])
  const [suppliersWithRests, setSuppliersWithRests] = useState<SupplierWithRests[]>([])
  const [supplierToIngredients, setSupplierToIngredients] = useState<Record<string, IngredientRow[]>>({})
  const [ingredientsList, setIngredientsList] = useState<IngredientRow[]>([])
  const [ingredientsSearchText, setIngredientsSearchText] = useState("")
  const [ingredientsSortBy, setIngredientsSortBy] = useState<keyof IngredientRow | "">("")
  const [ingredientsSortDir, setIngredientsSortDir] = useState<"asc" | "desc">("asc")
  const INGREDIENTS_COLUMN_ORDER_KEY = "admin-ingredients-column-order"
  const defaultColumnOrder = ["name", "price", "cheapest", "sku", "status", "source", "supplier", "minStock", "stock", "waste", "unit"] as const
  const [ingredientsColumnOrder, setIngredientsColumnOrder] = useState<string[]>(() => {
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
  const INGREDIENTS_COLUMN_VISIBILITY_KEY = "admin-ingredients-column-visibility"
  const [ingredientsColumnVisibility, setIngredientsColumnVisibility] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {}
    try {
      const stored = localStorage.getItem(INGREDIENTS_COLUMN_VISIBILITY_KEY)
      if (stored) return JSON.parse(stored) as Record<string, boolean>
    } catch (_) {}
    return {}
  })
  const visibleColumnOrder = ingredientsColumnOrder.filter((k) => ingredientsColumnVisibility[k] !== false)

  const INGREDIENTS_ROW_DENSITY_KEY = "admin-ingredients-row-density"
  type RowDensity = "compact" | "normal" | "expanded"
  const [ingredientsRowDensity, setIngredientsRowDensity] = useState<RowDensity>(() => {
    if (typeof window === "undefined") return "normal"
    try {
      const stored = localStorage.getItem(INGREDIENTS_ROW_DENSITY_KEY) as RowDensity | null
      if (stored && ["compact", "normal", "expanded"].includes(stored)) return stored
    } catch (_) {}
    return "normal"
  })
  const setIngredientsRowDensityAndStore = useCallback((d: RowDensity) => {
    setIngredientsRowDensity(d)
    try { localStorage.setItem(INGREDIENTS_ROW_DENSITY_KEY, d) } catch (_) {}
  }, [])
  const densityCellClass = ingredientsRowDensity === "compact" ? "py-1 px-1.5" : ingredientsRowDensity === "expanded" ? "py-3 px-3" : "py-2 px-2"

  const [suppliersSearchText, setSuppliersSearchText] = useState("")
  const [suppliersFilterAssigned, setSuppliersFilterAssigned] = useState<string>("__all__")
  const [suppliersSortBy, setSuppliersSortBy] = useState<string>("")
  const [suppliersSortDir, setSuppliersSortDir] = useState<"asc" | "desc">("asc")
  const [fpmOpen, setFpmOpen] = useState(false)
  const [fpmFile, setFpmFile] = useState<File | null>(null)
  const [isInvoiceDragging, setIsInvoiceDragging] = useState(false)
  const [showInvoiceUploadArea, setShowInvoiceUploadArea] = useState(false)
  const adminInvoiceFileRef = useRef<HTMLInputElement>(null)
  const INVOICE_ACCEPT = ".xlsx,.xls,.csv,.pdf,.rtf,image/*"
  const [selectedSupplierDetail, setSelectedSupplierDetail] = useState<string | null>(null)
  const [loadingSystemOwner, setLoadingSystemOwner] = useState(false)
  const [addIngredientOpen, setAddIngredientOpen] = useState(false)
  const [addIngredientName, setAddIngredientName] = useState("")
  const [addIngredientPrice, setAddIngredientPrice] = useState("")
  const [addIngredientUnit, setAddIngredientUnit] = useState("ק\"ג")
  const [addIngredientWaste, setAddIngredientWaste] = useState("")
  const [addIngredientStock, setAddIngredientStock] = useState("")
  const [addIngredientMinStock, setAddIngredientMinStock] = useState("")
  const [addIngredientSku, setAddIngredientSku] = useState("")
  const [addIngredientSupplier, setAddIngredientSupplier] = useState("")
  const [addIngredientSaving, setAddIngredientSaving] = useState(false)
  const [editAdminIngredientOpen, setEditAdminIngredientOpen] = useState(false)
  const [editAdminIngredient, setEditAdminIngredient] = useState<IngredientRow | null>(null)
  const [editAdminIngPrice, setEditAdminIngPrice] = useState("")
  const [editAdminIngUnit, setEditAdminIngUnit] = useState("ק\"ג")
  const [editAdminIngWaste, setEditAdminIngWaste] = useState("")
  const [editAdminIngStock, setEditAdminIngStock] = useState("")
  const [editAdminIngMinStock, setEditAdminIngMinStock] = useState("")
  const [editAdminIngSupplier, setEditAdminIngSupplier] = useState("")
  const [editAdminIngSku, setEditAdminIngSku] = useState("")
  const [editAdminIngSaving, setEditAdminIngSaving] = useState(false)
  const [refreshAdminIngredientsKey, setRefreshAdminIngredientsKey] = useState(0)
  const [deletingIngredientId, setDeletingIngredientId] = useState<string | null>(null)
  const [assigningSupplier, setAssigningSupplier] = useState<string | null>(null)
  const [removingSupplier, setRemovingSupplier] = useState<string | null>(null)
  const [deletingRestId, setDeletingRestId] = useState<string | null>(null)
  const [deleteRestDialogOpen, setDeleteRestDialogOpen] = useState(false)
  const [restToDelete, setRestToDelete] = useState<RestWithDetails | null>(null)
  const [deleteSupplierDialogOpen, setDeleteSupplierDialogOpen] = useState(false)
  const [supplierToDelete, setSupplierToDelete] = useState<SupplierWithRests | null>(null)
  const [deletingSupplierName, setDeletingSupplierName] = useState<string | null>(null)
  const [webPriceByIngredient, setWebPriceByIngredient] = useState<Record<string, { price: number; store: string; unit: string }>>({})

  // Add supplier modal (owner)
  const [addSupplierOpen, setAddSupplierOpen] = useState(false)
  const [addSupplierSaving, setAddSupplierSaving] = useState(false)
  const [nsmName, setNsmName] = useState("")
  const [nsmPhone, setNsmPhone] = useState("")
  const [nsmFax, setNsmFax] = useState("")
  const [nsmEmail, setNsmEmail] = useState("")
  const [nsmContact, setNsmContact] = useState("")
  const [nsmAddress, setNsmAddress] = useState("")
  const [nsmDeliveryDay, setNsmDeliveryDay] = useState("")
  const [nsmPaymentTerms, setNsmPaymentTerms] = useState("")
  const [nsmMinOrder, setNsmMinOrder] = useState("")
  const [nsmDeliveryCost, setNsmDeliveryCost] = useState("")
  const [nsmVatId, setNsmVatId] = useState("")
  const [nsmNotes, setNsmNotes] = useState("")
  const [nsmItems, setNsmItems] = useState<{ name: string; price: number; unit: string; waste: number; stock: number; minStock: number; sku: string; pkgSize: number; pkgPrice: number }[]>([])
  const [nsmItemName, setNsmItemName] = useState("")
  const [nsmItemPrice, setNsmItemPrice] = useState("")
  const [nsmItemUnit, setNsmItemUnit] = useState("ק\"ג")
  const [nsmItemWaste, setNsmItemWaste] = useState("")
  const [nsmItemStock, setNsmItemStock] = useState("")
  const [nsmItemMinStock, setNsmItemMinStock] = useState("")
  const [nsmItemSku, setNsmItemSku] = useState("")

  // Edit supplier - add ingredients to existing
  const [editSupplierOpen, setEditSupplierOpen] = useState(false)
  const [editSupplierName, setEditSupplierName] = useState("")
  const [editSupplierSaving, setEditSupplierSaving] = useState(false)
  const [editNsmItems, setEditNsmItems] = useState<{ name: string; price: number; unit: string; waste: number; stock: number; minStock: number; sku: string }[]>([])
  const [editNsmItemName, setEditNsmItemName] = useState("")
  const [editNsmItemPrice, setEditNsmItemPrice] = useState("")
  const [editNsmItemUnit, setEditNsmItemUnit] = useState("ק\"ג")
  const [editNsmItemWaste, setEditNsmItemWaste] = useState("")
  const [editNsmItemStock, setEditNsmItemStock] = useState("")
  const [editNsmItemMinStock, setEditNsmItemMinStock] = useState("")
  const [editNsmItemSku, setEditNsmItemSku] = useState("")
  const [editIngredientSearchOpen, setEditIngredientSearchOpen] = useState(false)

  // Edit supplier details (phone, email, contact, address)
  const [editSupplierDetailsOpen, setEditSupplierDetailsOpen] = useState(false)
  const [editSupplierDetailsName, setEditSupplierDetailsName] = useState("")
  const [editSupplierDetailsPhone, setEditSupplierDetailsPhone] = useState("")
  const [editSupplierDetailsEmail, setEditSupplierDetailsEmail] = useState("")
  const [editSupplierDetailsContact, setEditSupplierDetailsContact] = useState("")
  const [editSupplierDetailsAddress, setEditSupplierDetailsAddress] = useState("")
  const [editSupplierDetailsSaving, setEditSupplierDetailsSaving] = useState(false)

  const hasFullAccess = userRole === "owner" || userRole === "admin" || userRole === "manager"
  const canAddUsers = (isSystemOwner || userRole === "manager" || userRole === "admin") && currentRestaurantId

  if (userRole === "user") {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-lg text-muted-foreground mb-2">{t("pages.adminPanel.noPermission")}</p>
        <p className="text-sm text-muted-foreground">{t("pages.adminPanel.adminOnly")}</p>
      </div>
    )
  }

  useEffect(() => {
    if (!isSystemOwner || isImpersonating) return
    setDashLoadingKpis(true)
    const loadKpis = async () => {
      try {
        const restsSnap = await getDocs(collection(db, "restaurants"))
        let totalRev = 0, totalDishes = 0, poCount = 0
        const fcList: number[] = []
        for (const r of restsSnap.docs) {
          const [recSnap, poSnap] = await Promise.all([
            getDocs(collection(db, "restaurants", r.id, "recipes")),
            getDocs(collection(db, "restaurants", r.id, "purchaseOrders")),
          ])
          poCount += poSnap.docs.length
          recSnap.docs.filter(d => !d.data().isCompound).forEach(d => {
            const data = d.data()
            const sp = (typeof data.sellingPrice === "number" ? data.sellingPrice : 0) / 1.17
            const sold = typeof data.salesCount === "number" ? data.salesCount : 0
            totalRev += sp * sold
            totalDishes += sold
            if (typeof data.foodCostPct === "number" && data.foodCostPct > 0) fcList.push(data.foodCostPct)
          })
        }
        setDashTotalRevenue(Math.round(totalRev))
        setDashTotalDishesSold(totalDishes)
        setDashAvgFoodCost(fcList.length > 0 ? Math.round(fcList.reduce((a,b)=>a+b,0)/fcList.length*10)/10 : 0)
        setDashPurchaseOrders(poCount)
      } catch {} finally { setDashLoadingKpis(false) }
    }
    loadKpis()
  }, [isSystemOwner, isImpersonating])

  useEffect(() => {
    getClaudeApiKey().then((k) => {
      setApiKey(k ? "••••••••••••••••" : "")
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!isSystemOwner) return
    const load = async () => {
      try {
        const [usersSnap, restsSnap, ingsSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "restaurants")),
          getDocs(collection(db, "ingredients")),
        ])
        const rests = restsSnap.docs
        let dishes = 0
        for (const r of rests) {
          const recSnap = await getDocs(collection(db, "restaurants", r.id, "recipes"))
          dishes += recSnap.docs.filter((d) => !d.data().isCompound).length
        }
        setAdminStats({
          rests: rests.length,
          users: usersSnap.docs.length,
          dishes,
          ings: ingsSnap.docs.length,
        })
      } catch {
        setAdminStats(null)
      }
    }
    load()
  }, [isSystemOwner])

  useEffect(() => {
    if (!currentRestaurantId) {
      setRestaurantUsers([])
      return
    }
    setLoadingUsers(true)
    const q = query(
      collection(db, "users"),
      where("restaurantId", "==", currentRestaurantId)
    )
    getDocs(q)
      .then((snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data()
          return {
            uid: d.id,
            email: data.email as string | undefined,
            role: (data.role as string) || "user",
            permissions: data.permissions as UserPermissions | undefined,
          }
        })
        setRestaurantUsers(list)
      })
      .catch(() => setRestaurantUsers([]))
      .finally(() => setLoadingUsers(false))
  }, [currentRestaurantId])

  // Load system owner data (restaurants with details, suppliers, ingredients)
  const loadSystemOwnerData = useCallback(async () => {
    if (!isSystemOwner) return
    setLoadingSystemOwner(true)
    try {
      const [restsSnap, globalIngSnap, suppliersSnap] = await Promise.all([
        getDocs(collection(db, "restaurants")),
        getDocsFromServer(collection(db, "ingredients")),
        getDocsFromServer(collection(db, "suppliers")),
      ])
      let pricesSnap: Awaited<ReturnType<typeof getDocs>>
      try {
        pricesSnap = await getDocs(collectionGroup(db, "prices"))
      } catch {
        pricesSnap = { docs: [], empty: true, size: 0, forEach: () => {} } as Awaited<ReturnType<typeof getDocs>>
      }

      const globalCheapestByIngredient = new Map<string, GlobalCheapest>()
      pricesSnap.forEach((d) => {
        const data = d.data()
        const parentId = d.ref.parent.parent?.id
        if (!parentId) return
        const price = typeof data.price === "number" ? data.price : 0
        if (price <= 0) return
        const unit = (data.unit as string) || "ק\"ג"
        const supplier = (data.supplier as string) || ""
        const existing = globalCheapestByIngredient.get(parentId)
        if (!existing || pricePerKg(price, unit) < pricePerKg(existing.price, existing.unit)) {
          globalCheapestByIngredient.set(parentId, { price, unit, supplier })
        }
      })
      globalIngSnap.forEach((d) => {
        const data = d.data()
        const price = typeof data.price === "number" ? data.price : 0
        const unit = (data.unit as string) || "ק\"ג"
        const sup = (data.supplier as string) || ""
        if (price > 0) {
          const existing = globalCheapestByIngredient.get(d.id)
          if (!existing || pricePerKg(price, unit) < pricePerKg(existing.price, existing.unit)) {
            globalCheapestByIngredient.set(d.id, { price, unit, supplier: sup })
          }
        }
      })

      const supplierSet = new Set<string>()
      const supplierDetails: Record<string, { phone?: string | null; email?: string | null; contact?: string | null; address?: string | null }> = {}
      const supplierToIng: Record<string, IngredientRow[]> = {}
      globalIngSnap.forEach((d) => {
        const data = d.data()
        const s = (data.supplier as string) || ""
        if (s) supplierSet.add(s)
        const row: IngredientRow = {
          id: d.id,
          name: d.id,
          unit: (data.unit as string) || "ק\"ג",
          price: typeof data.price === "number" ? data.price : 0,
          waste: typeof data.waste === "number" ? data.waste : 0,
          stock: typeof data.stock === "number" ? data.stock : 0,
          minStock: typeof data.minStock === "number" ? data.minStock : 0,
          supplier: s,
          sku: (data.sku as string) || "",
          source: "global",
          status: "ממתין",
          globalCheapest: globalCheapestByIngredient.get(d.id),
        }
        if (s) {
          if (!supplierToIng[s]) supplierToIng[s] = []
          supplierToIng[s].push(row)
        }
      })
      suppliersSnap.forEach((d) => {
        const data = d.data()
        const name = (data.name as string) || d.id.replace(/_/g, "/")
        if (name) {
          supplierSet.add(name)
          supplierDetails[name] = {
            phone: data.phone ?? null,
            email: data.email ?? null,
            contact: data.contact ?? null,
            address: data.address ?? null,
          }
        }
      })
      const allSuppliers = Array.from(supplierSet).sort()

      const supplierToRests: Record<string, string[]> = {}
      allSuppliers.forEach((s) => { supplierToRests[s] = [] })

      const restsWithDetailsList: RestWithDetails[] = []
      for (const r of restsSnap.docs) {
        const data = r.data()
        const [recSnap, asDoc, restIngSnap] = await Promise.all([
          getDocs(collection(db, "restaurants", r.id, "recipes")),
          getDocFromServer(doc(db, "restaurants", r.id, "appState", "assignedSuppliers")).catch(() => getDoc(doc(db, "restaurants", r.id, "appState", "assignedSuppliers"))),
          getDocs(collection(db, "restaurants", r.id, "ingredients")),
        ])
        const assignedList: string[] = Array.isArray(asDoc.data()?.list) ? asDoc.data()!.list : []
        assignedList.forEach((s) => {
          if (supplierToRests[s]) supplierToRests[s].push(r.id)
        })

        const dishes = recSnap.docs.filter((d) => !d.data().isCompound)
        const prices: Record<string, number> = {}
        restIngSnap.forEach((d) => {
          const ddata = d.data()
          prices[d.id] = typeof ddata.price === "number" ? ddata.price : 0
        })
        globalIngSnap.forEach((d) => {
          const ddata = d.data()
          const sup = (ddata.supplier as string) || ""
          if (!(d.id in prices) && (!sup || assignedList.includes(sup))) {
            prices[d.id] = typeof ddata.price === "number" ? ddata.price : 0
          }
        })

        let fcSum = 0
        let fcCount = 0
        dishes.forEach((d) => {
          const ddata = d.data()
          const sellingPrice = (typeof ddata.sellingPrice === "number" ? ddata.sellingPrice : 0) / VAT_RATE
          const ing = Array.isArray(ddata.ingredients) ? ddata.ingredients : []
          let cost = 0
          ing.forEach((i: { name?: string; qty?: number; waste?: number; unit?: string }) => {
            const p = prices[i.name || ""] ?? 0
            let mult = 1
            if (i.unit === "גרם") mult = 0.001
            else if (i.unit === "מל") mult = 0.001
            cost += (i.qty || 0) * p * mult * (1 + (i.waste || 0) / 100)
          })
          const fcPct = sellingPrice > 0 ? (cost / sellingPrice) * 100 : 0
          fcSum += fcPct
          fcCount++
        })
        const fcAvg = fcCount > 0 ? fcSum / fcCount : 0

        restsWithDetailsList.push({
          id: r.id,
          name: data.name || r.id,
          emoji: data.emoji,
          dishesCount: dishes.length,
          fcAvg: Math.round(fcAvg * 10) / 10,
          assignedSuppliers: assignedList,
        })
      }

      setRestsWithDetails(restsWithDetailsList)
      setSuppliersWithRests(
        allSuppliers.map((s) => ({
          name: s,
          restaurantIds: supplierToRests[s] || [],
          ...supplierDetails[s],
        }))
      )
      setSupplierToIngredients(supplierToIng)
      const allIngredients: IngredientRow[] = globalIngSnap.docs.map((d) => {
        const data = d.data()
        const s = (data.supplier as string) || ""
        return {
          id: d.id,
          name: d.id,
          unit: (data.unit as string) || "ק\"ג",
          price: typeof data.price === "number" ? data.price : 0,
          waste: typeof data.waste === "number" ? data.waste : 0,
          stock: typeof data.stock === "number" ? data.stock : 0,
          minStock: typeof data.minStock === "number" ? data.minStock : 0,
          supplier: s,
          sku: (data.sku as string) || "",
          source: "global",
          status: "ממתין",
          globalCheapest: globalCheapestByIngredient.get(d.id),
        }
      })
      setIngredientsList(allIngredients)
      const webCache: Record<string, { price: number; store: string; unit: string }> = {}
      await Promise.all(
        allIngredients.map(async (ing) => {
          try {
            const snap = await getDoc(doc(db, "webPriceCache", webPriceCacheDocId(ing.name)))
            const d = snap.data()
            if (d && typeof d.price === "number") {
              webCache[ing.name] = { price: d.price, store: (d.store as string) || "—", unit: (d.unit as string) || "קג" }
            }
          } catch {
            //
          }
        })
      )
      setWebPriceByIngredient(webCache)
    } catch (e) {
      console.error("load system owner data:", e)
      toast.error(t("pages.adminPanel.loadError"))
    } finally {
      setLoadingSystemOwner(false)
    }
  }, [isSystemOwner])

  useEffect(() => {
    if (isSystemOwner) {
      loadSystemOwnerData()
    }
  }, [isSystemOwner, loadSystemOwnerData])

  // רכיבים נטענים ב-loadSystemOwnerData — אין צורך בטעינה נפרדת בלשונית

  const filteredAndSortedSuppliers = (() => {
    let list = [...(suppliersWithRests || [])]
    const q = suppliersSearchText.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.phone || "").toLowerCase().includes(q) ||
          (s.email || "").toLowerCase().includes(q) ||
          (s.contact || "").toLowerCase().includes(q)
      )
    }
    if (suppliersFilterAssigned !== "__all__") {
      if (suppliersFilterAssigned === "assigned") list = list.filter((s) => (s.restaurantIds?.length ?? 0) > 0)
      else if (suppliersFilterAssigned === "unassigned") list = list.filter((s) => (s.restaurantIds?.length ?? 0) === 0)
    }
    if (suppliersSortBy) {
      const dir = suppliersSortDir === "asc" ? 1 : -1
      list.sort((a, b) => {
        if (suppliersSortBy === "name") return a.name.localeCompare(b.name) * dir
        if (suppliersSortBy === "phone") return ((a.phone || "").localeCompare(b.phone || "")) * dir
        if (suppliersSortBy === "email") return ((a.email || "").localeCompare(b.email || "")) * dir
        if (suppliersSortBy === "contact") return ((a.contact || "").localeCompare(b.contact || "")) * dir
        if (suppliersSortBy === "restaurants") return ((a.restaurantIds?.length ?? 0) - (b.restaurantIds?.length ?? 0)) * dir
        return 0
      })
    }
    return list
  })()

  const filteredAndSortedIngredients = (() => {
    let list = [...(ingredientsList || [])]
    const q = ingredientsSearchText.trim().toLowerCase().replace(/\s+/g, " ")
    if (q) {
      const terms = q.split(/\s+/).filter(Boolean)
      list = list.filter((i) => {
        const name = (i.name || "").toLowerCase()
        const supplier = (i.supplier || "").toLowerCase()
        const sku = (i.sku || "").toLowerCase()
        const status = (i.status || "").toLowerCase()
        const searchable = `${name} ${supplier} ${sku} ${status}`
        return terms.every((t) => searchable.includes(t))
      })
    }
    if (ingredientsSortBy) {
      const key = ingredientsSortBy
      const dir = ingredientsSortDir === "asc" ? 1 : -1
      list.sort((a, b) => {
        const va = a[key as keyof IngredientRow]
        const vb = b[key as keyof IngredientRow]
        if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir
        if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir
        return 0
      })
    }
    return list
  })()

  const handleIngredientsColumnReorder = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    setIngredientsColumnOrder((prev) => {
      const visible = prev.filter((k) => ingredientsColumnVisibility[k] !== false)
      const hidden = prev.filter((k) => ingredientsColumnVisibility[k] === false)
      const nextVisible = [...visible]
      const [removed] = nextVisible.splice(fromIndex, 1)
      nextVisible.splice(toIndex, 0, removed)
      const next = [...nextVisible, ...hidden]
      try {
        localStorage.setItem(INGREDIENTS_COLUMN_ORDER_KEY, JSON.stringify(next))
      } catch (_) {}
      return next
    })
  }, [ingredientsColumnVisibility])

  const toggleIngredientsColumnVisibility = useCallback((key: string) => {
    setIngredientsColumnVisibility((prev) => {
      const next = { ...prev, [key]: prev[key] === false }
      try {
        localStorage.setItem(INGREDIENTS_COLUMN_VISIBILITY_KEY, JSON.stringify(next))
      } catch (_) {}
      return next
    })
  }, [])

  const resetAddIngredientModal = () => {
    setAddIngredientName("")
    setAddIngredientPrice("")
    setAddIngredientUnit("ק\"ג")
    setAddIngredientWaste("")
    setAddIngredientStock("")
    setAddIngredientMinStock("")
    setAddIngredientSku("")
    setAddIngredientSupplier("")
  }

  const handleSaveAddIngredient = async () => {
    const name = addIngredientName.trim()
    const price = parseFloat(String(addIngredientPrice)) || 0
    const waste = parseFloat(String(addIngredientWaste)) || 0
    const stock = parseFloat(String(addIngredientStock)) || 0
    const minStock = parseFloat(String(addIngredientMinStock)) || 0
    const sku = addIngredientSku.trim()
    const supplier = addIngredientSupplier.trim()
    if (!name) {
      toast.error(t("pages.adminPanel.enterIngredientName"))
      return
    }
    setAddIngredientSaving(true)
    try {
      const data = {
        price,
        unit: addIngredientUnit,
        waste,
        stock,
        minStock,
        sku: sku || "",
        supplier,
        createdBy: "owner",
        lastUpdated: new Date().toISOString(),
      }
      await setDoc(doc(db, "ingredients", name), data, { merge: true })
      if (supplier) {
        const priceId = supplier.replace(/\//g, "_").replace(/\./g, "_").trim() || "default"
        await setDoc(doc(db, "ingredients", name, "prices", priceId), { price, unit: addIngredientUnit, supplier, lastUpdated: data.lastUpdated }, { merge: true })
        const synced = await syncSupplierIngredientsToAssignedRestaurants(
          supplier,
          [{ name, price, unit: addIngredientUnit, supplier, waste, sku: sku || "" }]
        )
        if (synced > 0) {
          toast.success(`רכיב נוסף לקטלוג הגלובלי — עודכן ב־${synced} מסעדות משויכות`)
        } else {
          toast.success("רכיב נוסף לקטלוג הגלובלי — ישויך למסעדות בעת שיוך הספק")
        }
      } else {
        toast.success("רכיב נוסף לקטלוג הגלובלי — ניתן לשייך ספק בעריכה")
      }
      setAddIngredientOpen(false)
      resetAddIngredientModal()
      loadSystemOwnerData()
    } catch (e) {
      toast.error((e as Error)?.message || t("pages.adminPanel.error"))
    } finally {
      setAddIngredientSaving(false)
    }
  }

  const openEditAdminIngredient = (ing: IngredientRow) => {
    setEditAdminIngredient(ing)
    setEditAdminIngPrice(ing.price === 0 ? "" : String(ing.price))
    setEditAdminIngUnit(ing.unit || "ק\"ג")
    setEditAdminIngWaste(ing.waste === 0 ? "" : String(ing.waste))
    setEditAdminIngStock(ing.stock === 0 ? "" : String(ing.stock))
    setEditAdminIngMinStock(ing.minStock === 0 ? "" : String(ing.minStock))
    setEditAdminIngSupplier(ing.supplier || "")
    setEditAdminIngSku(ing.sku || "")
    setEditAdminIngredientOpen(true)
  }

  const handleSaveEditAdminIngredient = async () => {
    if (!editAdminIngredient) return
    setEditAdminIngSaving(true)
    try {
      const price = parseFloat(String(editAdminIngPrice)) || 0
      const waste = parseFloat(String(editAdminIngWaste)) || 0
      const stock = parseFloat(String(editAdminIngStock)) || 0
      const minStock = parseFloat(String(editAdminIngMinStock)) || 0
      const supplier = editAdminIngSupplier.trim()
      const sku = editAdminIngSku.trim()
      const data = {
        price,
        unit: editAdminIngUnit,
        waste,
        stock,
        minStock,
        sku: sku || "",
        supplier: supplier || "",
        lastUpdated: new Date().toISOString(),
      }
      await setDoc(doc(db, "ingredients", editAdminIngredient.id), data, { merge: true })
      if (supplier) {
        const priceId = supplier.replace(/\//g, "_").replace(/\./g, "_").trim() || "default"
        await setDoc(doc(db, "ingredients", editAdminIngredient.id, "prices", priceId), { price, unit: editAdminIngUnit, supplier, lastUpdated: data.lastUpdated }, { merge: true })
        const synced = await syncSupplierIngredientsToAssignedRestaurants(
          supplier,
          [{ name: editAdminIngredient.name, price, unit: editAdminIngUnit, supplier, waste, sku }]
        )
        if (synced > 0) {
          toast.success(`רכיב עודכן — עודכן ב־${synced} מסעדות משויכות`)
        } else {
          toast.success(`רכיב "${editAdminIngredient.name}" עודכן`)
        }
      } else {
        toast.success(`רכיב "${editAdminIngredient.name}" עודכן`)
      }
      setEditAdminIngredientOpen(false)
      setEditAdminIngredient(null)
      setRefreshAdminIngredientsKey((k) => k + 1)
      loadSystemOwnerData()
    } catch (e) {
      toast.error((e as Error)?.message || t("pages.adminPanel.error"))
    } finally {
      setEditAdminIngSaving(false)
    }
  }

  const handleDeleteIngredientFromSupplier = async (ing: IngredientRow, supplierName: string, restaurantIds?: string[]) => {
    const key = `${ing.source}-${ing.id}`
    setDeletingIngredientId(key)
    try {
      await deleteDoc(doc(db, "ingredients", ing.id))
      const restIds = restaurantIds || []
      for (const rid of restIds) {
        try {
          await deleteDoc(doc(db, "restaurants", rid, "ingredients", ing.id))
        } catch (_) {}
      }
      toast.success(`רכיב "${ing.name}" נמחק${restIds.length > 0 ? ` מ־${restIds.length} מסעדות` : ""}`)
      setRefreshAdminIngredientsKey((k) => k + 1)
      loadSystemOwnerData()
    } catch (e) {
      toast.error((e as Error)?.message || t("pages.adminPanel.deleteError"))
    } finally {
      setDeletingIngredientId(null)
    }
  }

  const handleAssignSupplier = async (restId: string, supplierName: string) => {
    setAssigningSupplier(`${restId}:${supplierName}`)
    try {
      const sn = (supplierName || "").trim()
      if (!sn) {
        toast.error(t("pages.adminPanel.invalidSupplierName"))
        return
      }
      const asRef = doc(db, "restaurants", restId, "appState", "assignedSuppliers")
      const asSnap = await getDocFromServer(asRef).catch(() => getDoc(asRef))
      const current: string[] = Array.isArray(asSnap.data()?.list) ? asSnap.data()!.list : []
      if (current.some((s) => (s || "").trim() === sn)) {
        toast.info(t("pages.adminPanel.supplierAlreadyAssigned"))
        return
      }
      const nextList = [...current, sn]
      await setDoc(asRef, { list: nextList }, { merge: true })

      const globalIngSnap = await getDocs(collection(db, "ingredients"))
      const toCopy: { id: string; data: Record<string, unknown> }[] = []
      globalIngSnap.forEach((d) => {
        const data = d.data()
        const ingSup = (data.supplier as string) || ""
        if (ingSup.trim() === sn) {
          toCopy.push({
            id: d.id,
            data: {
              price: data.price ?? 0,
              unit: data.unit ?? "ק\"ג",
              supplier: sn,
              waste: data.waste ?? 0,
              stock: data.stock ?? 0,
              minStock: data.minStock ?? 0,
              sku: data.sku ?? "",
              category: data.category ?? "אחר",
              lastUpdated: new Date().toISOString(),
            },
          })
        }
      })
      for (let i = 0; i < toCopy.length; i += 500) {
        const batch = writeBatch(db)
        toCopy.slice(i, i + 500).forEach(({ id, data }) =>
          batch.set(doc(db, "restaurants", restId, "ingredients", id), data, { merge: true })
        )
        await batch.commit()
      }
      const supplierId = sn.replace(/\//g, "_").trim() || "supplier"
      const supplierDoc = await getDoc(doc(db, "suppliers", supplierId))
      if (!supplierDoc.exists()) {
        await setDoc(doc(db, "suppliers", supplierId), { name: sn, lastUpdated: new Date().toISOString() }, { merge: true })
      }
      const count = toCopy.length
      toast.success(`שויך ${sn}. הועתקו ${count} רכיבים.`)
      refreshIngredients?.()
      loadSystemOwnerData()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAssigningSupplier(null)
    }
  }

  const handleConfirmAdminSupplier = useCallback(
    async (items: ExtractedSupplierItem[], supName: string) => {
      const supTrim = supName.trim()
      if (!supTrim) {
        toast.error("יש להזין שם ספק")
        return
      }
      const now = new Date().toISOString()
      const batch = writeBatch(db)
      let count = 0
      items.forEach((item) => {
        if (!item.name?.trim()) return
        const isDeliveryNoteItem = item.price === 0 && typeof item.qty === "number" && item.qty > 0
        if (item.price <= 0 && !isDeliveryNoteItem) return
        const payload: Record<string, unknown> = {
          ...(item.price > 0 ? { price: item.price } : {}),
          unit: item.unit || "קג",
          supplier: supTrim,
          lastUpdated: now,
          createdBy: "global" as const,
          sku: item.sku ?? "",
        }
        batch.set(doc(db, "ingredients", item.name.trim()), payload, { merge: true })
        const priceId = supTrim.replace(/\//g, "_").replace(/\./g, "_").trim() || "default"
        batch.set(doc(db, "ingredients", item.name.trim(), "prices", priceId), {
          price: item.price,
          unit: item.unit || "קג",
          supplier: supTrim,
          lastUpdated: now,
        }, { merge: true })
        count++
      })
      if (count > 0) {
        await batch.commit()
        const supplierId = supTrim.replace(/\//g, "_").replace(/\./g, "_").trim() || "supplier"
        await setDoc(doc(db, "suppliers", supplierId), { name: supTrim, lastUpdated: now, createdBy: "owner" }, { merge: true })
        const toSync = items.filter((i) => i.name?.trim() && i.price > 0).map((i) => ({ name: i.name!.trim(), price: i.price, unit: i.unit || "קג", supplier: supTrim, waste: 0, sku: i.sku ?? "", ...(typeof i.qty === "number" && i.qty > 0 ? { qty: i.qty } : {}) }))
        if (toSync.length > 0) {
          const synced = await syncSupplierIngredientsToAssignedRestaurants(supTrim, toSync)
          const restCount = synced > 0 ? Math.ceil(synced / toSync.length) : 0
          toast.success(`ספק "${supTrim}" — ${count} רכיבים נוספו לקטלוג הגלובלי${restCount > 0 ? ` — עודכן ב־${restCount} מסעדות` : ""}`)
        } else {
          toast.success(`ספק "${supTrim}" — ${count} רכיבים נוספו לקטלוג הגלובלי`)
        }
        loadSystemOwnerData()
      } else {
        toast.warning("אין רכיבים תקינים לשמירה (שם ריק או מחיר 0)")
      }
      setFpmFile(null)
      setFpmOpen(false)
    },
    [loadSystemOwnerData]
  )

  useEffect(() => {
    const prevent = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault()
        e.dataTransfer.dropEffect = "copy"
      }
    }
    window.addEventListener("dragover", prevent, { passive: false })
    window.addEventListener("drop", prevent, { passive: false })
    return () => { window.removeEventListener("dragover", prevent); window.removeEventListener("drop", prevent) }
  }, [])

  const handleAdminInvoiceDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "copy"
    setIsInvoiceDragging(true)
  }, [])

  const handleAdminInvoiceDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsInvoiceDragging(true)
  }, [])

  const handleAdminInvoiceDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsInvoiceDragging(false)
  }, [])

  const handleAdminInvoiceDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsInvoiceDragging(false)
    const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : []
    if (files.length > 0) {
      setFpmFile(files[0])
      setFpmOpen(true)
    }
  }, [])

  const handleAdminInvoiceFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.length) {
      setFpmFile(files[0])
      setFpmOpen(true)
    }
    e.target.value = ""
  }, [])

  const resetAddSupplierModal = () => {
    setNsmName("")
    setNsmPhone("")
    setNsmFax("")
    setNsmEmail("")
    setNsmContact("")
    setNsmAddress("")
    setNsmDeliveryDay("")
    setNsmPaymentTerms("")
    setNsmMinOrder("")
    setNsmDeliveryCost("")
    setNsmVatId("")
    setNsmNotes("")
    setNsmItems([])
    setNsmItemName("")
    setNsmItemPrice("")
    setNsmItemUnit("ק\"ג")
    setNsmItemWaste("")
    setNsmItemStock("")
    setNsmItemMinStock("")
    setNsmItemSku("")
  }

  const addNsmItem = () => {
    const name = nsmItemName.trim()
    const price = parseFloat(String(nsmItemPrice)) || 0
    const waste = parseFloat(String(nsmItemWaste)) || 0
    const stock = parseFloat(String(nsmItemStock)) || 0
    const minStock = parseFloat(String(nsmItemMinStock)) || 0
    const sku = nsmItemSku.trim()
    if (!name) {
      toast.error(t("pages.adminPanel.enterIngredientName"))
      return
    }
    setNsmItems((prev) => [...prev.filter((i) => i.name !== name), { name, price, unit: nsmItemUnit, waste, stock, minStock, sku, pkgSize: 0, pkgPrice: 0 }])
    setNsmItemName("")
    setNsmItemPrice("")
    setNsmItemUnit("ק\"ג")
    setNsmItemWaste("")
    setNsmItemStock("")
    setNsmItemMinStock("")
    setNsmItemSku("")
  }

  const removeNsmItem = (name: string) => {
    setNsmItems((prev) => prev.filter((i) => i.name !== name))
  }

  const handleSaveNewSupplier = async () => {
    const supName = nsmName.trim()
    if (!supName) {
      toast.error(t("pages.adminPanel.enterSupplierName"))
      return
    }
    if (nsmItems.length === 0) {
      toast.error(t("pages.adminPanel.addAtLeastOne"))
      return
    }
    setAddSupplierSaving(true)
    try {
      const batch = writeBatch(db)
      const now = new Date().toISOString()
      nsmItems.forEach((item) => {
        batch.set(doc(db, "ingredients", item.name), {
          price: item.price,
          unit: item.unit,
          waste: item.waste ?? 0,
          stock: item.stock ?? 0,
          minStock: item.minStock ?? 0,
          sku: item.sku ?? "",
          supplier: supName,
          createdBy: "owner",
          lastUpdated: now,
        }, { merge: true })
      })
      await batch.commit()

      const supplierId = supName.replace(/\//g, "_").trim() || "supplier"
      await setDoc(doc(db, "suppliers", supplierId), {
        name: supName,
        phone: nsmPhone.trim() || null,
        fax: nsmFax.trim() || null,
        email: nsmEmail.trim() || null,
        contact: nsmContact.trim() || null,
        address: nsmAddress.trim() || null,
        deliveryDay: nsmDeliveryDay || null,
        paymentTerms: nsmPaymentTerms || null,
        minOrder: nsmMinOrder ? parseFloat(nsmMinOrder) : null,
        deliveryCost: nsmDeliveryCost ? parseFloat(nsmDeliveryCost) : null,
        vatId: nsmVatId.trim() || null,
        notes: nsmNotes.trim() || null,
        createdBy: "owner",
        lastUpdated: now,
      }, { merge: true })

      const synced = await syncSupplierIngredientsToAssignedRestaurants(
        supName,
        nsmItems.map((item) => ({
          name: item.name,
          price: item.price,
          unit: item.unit,
          supplier: supName,
          waste: item.waste ?? 0,
          sku: item.sku ?? "",
        }))
      )
      if (synced > 0) {
        toast.success(`ספק ${supName} נוסף — עודכן ב־${Math.ceil(synced / nsmItems.length)} מסעדות`)
      } else {
        toast.success(`ספק ${supName} נוסף בהצלחה`)
      }
      setAddSupplierOpen(false)
      resetAddSupplierModal()
      loadSystemOwnerData()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAddSupplierSaving(false)
    }
  }

  const openEditSupplierDetails = (s: SupplierWithRests) => {
    setEditSupplierDetailsName(s.name)
    setEditSupplierDetailsPhone(s.phone || "")
    setEditSupplierDetailsEmail(s.email || "")
    setEditSupplierDetailsContact(s.contact || "")
    setEditSupplierDetailsAddress(s.address || "")
    setEditSupplierDetailsOpen(true)
  }

  const handleSaveEditSupplierDetails = async () => {
    if (!editSupplierDetailsName) return
    setEditSupplierDetailsSaving(true)
    try {
      const supplierId = editSupplierDetailsName.replace(/\//g, "_").trim() || "supplier"
      await setDoc(doc(db, "suppliers", supplierId), {
        name: editSupplierDetailsName,
        phone: editSupplierDetailsPhone.trim() || null,
        email: editSupplierDetailsEmail.trim() || null,
        contact: editSupplierDetailsContact.trim() || null,
        address: editSupplierDetailsAddress.trim() || null,
        lastUpdated: new Date().toISOString(),
      }, { merge: true })
      toast.success(`פרטי ספק "${editSupplierDetailsName}" עודכנו`)
      setEditSupplierDetailsOpen(false)
      loadSystemOwnerData()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setEditSupplierDetailsSaving(false)
    }
  }

  const openEditSupplier = (supplierName: string) => {
    setEditSupplierName(supplierName)
    setEditNsmItems([])
    setEditNsmItemName("")
    setEditNsmItemPrice("")
    setEditNsmItemUnit("ק\"ג")
    setEditNsmItemWaste("")
    setEditNsmItemStock("")
    setEditNsmItemMinStock("")
    setEditNsmItemSku("")
    setEditIngredientSearchOpen(false)
    setEditSupplierOpen(true)
  }

  const addEditNsmItem = () => {
    const name = editNsmItemName.trim()
    const price = parseFloat(String(editNsmItemPrice)) || 0
    const waste = parseFloat(String(editNsmItemWaste)) || 0
    const stock = parseFloat(String(editNsmItemStock)) || 0
    const minStock = parseFloat(String(editNsmItemMinStock)) || 0
    const sku = editNsmItemSku.trim()
    if (!name) {
      toast.error(t("pages.adminPanel.enterIngredientName"))
      return
    }
    setEditNsmItems((prev) => [...prev.filter((i) => i.name !== name), { name, price, unit: editNsmItemUnit, waste, stock, minStock, sku }])
    setEditNsmItemName("")
    setEditNsmItemPrice("")
    setEditNsmItemUnit("ק\"ג")
    setEditNsmItemWaste("")
    setEditNsmItemStock("")
    setEditNsmItemMinStock("")
    setEditNsmItemSku("")
  }

  const removeEditNsmItem = (name: string) => {
    setEditNsmItems((prev) => prev.filter((i) => i.name !== name))
  }

  const handleSaveEditSupplier = async () => {
    if (!editSupplierName || editNsmItems.length === 0) {
      toast.error(t("pages.adminPanel.addAtLeastOne"))
      return
    }
    setEditSupplierSaving(true)
    try {
      const batch = writeBatch(db)
      const now = new Date().toISOString()
      editNsmItems.forEach((item) => {
        batch.set(doc(db, "ingredients", item.name), {
          price: item.price,
          unit: item.unit,
          waste: item.waste ?? 0,
          stock: item.stock ?? 0,
          minStock: item.minStock ?? 0,
          sku: item.sku ?? "",
          supplier: editSupplierName,
          createdBy: "owner",
          lastUpdated: now,
        }, { merge: true })
      })
      await batch.commit()

      const synced = await syncSupplierIngredientsToAssignedRestaurants(
        editSupplierName,
        editNsmItems.map((item) => ({
          name: item.name,
          price: item.price,
          unit: item.unit,
          supplier: editSupplierName,
          waste: item.waste ?? 0,
          sku: item.sku ?? "",
        }))
      )
      toast.success(
        synced > 0
          ? `רכיבים עודכנו — עודכן ב־${Math.ceil(synced / editNsmItems.length)} מסעדות`
          : t("pages.adminPanel.ingredientsUpdated")
      )
      setEditSupplierOpen(false)
      loadSystemOwnerData()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setEditSupplierSaving(false)
    }
  }

  const handleRemoveSupplier = async (restId: string, supplierName: string) => {
    setRemovingSupplier(`${restId}:${supplierName}`)
    try {
      const asRef = doc(db, "restaurants", restId, "appState", "assignedSuppliers")
      const asSnap = await getDocFromServer(asRef).catch(() => getDoc(asRef))
      const current: string[] = Array.isArray(asSnap.data()?.list) ? asSnap.data()!.list : []
      const sn = (supplierName || "").trim()
      const nextList = current.filter((s) => (s || "").trim() !== sn)
      await setDoc(asRef, { list: nextList }, { merge: true })

      const restIngSnap = await getDocs(collection(db, "restaurants", restId, "ingredients"))
      const toUpdate: string[] = []
      restIngSnap.forEach((d) => {
        const ingSup = (d.data().supplier as string) || ""
        if (ingSup.trim() === sn) toUpdate.push(d.id)
      })
      const now = new Date().toISOString()
      for (let i = 0; i < toUpdate.length; i += 500) {
        const batch = writeBatch(db)
        toUpdate.slice(i, i + 500).forEach((ingId) => {
          batch.set(doc(db, "restaurants", restId, "ingredients", ingId), { supplier: "", lastUpdated: now }, { merge: true })
        })
        await batch.commit()
      }

      toast.success("הספק הוסר מהשיוך — הרכיבים נשארו עם ללא ספק")
      refreshIngredients?.()
      loadSystemOwnerData()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRemovingSupplier(null)
    }
  }

  const handleDeleteSupplier = async () => {
    const s = supplierToDelete
    if (!s) return
    setDeletingSupplierName(s.name)
    try {
      const supplierId = s.name.replace(/\//g, "_").trim() || "supplier"
      const ingList = supplierToIngredients[s.name] || []
      const restIds = s.restaurantIds || []

      for (const restId of restIds) {
        const asRef = doc(db, "restaurants", restId, "appState", "assignedSuppliers")
        const asSnap = await getDoc(asRef)
        const current: string[] = Array.isArray(asSnap.data()?.list) ? asSnap.data()!.list : []
        const nextList = current.filter((x) => x !== s.name)
        await setDoc(asRef, { list: nextList }, { merge: true })
      }

      const now = new Date().toISOString()
      for (let i = 0; i < ingList.length; i += 500) {
        const batch = writeBatch(db)
        const chunk = ingList.slice(i, i + 500)
        for (const ing of chunk) {
          batch.update(doc(db, "ingredients", ing.id), { supplier: "", lastUpdated: now })
        }
        await batch.commit()
      }
      for (const rid of restIds) {
        const restIngSnap = await getDocs(collection(db, "restaurants", rid, "ingredients"))
        const toUpdate: string[] = []
        restIngSnap.forEach((d) => {
          if ((d.data().supplier as string) === s.name) toUpdate.push(d.id)
        })
        if (toUpdate.length > 0) {
          for (let i = 0; i < toUpdate.length; i += 500) {
            const batch = writeBatch(db)
            toUpdate.slice(i, i + 500).forEach((ingId) => {
              batch.update(doc(db, "restaurants", rid, "ingredients", ingId), { supplier: "", lastUpdated: now })
            })
            await batch.commit()
          }
        }
      }

      await deleteDoc(doc(db, "suppliers", supplierId))
      toast.success(`ספק "${s.name}" נמחק — הרכיבים נשארו עם ללא ספק`)
      setDeleteSupplierDialogOpen(false)
      setSupplierToDelete(null)
      setSelectedSupplierDetail(null)
      loadSystemOwnerData()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeletingSupplierName(null)
    }
  }

  const handleDeleteRestaurant = async (rest: RestWithDetails) => {
    setDeletingRestId(rest.id)
    try {
      const [recSnap, ingSnap, appSnap] = await Promise.all([
        getDocs(collection(db, "restaurants", rest.id, "recipes")),
        getDocs(collection(db, "restaurants", rest.id, "ingredients")),
        getDocs(collection(db, "restaurants", rest.id, "appState")),
      ])
      const toDelete: { col: string; id: string }[] = []
      recSnap.docs.forEach((d) => toDelete.push({ col: "recipes", id: d.id }))
      ingSnap.docs.forEach((d) => toDelete.push({ col: "ingredients", id: d.id }))
      appSnap.docs.forEach((d) => toDelete.push({ col: "appState", id: d.id }))
      for (let i = 0; i < toDelete.length; i += 500) {
        const batch = writeBatch(db)
        toDelete.slice(i, i + 500).forEach(({ col, id }) =>
          batch.delete(doc(db, "restaurants", rest.id, col, id))
        )
        await batch.commit()
      }
      await deleteDoc(doc(db, "restaurants", rest.id))
      const usersSnap = await getDocs(query(collection(db, "users"), where("restaurantId", "==", rest.id)))
      const userBatch = writeBatch(db)
      usersSnap.docs.forEach((u) => userBatch.update(doc(db, "users", u.id), { restaurantId: null }))
      if (usersSnap.docs.length > 0) await userBatch.commit()
      toast.success(`מסעדה "${rest.name}" נמחקה`)
      setDeleteRestDialogOpen(false)
      setRestToDelete(null)
      loadSystemOwnerData()
      onRestaurantDeleted?.(rest.id)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeletingRestId(null)
    }
  }

  const handleSavePermissions = async (uid: string, perms: UserPermissions) => {
    try {
      await setDoc(doc(db, "users", uid), { permissions: perms }, { merge: true })
      setRestaurantUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, permissions: perms } : u))
      )
      toast.success(t("pages.adminPanel.permissionsUpdated"))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleSaveKey = async () => {
    const input = (document.getElementById("claude-api-key") as HTMLInputElement)?.value?.trim()
    if (!input) {
      toast.error("הזן מפתח API")
      return
    }
    setSaving(true)
    try {
      await setClaudeApiKey(input)
      setApiKey("••••••••••••••••")
      toast.success("מפתח Claude נשמר בהצלחה")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleTestApi = async () => {
    setTestingApi(true)
    setApiTestResult(null)
    try {
      const res = await testClaudeConnection()
      setApiTestResult(res.ok ? `✅ ${t("pages.adminPanel.connectionOk")}` : `❌ ${res.message || t("pages.adminPanel.error")}`)
    } finally {
      setTestingApi(false)
    }
  }

  const handleClearKey = async () => {
    setSaving(true)
    try {
      await setClaudeApiKey(null)
      setApiKey("")
      ;(document.getElementById("claude-api-key") as HTMLInputElement).value = ""
      toast.success("מפתח Claude הוסר")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleCreateRestaurant = async () => {
    const name = newRestName.trim()
    if (!name) {
      toast.error(t("pages.adminPanel.enterRestaurantName"))
      return
    }
    const codeRaw = newRestInviteCode.trim().toUpperCase().replace(/\s/g, "")
    if (codeRaw) {
      const { inviteCodesCollection, inviteCodeFields } = firestoreConfig
      const codeSnap = await getDoc(doc(db, inviteCodesCollection, codeRaw))
      if (!codeSnap.exists()) {
        toast.error(t("pages.adminPanel.invalidCode"))
        return
      }
      const codeData = codeSnap.data()
      if (codeData?.[inviteCodeFields.used]) {
        toast.error(t("pages.adminPanel.codeUsed"))
        return
      }
      if (codeData?.[inviteCodeFields.type] !== "manager") {
        toast.error(t("pages.adminPanel.codeNotForManager"))
        return
      }
    }
    setCreatingRest(true)
    try {
      const id = `rest_${Date.now()}`
      await setDoc(doc(db, "restaurants", id), {
        name,
        emoji: newRestEmoji.trim() || null,
        branch: "סניף ראשי",
        target: 30,
      })
      if (codeRaw) {
        const { inviteCodesCollection, inviteCodeFields } = firestoreConfig
        await setDoc(doc(db, inviteCodesCollection, codeRaw), {
          [inviteCodeFields.restaurantId]: id,
        }, { merge: true })
      }
      if (!isSystemOwner && auth.currentUser) {
        await setDoc(doc(db, "users", auth.currentUser.uid), {
          restaurantId: id,
          role: "manager",
        }, { merge: true })
      }
      toast.success(
        codeRaw
          ? `מסעדה "${name}" נוצרה. קוד ההזמנה עודכן — המנהל יוכל להירשם עם הקוד כדי לקבל גישה.`
          : `מסעדה "${name}" נוצרה בהצלחה. ${!isSystemOwner ? "אתה המנהל שלה." : "אפשר לשייך מנהל מאוחר יותר."}`
      )
      setNewRestName("")
      setNewRestEmoji("")
      setNewRestInviteCode("")
      loadSystemOwnerData()
      refreshRestaurants?.()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCreatingRest(false)
    }
  }

  const generateInviteCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    let s = ""
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)]
    s += "-"
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)]
    return s
  }

  const handleCreateManagerCode = async () => {
    setGeneratingCode(true)
    setLastGeneratedCode(null)
    try {
      const { inviteCodesCollection, inviteCodeFields } = firestoreConfig
      let code = generateInviteCode()
      let exists = true
      while (exists) {
        const snap = await getDoc(doc(db, inviteCodesCollection, code))
        exists = snap.exists()
        if (exists) code = generateInviteCode()
      }
      const payload: Record<string, unknown> = {
        [inviteCodeFields.type]: "manager",
        [inviteCodeFields.used]: false,
        [inviteCodeFields.createdAt]: new Date().toISOString(),
      }
      if (currentRestaurantId && isSystemOwner) {
        payload[inviteCodeFields.restaurantId] = currentRestaurantId
      }
      await setDoc(doc(db, inviteCodesCollection, code), payload)
      setLastGeneratedCode(code)
      toast.success("קוד נוצר. העתק והעבר למנהל.")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGeneratingCode(false)
    }
  }

  const loadAllSystemUsers = async () => {
    setLoadingAllUsers(true)
    setAllUsersLoaded(false)
    try {
      const snap = await getDocs(collection(db, "users"))
      const users = snap.docs.map(d => {
        const data = d.data()
        const restId = data.restaurantId || null
        const restName = restsWithDetails.find(r => r.id === restId)?.name
        return { uid: d.id, email: data.email || d.id, role: data.role || "user", restaurantId: restId, restaurantName: restName, name: (data.name as string) || "", phone: (data.phone as string) || "" }
      })
      users.sort((a, b) => a.email.localeCompare(b.email))
      setAllSystemUsers(users)
      setAllUsersLoaded(true)
    } catch(e) { toast.error("שגיאה בטעינת משתמשים") }
    finally { setLoadingAllUsers(false) }
  }

  const handleAssignFromTable = async () => {
    if (!assignTarget) return
    setSavingAssign(true)
    try {
      const currentData = allSystemUsers.find(u => u.uid === assignTarget.uid)
      await setDoc(doc(db, "users", assignTarget.uid), {
        restaurantId: assignTargetRestId || null,
        role: currentData?.role === "owner" ? "owner" : "manager",
      }, { merge: true })
      toast.success("✅ " + assignTarget.email + " שויך בהצלחה")
      setAssignTarget(null)
      setAssignTargetRestId("")
      loadAllSystemUsers()
    } catch(e) { toast.error((e as Error)?.message || "שגיאה בשיוך") }
    finally { setSavingAssign(false) }
  }

  const handleAssignManager = async () => {
    if (!currentRestaurantId) return
    const email = assignManagerEmail.trim().toLowerCase()
    if (!email) { setAssignManagerResult({ ok: false, msg: "הזן אימייל" }); return }
    setAssigningManager(true)
    setAssignManagerResult(null)
    try {
      const usersSnap = await getDocs(collection(db, "users"))
      const userDoc = usersSnap.docs.find(d => d.data().email?.toLowerCase() === email)
      if (!userDoc) {
        setAssignManagerResult({ ok: false, msg: `משתמש עם האימייל ${email} לא נמצא במערכת` })
        return
      }
      const uid = userDoc.id
      const currentData = userDoc.data()
      await setDoc(doc(db, "users", uid), {
        restaurantId: currentRestaurantId,
        role: currentData.role === "owner" ? "owner" : "manager",
      }, { merge: true })
      setAssignManagerResult({ ok: true, msg: `✅ ${email} שויך למסעדה כמנהל` })
      setAssignManagerEmail("")
      const snap = await getDocs(query(collection(db, "users"), where("restaurantId", "==", currentRestaurantId)))
      setRestaurantUsers(snap.docs.map(d => ({
        uid: d.id,
        email: d.data().email || undefined,
        role: d.data().role || "user",
        permissions: d.data().permissions,
      })))
    } catch (e) {
      setAssignManagerResult({ ok: false, msg: (e as Error)?.message || "שגיאה בשיוך" })
    } finally { setAssigningManager(false) }
  }

  const handleCreateUser = async () => {
    setCreateUserError(null)
    if (!createUserEmail.trim() || !createUserPassword.trim()) { setCreateUserError("נא למלא אימייל וסיסמה"); return }
    if (createUserPassword.length < 6) { setCreateUserError("הסיסמה חייבת להיות לפחות 6 תווים"); return }
    setCreatingUser(true)
    try {
      const { createUserWithEmailAndPassword } = await import("firebase/auth")
      const { auth: fbAuth } = await import("@/lib/firebase")
      const cred = await createUserWithEmailAndPassword(fbAuth, createUserEmail.trim(), createUserPassword)
      const { doc: fd, setDoc: sd } = await import("firebase/firestore")
      await sd(fd(db, "users", cred.user.uid), { email: createUserEmail.trim(), role: createUserRole, restaurantId: createUserRestId || null })
      setAllSystemUsers(prev => [...prev, { uid: cred.user.uid, email: createUserEmail.trim(), role: createUserRole, restaurantId: createUserRestId || null, restaurantName: restsWithDetails.find(r=>r.id===createUserRestId)?.name }])
      toast.success("משתמש נוצר: " + createUserEmail.trim())
      setCreateUserEmail(""); setCreateUserPassword(""); setCreateUserRestId(""); setShowCreateUser(false)
    } catch(e) {
      const code = (e as {code?:string}).code
      setCreateUserError(code === "auth/email-already-in-use" ? "אימייל כבר בשימוש" : (e as Error).message || "שגיאה ביצירת משתמש")
    } finally { setCreatingUser(false) }
  }

  const handleInviteUser = async () => {
    const email = inviteEmail.trim()
    if (!email || !currentRestaurantId) {
      toast.error(t("pages.adminPanel.enterEmailAndRestaurant"))
      return
    }
    setInviting(true)
    try {
      const ref = doc(db, "restaurants", currentRestaurantId, "appState", "invitedEmails")
      const snap = await getDoc(ref)
      const current: string[] = Array.isArray(snap.data()?.list) ? snap.data()!.list : []
      if (current.includes(email)) {
        toast.info(t("pages.adminPanel.userAlreadyInvited"))
        setInviting(false)
        return
      }
      await setDoc(ref, { list: [...current, email] }, { merge: true })

      const restaurantName = restaurants?.find((r) => r.id === currentRestaurantId)?.name
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, restaurantName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.warning(`המשתמש נוסף לרשימה, אך שליחת האימייל נכשלה: ${data.error || res.statusText}. העבר את הכתובת ${email} ידנית.`)
      } else {
        toast.success(`ההזמנה נשלחה ל־${email}. המשתמש יוכל להירשם ולקבל גישה.`)
      }
      setInviteEmail("")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 w-full">
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-6 h-6" />
              {t("pages.adminPanel.adminPanelTitle")}
            </CardTitle>
            {isSystemOwner && !isImpersonating && (
              <div className="flex items-center gap-1">
                <LanguageSwitcher variant="light" />
                <Button variant="ghost" size="sm" onClick={()=>setCurrentPage?.("settings")} className="gap-1.5 text-muted-foreground hover:text-foreground h-8">
                  <Settings2 className="w-4 h-4"/><span className="text-xs hidden sm:inline">הגדרות</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={()=>signOut(auth)} className="gap-1.5 text-muted-foreground hover:text-destructive h-8">
                  <LogOut className="w-4 h-4"/><span className="text-xs hidden sm:inline">יציאה</span>
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {isSystemOwner
              ? t("pages.adminPanel.systemOwnerDesc")
              : userRole === "owner" || userRole === "manager"
                ? t("pages.adminPanel.restaurantManagerDesc")
                : t("pages.adminPanel.limitedAccess")}
          </p>
        </CardContent>
      </Card>

      {isSystemOwner && adminStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{animation:"_fOwner .4s ease both"}}>
          <style>{`@keyframes _fOwner{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
          {([
            {val:adminStats.rests,lbl:t("pages.adminPanel.restaurants"),grad:"from-emerald-500 to-teal-600",icon:"🏠"},
            {val:adminStats.users,lbl:t("pages.adminPanel.users"),grad:"from-blue-500 to-indigo-600",icon:"👥"},
            {val:adminStats.dishes,lbl:t("pages.adminPanel.dishes"),grad:"from-amber-500 to-orange-500",icon:"🍽️"},
            {val:adminStats.ings,lbl:t("pages.adminPanel.ingredients"),grad:"from-violet-500 to-purple-600",icon:"🥬"},
          ] as const).map((s,i)=>(
            <Card key={i} className="border-0 shadow-sm overflow-hidden"
              style={{transition:"transform .2s,box-shadow .2s"}}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform="translateY(-3px)";(e.currentTarget as HTMLElement).style.boxShadow="0 8px 20px rgba(0,0,0,.12)"}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform="";(e.currentTarget as HTMLElement).style.boxShadow=""}}
            >
              <CardContent className="p-0">
                <div className={cn("bg-gradient-to-br p-4 pb-2",s.grad)}>
                  <span className="text-xl">{s.icon}</span>
                  <p className="text-2xl font-bold text-white mt-1">{s.val}</p>
                </div>
                <div className="px-4 py-2"><p className="text-xs text-muted-foreground font-medium">{s.lbl}</p></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isSystemOwner && (
        <Tabs value={systemOwnerTab} onValueChange={(v) => setSystemOwnerTab(v as "restaurants" | "suppliers" | "ingredients" | "users")}>
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
            <TabsTrigger value="restaurants" className="gap-1.5">
              <UtensilsCrossed className="w-4 h-4" />
              {t("pages.adminPanel.restaurants")}
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="gap-1.5">
              <Truck className="w-4 h-4" />
              {t("pages.adminPanel.suppliers")}
            </TabsTrigger>
            <TabsTrigger value="ingredients" className="gap-1.5">
              <Package className="w-4 h-4" />
              {t("pages.adminPanel.globalIngredients")}
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5">
              <Users className="w-4 h-4" />
              משתמשים
            </TabsTrigger>
          </TabsList>

          <TabsContent value="restaurants" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  {t("pages.adminPanel.addRestaurant")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(!restaurants || restaurants.length === 0) && (
                  <p className="text-sm text-amber-600 dark:text-amber-500 mb-3 flex items-center gap-2">
                    {t("pages.adminPanel.noRestaurantsLoaded")}{" "}
                    <Button variant="link" className="p-0 h-auto font-semibold" onClick={() => window.location.reload()}>
                      {t("pages.adminPanel.clickToRefresh")}
                    </Button>
                  </p>
                )}
                <p className="text-sm text-muted-foreground mb-4">
                  {t("pages.adminPanel.createNewRestaurant")}
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  <div className="flex-1 min-w-[200px]">
                    <Label htmlFor="new-rest-name">{t("pages.adminPanel.restaurantName")}</Label>
                    <Input
                      id="new-rest-name"
                      value={newRestName}
                      onChange={(e) => setNewRestName(e.target.value)}
                      placeholder={t("pages.adminPanel.enterRestaurantName")}
                      className="mt-1"
                    />
                  </div>
                  <div className="w-24">
                    <Label htmlFor="new-rest-emoji">{t("pages.adminPanel.emoji")}</Label>
                    <Input
                      id="new-rest-emoji"
                      value={newRestEmoji}
                      onChange={(e) => setNewRestEmoji(e.target.value)}
                      placeholder="☕"
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <Label htmlFor="new-rest-invite-code">{t("pages.adminPanel.inviteCodeOptional")}</Label>
                  <div className="flex gap-2 items-center mt-1">
                    <Input
                      id="new-rest-invite-code"
                      value={newRestInviteCode}
                      onChange={(e) => setNewRestInviteCode(e.target.value)}
                      placeholder={t("pages.adminPanel.inviteCodePlaceholder")}
                      className="max-w-xs font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        setGeneratingCode(true)
                        setLastGeneratedCode(null)
                        try {
                          const { inviteCodesCollection, inviteCodeFields } = firestoreConfig
                          let code = generateInviteCode()
                          let exists = true
                          while (exists) {
                            const snap = await getDoc(doc(db, inviteCodesCollection, code))
                            exists = snap.exists()
                            if (exists) code = generateInviteCode()
                          }
                          await setDoc(doc(db, inviteCodesCollection, code), {
                            [inviteCodeFields.type]: "manager",
                            [inviteCodeFields.used]: false,
                            [inviteCodeFields.createdAt]: new Date().toISOString(),
                          })
                          setNewRestInviteCode(code)
                          setLastGeneratedCode(code)
                          toast.success(t("pages.adminPanel.codeCreated"))
                        } catch (e) {
                          toast.error((e as Error).message)
                        } finally {
                          setGeneratingCode(false)
                        }
                      }}
                      disabled={generatingCode}
                    >
                      {generatingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {t("pages.adminPanel.createCode")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("pages.adminPanel.optionallyCreateCode")}
                  </p>
                </div>
                <Button onClick={handleCreateRestaurant} disabled={creatingRest}>
                  {creatingRest ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Building2 className="w-4 h-4 ml-2" />}
                  {t("pages.adminPanel.createRestaurant")}
                </Button>
              </CardContent>
            </Card>
            {loadingSystemOwner ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8">
                <Loader2 className="w-5 h-5 animate-spin" />
                {t("pages.adminPanel.loadingRestaurants")}
              </div>
            ) : (
              <div className="space-y-4">
                {restsWithDetails.map((rest, _ri) => (
                  <Card key={rest.id} className={["border-l-4 border-l-emerald-500","border-l-4 border-l-blue-500","border-l-4 border-l-violet-500","border-l-4 border-l-rose-500","border-l-4 border-l-amber-500"][_ri%5] + " transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"}>
                    <CardHeader className="pb-2" dir="rtl">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {rest.emoji && <span>{rest.emoji}</span>}
                          {rest.name}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {rest.dishesCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400">
                                <Utensils className="w-3 h-3"/>
                                {rest.dishesCount} מנות
                              </span>
                            )}
                            {rest.fcAvg > 0 && (
                              <span className={cn(
                                "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border",
                                rest.fcAvg <= 28 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                rest.fcAvg <= 33 ? "bg-blue-50 text-blue-700 border-blue-200" :
                                "bg-rose-50 text-rose-700 border-rose-200"
                              )}>
                                <TrendingUp className="w-3 h-3"/>
                                FC {rest.fcAvg}%
                              </span>
                            )}
                            {(rest.assignedSuppliers||[]).length > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/30 dark:text-violet-400">
                                <Truck className="w-3 h-3"/>
                                {(rest.assignedSuppliers||[]).length} ספקים
                              </span>
                            )}
                          </div>
                          {onImpersonate && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                onImpersonate({ id: rest.id, name: rest.name, emoji: rest.emoji })
                                toast.success(`${t("pages.adminPanel.impersonatingRest")}: ${rest.emoji ? `${rest.emoji} ` : ""}${rest.name}`)
                              }}
                            >
                              <UserCircle className="w-4 h-4 ml-1" />
                              {t("pages.adminPanel.impersonate")}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setRestToDelete(rest)
                              setDeleteRestDialogOpen(true)
                            }}
                          >
                            <Trash2 className="w-4 h-4 ml-1" />
                            מחק
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <p className="text-sm font-medium mb-1">משויכים — לחץ להסרה:</p>
                        <div className="flex flex-wrap gap-2">
                          {(rest.assignedSuppliers?.length ?? 0) === 0 ? (
                            <span className="text-sm text-muted-foreground">{t("pages.adminPanel.noAssignedSuppliers")}</span>
                          ) : (
                            (rest.assignedSuppliers || []).map((s) => (
                              <Button
                                key={s}
                                size="sm"
                                variant="secondary"
                                className="text-destructive hover:bg-destructive/10"
                                onClick={() => handleRemoveSupplier(rest.id, s)}
                                disabled={removingSupplier === `${rest.id}:${s}`}
                              >
                                {removingSupplier === `${rest.id}:${s}` ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : <X className="w-3 h-3 ml-1" />}
                                {s}
                              </Button>
                            ))
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2">{t("pages.adminPanel.suppliersAvailableForAssignment")}:</p>
                        <div className="flex flex-wrap gap-2">
                          {suppliersWithRests
                            .filter((s) => !(rest.assignedSuppliers || []).includes(s.name))
                            .map((s) => (
                              <Button
                                key={s.name}
                                size="sm"
                                variant="outline"
                                onClick={() => handleAssignSupplier(rest.id, s.name)}
                                disabled={assigningSupplier === `${rest.id}:${s.name}`}
                              >
                                {assigningSupplier === `${rest.id}:${s.name}` ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : <Check className="w-3 h-3 ml-1" />}
                                {s.name}
                              </Button>
                            ))}
                          {suppliersWithRests.filter((s) => !(rest.assignedSuppliers || []).includes(s.name)).length === 0 && (
                            <span className="text-sm text-muted-foreground">{t("pages.adminPanel.allSuppliersAssigned")}</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {restsWithDetails.length === 0 && !loadingSystemOwner && (
                  <p className="text-muted-foreground py-4">{t("pages.adminPanel.noRestaurants")}</p>
                )}
              </div>
            )}
          

          
                

          </TabsContent>

          <TabsContent value="suppliers" className="mt-4">
            {loadingSystemOwner ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8">
                <Loader2 className="w-5 h-5 animate-spin" />
                {t("pages.adminPanel.loadingSuppliers")}
              </div>
            ) : (
              <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle>{t("pages.adminPanel.globalSuppliers")}</CardTitle>
                      <p className="text-sm text-muted-foreground">{t("pages.adminPanel.globalSuppliersDesc")}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => loadSystemOwnerData()} disabled={loadingSystemOwner}>
                        <RefreshCw className={`w-4 h-4 ml-1 ${loadingSystemOwner ? "animate-spin" : ""}`} />
                        {t("pages.adminPanel.refresh")}
                      </Button>
                      <Button variant="default" onClick={() => setShowInvoiceUploadArea((v) => !v)}>
                        <UploadIcon className="w-4 h-4 ml-1" />
                        העלאת חשבונית
                      </Button>
                      <Button variant="outline" onClick={() => setAddSupplierOpen(true)}>
                        <Plus className="w-4 h-4 ml-1" />
                        {t("pages.adminPanel.addSupplier")}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* העלאת חשבוניות — נפתח בלחיצה על הכפתור */}
                  {showInvoiceUploadArea && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mb-6"
                      onDragOver={handleAdminInvoiceDragOver}
                      onDragEnter={handleAdminInvoiceDragEnter}
                      onDragLeave={handleAdminInvoiceDragLeave}
                      onDrop={handleAdminInvoiceDrop}
                    >
                      <Card className={isInvoiceDragging ? "ring-2 ring-primary ring-offset-2" : ""}>
                        <CardContent className="p-6 relative">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute left-2 top-2 h-8 w-8"
                            onClick={() => setShowInvoiceUploadArea(false)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                          <div
                            className={`border-2 border-dashed rounded-xl p-6 text-center transition-all min-h-[140px] flex flex-col items-center justify-center cursor-pointer ${
                              isInvoiceDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                            }`}
                            onClick={() => adminInvoiceFileRef.current?.click()}
                          >
                            <div className="flex items-center gap-3 mb-3">
                              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isInvoiceDragging ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                                <FileText className="w-6 h-6" />
                              </div>
                              <div className="text-right">
                                <h3 className="font-semibold">חשבוניות ספקים — קטלוג גלובלי</h3>
                                <p className="text-sm text-muted-foreground">גרור PDF/Excel/תמונה — AI יחלץ רכיבים ומחירים ויעלה לספקים הגלובליים</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground mb-3">
                              <Badge variant="outline">PDF</Badge>
                              <Badge variant="outline">Excel</Badge>
                              <Badge variant="outline">CSV</Badge>
                              <Badge variant="outline">תמונות</Badge>
                            </div>
                            <input
                              ref={adminInvoiceFileRef}
                              type="file"
                              accept={INVOICE_ACCEPT}
                              className="hidden"
                              onChange={handleAdminInvoiceFileSelect}
                            />
                            <Button type="button" variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); adminInvoiceFileRef.current?.click() }}>
                              <UploadIcon className="w-4 h-4 ml-2" />
                              בחר קובץ
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}

                  <FilePreviewModal
                    open={fpmOpen}
                    onOpenChange={(o) => { setFpmOpen(o); if (!o) setFpmFile(null) }}
                    file={fpmFile}
                    type="p"
                    forceSaveToGlobal={true}
                    onConfirmSupplier={handleConfirmAdminSupplier}
                  />

                  <div className="flex flex-wrap gap-2 items-center mb-4 p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                      <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                      <Input
                        value={suppliersSearchText}
                        onChange={(e) => setSuppliersSearchText(e.target.value)}
                        placeholder={t("pages.adminPanel.suppliersSearchPlaceholder")}
                        className="h-9"
                      />
                    </div>
                    <Select value={suppliersFilterAssigned} onValueChange={setSuppliersFilterAssigned}>
                      <SelectTrigger className="w-[140px] h-9">
                        <SelectValue placeholder={t("pages.adminPanel.assign")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">{t("pages.adminPanel.all")}</SelectItem>
                        <SelectItem value="assigned">{t("pages.adminPanel.assignedToRestaurants")}</SelectItem>
                        <SelectItem value="unassigned">{t("pages.adminPanel.unassigned")}</SelectItem>
                      </SelectContent>
                    </Select>
                    {(suppliersSearchText || suppliersFilterAssigned !== "__all__") && (
                      <Button variant="ghost" size="sm" onClick={() => { setSuppliersSearchText(""); setSuppliersFilterAssigned("__all__") }}>
                        {t("pages.adminPanel.clearFilter")}
                      </Button>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {filteredAndSortedSuppliers.length === (suppliersWithRests?.length ?? 0)
                        ? `${suppliersWithRests?.length ?? 0} ${t("pages.adminPanel.suppliersCount")}`
                        : `${t("pages.adminPanel.showingCount")} ${filteredAndSortedSuppliers.length} ${t("pages.adminPanel.of")} ${suppliersWithRests?.length ?? 0}`}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">{t("pages.adminPanel.clickForDetails")}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {filteredAndSortedSuppliers.map((s) => {
                      const ingCount = (supplierToIngredients[s.name] || []).length
                      return (
<div
                          key={s.name}
                          className={cn(
                            "relative rounded-xl overflow-hidden cursor-pointer border-2 transition-all duration-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5",
                            selectedSupplierDetail === s.name ? "border-primary shadow-lg -translate-y-0.5" : "border-transparent"
                          )}
                          style={{height:130}}
                          onClick={() => setSelectedSupplierDetail(selectedSupplierDetail === s.name ? null : s.name)}
                        >
                          {/* Background image */}
                          <img
                            src={`https://source.unsplash.com/400x200/?food,supplier,wholesale,${encodeURIComponent(s.name)}`}
                            alt={s.name}
                            className="absolute inset-0 w-full h-full object-cover"
                            onError={e => {
                              const el = e.target as HTMLImageElement
                              el.style.display = "none"
                              const parent = el.parentElement!
                              parent.style.background = ["linear-gradient(135deg,#0F6E56,#1D9E75)","linear-gradient(135deg,#185FA5,#378ADD)","linear-gradient(135deg,#533AAB,#7F77DD)","linear-gradient(135deg,#854F0B,#BA7517)","linear-gradient(135deg,#993C1D,#D85A30)"][(s.name.charCodeAt(0)||0)%5]
                            }}
                          />
                          {/* Dark overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10"/>
                          {/* Content */}
                          <div className="absolute inset-0 flex flex-col justify-end p-4">
                            <p className="font-bold text-white text-base leading-tight truncate drop-shadow">{s.name}</p>
                            <p className="text-xs text-white/75 mt-0.5">{ingCount} {t("pages.adminPanel.ingredientsCount")}</p>
                          </div>
                          {selectedSupplierDetail === s.name && (
                            <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                              <Check className="w-3.5 h-3.5 text-white"/>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {selectedSupplierDetail && (() => {
                    const s = filteredAndSortedSuppliers.find((x) => x.name === selectedSupplierDetail)
                    if (!s) return null
                    const supplierIngs = supplierToIngredients[s.name] || []
                    return (
                      <div className="space-y-4 p-5 rounded-xl border bg-muted/30">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <h3 className="text-lg font-semibold">{s.name}</h3>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEditSupplierDetails(s)}>
                              <Edit2 className="w-4 h-4 ml-1" />
                              {t("pages.adminPanel.editDetails")}
                            </Button>
                            <Button size="sm" onClick={() => openEditSupplier(s.name)}>
                              <Plus className="w-4 h-4 ml-1" />
                              {t("pages.adminPanel.addIngredient")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => { e.stopPropagation(); setSupplierToDelete(s); setDeleteSupplierDialogOpen(true) }}
                            >
                              <Trash2 className="w-4 h-4 ml-1" />
                              {t("pages.adminPanel.deleteSupplier")}
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground mb-0.5">{t("pages.adminPanel.phone")}</p>
                            <p className="font-medium">{s.phone || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-0.5">{t("pages.adminPanel.email")}</p>
                            <p className="font-medium">{s.email || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-0.5">{t("pages.adminPanel.contact")}</p>
                            <p className="font-medium">{s.contact || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-0.5">{t("pages.adminPanel.address")}</p>
                            <p className="font-medium">{s.address || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-0.5">{t("pages.adminPanel.assignedToRestaurantsLabel")}</p>
                            <p className="font-medium">
                              {(s.restaurantIds?.length ?? 0) === 0 ? (
                                t("pages.adminPanel.notAssigned")
                              ) : (
                                (s.restaurantIds || [])
                                  .map((rid) => restsWithDetails.find((r) => r.id === rid)?.name || rid)
                                  .filter(Boolean)
                                  .join(", ")
                              )}
                            </p>
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-medium mb-2">{t("pages.adminPanel.ingredientsCount")} ({supplierIngs.length})</p>
                          {supplierIngs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t("pages.adminPanel.noIngredientsAddFirst")}</p>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border">
                              <table className="w-full text-sm table-fixed">
                                <colgroup>
                                  <col className="w-[5%]" />
                                  <col className="w-[12%]" />
                                  <col className="w-[10%]" />
                                  <col className="w-[10%]" />
                                  <col className="w-[9%]" />
                                  <col className="w-[10%]" />
                                  <col className="w-[10%]" />
                                  <col className="w-[22%]" />
                                </colgroup>
                                <thead>
                                  <tr className="border-b bg-muted/50">
                                    <th className="text-right py-2 px-2 font-medium w-14"></th>
                                    <th className="text-right py-2 px-2 font-medium">{t("pages.adminPanel.skuLabel")}</th>
                                    <th className="text-right py-2 px-2 font-medium">{t("pages.adminPanel.minStockLabel")}</th>
                                    <th className="text-right py-2 px-2 font-medium">{t("pages.adminPanel.inventory")}</th>
                                    <th className="text-right py-2 px-2 font-medium">{t("pages.adminPanel.wasteLabel")}</th>
                                    <th className="text-right py-2 px-2 font-medium">{t("pages.adminPanel.unitUnit")}</th>
                                    <th className="text-right py-2 px-2 font-medium">{t("pages.adminPanel.priceLabel")}</th>
                                    <th className="text-right py-2 px-2 font-medium">{t("pages.adminPanel.ingredientLabel")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {supplierIngs.map((i) => (
                                    <tr key={i.id} className="border-b last:border-0">
                                      <td className="py-2 px-2 text-right">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                          onClick={() => handleDeleteIngredientFromSupplier(i, s.name, s.restaurantIds)}
                                          disabled={deletingIngredientId === `${i.source}-${i.id}`}
                                        >
                                          {deletingIngredientId === `${i.source}-${i.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                        </Button>
                                      </td>
                                      <td className="py-2 px-2 text-right">{i.sku || "—"}</td>
                                      <td className="py-2 px-2 text-right">{i.minStock}</td>
                                      <td className="py-2 px-2 text-right">{i.stock}</td>
                                      <td className="py-2 px-2 text-right">{i.waste}%</td>
                                      <td className="py-2 px-2 text-right">{i.unit}</td>
                                      <td className="py-2 px-2 text-right">₪{i.price.toFixed(2)}</td>
                                      <td className="py-2 px-2 text-right font-medium">{i.name}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                  {filteredAndSortedSuppliers.length === 0 && !loadingSystemOwner && (
                    <p className="text-muted-foreground py-4">
                      {(suppliersWithRests?.length ?? 0) === 0 ? t("pages.adminPanel.noSuppliers") : t("pages.adminPanel.noResults")}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="ingredients" className="mt-4">
            {loadingSystemOwner ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8">
                <Loader2 className="w-5 h-5 animate-spin" />
                {t("pages.adminPanel.loadingIngredients")}
              </div>
            ) : (
              <Card dir={dir}>
                <CardHeader>
                  <CardTitle className={textAlign}>{t("pages.adminPanel.globalIngredients")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Toolbar */}
                  <div className={`flex flex-wrap items-center gap-2 ${justify}`}>
                    <div className="relative flex-1 min-w-[140px] max-w-[220px]">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        value={ingredientsSearchText}
                        onChange={(e) => setIngredientsSearchText(e.target.value)}
                        placeholder={t("pages.adminPanel.searchPlaceholder")}
                        className={`h-9 pr-9 ${textAlign}`}
                      />
                      {ingredientsSearchText && (
                        <Button variant="ghost" size="icon" className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setIngredientsSearchText("")} title={t("pages.adminPanel.clear")}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                    <Button size="sm" onClick={() => { setAddIngredientSupplier(""); setAddIngredientOpen(true) }}>
                      <Plus className="w-4 h-4 ml-1" />
                      {t("pages.adminPanel.addIngredient")}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {filteredAndSortedIngredients.length === (ingredientsList?.length ?? 0)
                        ? `${ingredientsList?.length ?? 0} ${t("pages.adminPanel.ingredientsCount")}`
                        : `${t("pages.adminPanel.showingCount")} ${filteredAndSortedIngredients.length} ${t("pages.adminPanel.of")} ${ingredientsList?.length ?? 0}`}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 w-9 p-0" title={t("pages.adminPanel.tableDisplay")}>
                          <Columns3 className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={isRtl ? "start" : "end"} className="min-w-[180px]">
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{t("pages.adminPanel.rowDensity")}</div>
                        {(["compact", "normal", "expanded"] as RowDensity[]).map((d) => (
                          <DropdownMenuCheckboxItem key={d} checked={ingredientsRowDensity === d} onCheckedChange={() => setIngredientsRowDensityAndStore(d)}>
                            {d === "compact" ? t("pages.adminPanel.densityCompact") : d === "expanded" ? t("pages.adminPanel.densityExpanded") : t("pages.adminPanel.densityNormal")}
                          </DropdownMenuCheckboxItem>
                        ))}
                        <div className="border-t my-1" />
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{t("pages.adminPanel.showHideColumns")}</div>
                        {defaultColumnOrder.map((k) => {
                          const isVisible = ingredientsColumnVisibility[k] !== false
                          const colLabels: Record<string, string> = { name: t("pages.adminPanel.ingredientLabel"), price: t("pages.adminPanel.priceLabel"), cheapest: t("pages.adminPanel.cheapest"), sku: t("pages.adminPanel.skuLabel"), status: t("pages.adminPanel.statusLabel"), source: t("pages.adminPanel.sourceLabel"), supplier: t("pages.adminPanel.supplierLabel"), minStock: t("pages.adminPanel.minStockLabel"), stock: t("pages.adminPanel.inventory"), waste: t("pages.adminPanel.wasteLabel"), unit: t("pages.adminPanel.unitUnit") }
                          const label = colLabels[k] || k
                          return (
                            <DropdownMenuCheckboxItem key={k} checked={isVisible} onCheckedChange={() => toggleIngredientsColumnVisibility(k)}>
                              {label}
                            </DropdownMenuCheckboxItem>
                          )
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Table */}
                  <div className="rounded-lg border overflow-auto max-h-[min(55vh,520px)]" dir={dir}>
                  <Table className="w-full table-fixed text-sm">
                    <colgroup>
                      {visibleColumnOrder.map((k) => (
                        <col key={k} style={{
                          width: k==="name"?"160px":k==="price"?"84px":k==="cheapest"?"124px":k==="sku"?"110px":k==="status"?"80px":k==="source"?"76px":k==="supplier"?"110px":k==="minStock"?"70px":k==="stock"?"70px":k==="waste"?"70px":k==="unit"?"72px":"88px",
                          minWidth: k==="name"?"130px":k==="cheapest"?"110px":k==="sku"?"90px":k==="supplier"?"90px":"58px"
                        }} />
                      ))}
                      <col className="w-20" />
                    </colgroup>
                    <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                      <TableRow className="border-b">
                        {visibleColumnOrder.map((key, colIndex) => {
                          if (key === "cheapest") {
                            return (
                              <TableHead
                                key="cheapest"
                                className={`${textAlign} ${densityCellClass} ${isRtl ? "pr-0" : ""} select-none`}
                                draggable
                                title={t("pages.adminPanel.dragToReorderColumns")}
                                onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(colIndex)); e.dataTransfer.effectAllowed = "move" }}
                                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move" }}
                                onDrop={(e) => {
                                  e.preventDefault()
                                  const from = parseInt(e.dataTransfer.getData("text/plain"), 10)
                                  if (!isNaN(from)) handleIngredientsColumnReorder(from, colIndex)
                                }}
                              >
                                <span className={`flex items-center gap-1 ${justify}`}>
                                  <GripVertical className="w-3 h-3 text-muted-foreground/60 cursor-grab active:cursor-grabbing shrink-0" />
                                  {t("pages.adminPanel.cheapest")}
                                </span>
                              </TableHead>
                            )
                          }
                          const labels: Record<string, string> = { name: t("pages.adminPanel.ingredientLabel"), price: t("pages.adminPanel.priceLabel"), unit: t("pages.adminPanel.unitUnit"), waste: t("pages.adminPanel.wasteLabel"), stock: t("pages.adminPanel.inventory"), minStock: t("pages.adminPanel.minStockLabel"), supplier: t("pages.adminPanel.supplierLabel"), sku: t("pages.adminPanel.skuLabel"), source: t("pages.adminPanel.sourceLabel"), status: t("pages.adminPanel.statusLabel") }
                          const isSortable = ["name", "price", "unit", "waste", "stock", "minStock", "supplier", "sku", "source", "status"].includes(key)
                          return (
                            <TableHead
                              key={key}
                              className={`${textAlign} ${densityCellClass} ${isRtl ? "pr-0" : ""} ${isSortable ? "cursor-pointer hover:bg-muted/50 select-none" : ""}`}
                              draggable
                              title={t("pages.adminPanel.dragToReorderColumns")}
                              onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(colIndex)); e.dataTransfer.effectAllowed = "move" }}
                              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move" }}
                              onDrop={(e) => {
                                e.preventDefault()
                                const from = parseInt(e.dataTransfer.getData("text/plain"), 10)
                                if (!isNaN(from)) handleIngredientsColumnReorder(from, colIndex)
                              }}
                              onClick={() => {
                                if (!isSortable) return
                                if (ingredientsSortBy === key) {
                                  if (ingredientsSortDir === "asc") setIngredientsSortDir("desc")
                                  else { setIngredientsSortBy(""); setIngredientsSortDir("asc") }
                                } else {
                                  setIngredientsSortBy(key)
                                  setIngredientsSortDir("asc")
                                }
                              }}
                            >
                              <span className={`flex items-center gap-1 ${justify}`}>
                                <GripVertical className="w-3 h-3 text-muted-foreground/60 cursor-grab active:cursor-grabbing shrink-0" />
                                {labels[key] || key}
                                {ingredientsSortBy === key && (
                                  ingredientsSortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                )}
                                {ingredientsSortBy !== key && isSortable && <ArrowUpDown className="w-3 h-3 opacity-40" />}
                              </span>
                            </TableHead>
                          )
                        })}
                        <TableHead className={`${textAlign} ${densityCellClass} ${isRtl ? "pr-0" : ""} w-14`}>{t("pages.adminPanel.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...filteredAndSortedIngredients].reverse().map((ing) => {
                        const cellByKey: Record<string, React.ReactNode> = {
                          name: <TableCell key="name" className={`font-medium ${textAlign} ${densityCellClass} truncate`} title={ing.name}>{ing.name}</TableCell>,
                          price: <TableCell key="price" className={`${textAlign} ${densityCellClass}`}>₪{ing.price.toFixed(2)}</TableCell>,
                          cheapest: <TableCell key="cheapest" className={`${textAlign} ${densityCellClass} text-sm`}>
                            <AdminCheapestPopover
                              ing={ing}
                              webPrice={webPriceByIngredient[ing.name]}
                              onWebPriceSaved={(d) => setWebPriceByIngredient((prev) => ({ ...prev, [ing.name]: d }))}
                              t={t}
                            />
                          </TableCell>,
                          sku: <TableCell key="sku" className={`${textAlign} ${densityCellClass} truncate max-w-[110px]`} title={ing.sku || undefined}>{ing.sku || "—"}</TableCell>,
                          status: <TableCell key="status" className={`${textAlign} ${densityCellClass}`}>
                            <Badge variant={ing.status === "שויך" ? "default" : "secondary"}>{ing.status === "שויך" ? t("pages.adminPanel.assigned") : t("pages.adminPanel.pending")}</Badge>
                          </TableCell>,
                          source: <TableCell key="source" className={`${textAlign} ${densityCellClass}`}>{ing.source === "global" ? t("pages.adminPanel.global") : t("pages.adminPanel.restaurant")}</TableCell>,
                          supplier: <TableCell key="supplier" className={`${textAlign} ${densityCellClass} truncate max-w-[110px]`} title={ing.supplier || undefined}>{ing.supplier || "—"}</TableCell>,
                          minStock: <TableCell key="minStock" className={`${textAlign} ${densityCellClass}`}>{ing.minStock}</TableCell>,
                          stock: <TableCell key="stock" className={`${textAlign} ${densityCellClass}`}>{ing.stock}</TableCell>,
                          waste: <TableCell key="waste" className={`${textAlign} ${densityCellClass}`}>{ing.waste}%</TableCell>,
                          unit: <TableCell key="unit" className={`${textAlign} ${densityCellClass}`}>{ing.unit}</TableCell>,
                        }
                        return (
                        <TableRow key={`${ing.source}-${ing.id}`}>
                          {visibleColumnOrder.map((k) => cellByKey[k] ? <React.Fragment key={k}>{cellByKey[k]}</React.Fragment> : null)}
                          <TableCell className={`${textAlign} ${densityCellClass}`}>
                            <div className={`flex gap-1 ${justify}`}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEditAdminIngredient(ing)}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteIngredientFromSupplier(ing, ing.supplier, ing.source === "global" ? (suppliersWithRests.find((s) => s.name === ing.supplier)?.restaurantIds || []) : undefined)}
                                disabled={deletingIngredientId === `${ing.source}-${ing.id}`}
                              >
                                {deletingIngredientId === `${ing.source}-${ing.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                  </div>
                  {filteredAndSortedIngredients.length === 0 && !loadingSystemOwner && (
                    <p className="text-muted-foreground text-center py-8 text-sm">
                      {(ingredientsList?.length ?? 0) === 0 ? t("pages.adminPanel.noIngredients") : t("pages.adminPanel.noResults")}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
          <TabsContent value="users" className="mt-4 space-y-4">

            {isSystemOwner && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  {label:`סה"כ משתמשים`, val: allSystemUsers.length},
                  {label:"מנהלים", val: allSystemUsers.filter(u=>u.role==="manager").length},
                  {label:"משתמשים", val: allSystemUsers.filter(u=>u.role==="user").length},
                ].map((s,i)=>(
                  <div key={i} className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                    <p className="text-2xl font-semibold">{allUsersLoaded ? s.val : "—"}</p>
                  </div>
                ))}
              </div>
            )}

            {isSystemOwner && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-primary"/>כל המשתמשים</CardTitle>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={loadAllSystemUsers} disabled={loadingAllUsers}>
                        {loadingAllUsers?<Loader2 className="w-3 h-3 animate-spin ml-1"/>:<span className="ml-1 text-xs">🔄</span>}
                        {allUsersLoaded?"רענן":"טען"}
                      </Button>
                      <Button size="sm" className="gap-1.5" onClick={()=>setShowCreateUser(v=>!v)}>
                        <UserPlus className="w-4 h-4"/>צור משתמש
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {showCreateUser && (
                  <div className="mx-4 mb-4 p-4 rounded-lg bg-muted/40 border space-y-3">
                    <p className="text-sm font-medium">יצירת משתמש חדש</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">אימייל</label>
                        <Input type="email" placeholder="user@example.com" dir="ltr" value={createUserEmail} onChange={e=>setCreateUserEmail(e.target.value)}/>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">סיסמה זמנית</label>
                        <Input type="password" placeholder="לפחות 6 תווים" value={createUserPassword} onChange={e=>setCreateUserPassword(e.target.value)}/>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">תפקיד</label>
                        <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={createUserRole} onChange={e=>setCreateUserRole(e.target.value as "manager"|"user")}>
                          <option value="manager">מנהל</option>
                          <option value="user">משתמש</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">מסעדה</label>
                        <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={createUserRestId} onChange={e=>setCreateUserRestId(e.target.value)}>
                          <option value="">— ללא מסעדה —</option>
                          {restsWithDetails.map(r=><option key={r.id} value={r.id}>{r.emoji?`${r.emoji} `:""}{r.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={handleCreateUser} disabled={creatingUser}>
                        {creatingUser?<Loader2 className="w-3 h-3 animate-spin ml-1"/>:<UserPlus className="w-3 h-3 ml-1"/>}צור משתמש
                      </Button>
                      <Button size="sm" variant="ghost" onClick={()=>setShowCreateUser(false)}>ביטול</Button>
                    </div>
                    {createUserError && <p className="text-xs text-destructive">{createUserError}</p>}
                  </div>
                )}

                <CardContent className="p-0">
                  {!allUsersLoaded ? (
                    <div className="text-center py-10 text-sm text-muted-foreground">לחץ "טען" לראות את כל המשתמשים</div>
                  ) : allSystemUsers.length === 0 ? (
                    <div className="text-center py-10 text-sm text-muted-foreground">אין משתמשים</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b border-border">
                          <tr>
                            <th className="w-10 p-2"></th>
                            <th className="text-right p-2 font-medium text-muted-foreground text-xs">אימייל</th>
                            <th className="text-center p-2 font-medium text-muted-foreground text-xs">תפקיד</th>
                            <th className="text-right p-2 font-medium text-muted-foreground text-xs">מסעדה</th>
                            <th className="p-2 font-medium text-muted-foreground text-xs">פעולות</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allSystemUsers.map(user => {
                            const initials = (user.email||"?").slice(0,2).toUpperCase()
                            const cols = [{bg:"#E6F1FB",c:"#0C447C"},{bg:"#EAF3DE",c:"#27500A"},{bg:"#FAEEDA",c:"#633806"},{bg:"#EEEDFE",c:"#3C3489"},{bg:"#E1F5EE",c:"#085041"}]
                            const col = cols[(user.email||"").charCodeAt(0)%5]
                            return (
                              <tr key={user.uid} className="border-b border-border last:border-0 hover:bg-muted/30">
                                <td className="p-2 pl-3">
                                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium" style={{background:col.bg,color:col.c}}>{initials}</div>
                                </td>
                                <td className="p-2">
                                  <div className="font-medium text-xs" dir="ltr">{user.email}</div>
                                  {user.name && <div className="text-xs text-muted-foreground">{user.name}</div>}
                                </td>
                                <td className="p-2 text-center">
                                  {user.role==="owner"?(
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">בעלים</span>
                                  ):(
                                    <select className="text-xs rounded border border-input bg-background px-1.5 py-0.5" value={user.role}
                                      onChange={async e=>{const nr=e.target.value;try{const{doc:fd,updateDoc:ud}=await import("firebase/firestore");await ud(fd(db,"users",user.uid),{role:nr});setAllSystemUsers(p=>p.map(u=>u.uid===user.uid?{...u,role:nr}:u));toast.success("תפקיד עודכן")}catch{toast.error("שגיאה")}}}>
                                      <option value="manager">מנהל</option>
                                      <option value="user">משתמש</option>
                                    </select>
                                  )}
                                </td>
                                <td className="p-2 text-xs text-muted-foreground">{user.restaurantName||(user.restaurantId?"—":"ללא מסעדה")}</td>
                                <td className="p-2">
                                  <div className="flex items-center gap-1">
                                    <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={()=>{setAssignTarget({uid:user.uid,email:user.email});setAssignTargetRestId(user.restaurantId||"")}}>שייך</Button>
                                    <Button size="sm" variant="outline" className="h-7 text-xs px-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                                      onClick={async()=>{if(!user.email)return;const rn=restsWithDetails.find(r=>r.id===user.restaurantId)?.name;try{await fetch("/api/invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:user.email,restaurantName:rn,role:user.role})});toast.success("קוד נשלח ל-"+user.email)}catch{toast.error("שגיאה")}}}>שלח קוד</Button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {assignTarget && (
                    <div className="m-4 p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
                      <p className="text-sm font-medium">שיוך: <span dir="ltr" className="font-normal text-muted-foreground">{assignTarget.email}</span></p>
                      <div className="flex gap-2">
                        <select className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm" value={assignTargetRestId} onChange={e=>setAssignTargetRestId(e.target.value)}>
                          <option value="">— ללא מסעדה —</option>
                          {restsWithDetails.map(r=><option key={r.id} value={r.id}>{r.emoji?`${r.emoji} `:""}{r.name}</option>)}
                        </select>
                        <Button size="sm" onClick={handleAssignFromTable} disabled={savingAssign}>{savingAssign?<Loader2 className="w-3 h-3 animate-spin"/>:"שמור"}</Button>
                        <Button size="sm" variant="ghost" onClick={()=>setAssignTarget(null)}>ביטול</Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {hasFullAccess && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Ticket className="w-4 h-4"/>קוד הזמנה למנהל</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-3">{currentRestaurantId && isSystemOwner ? t("pages.adminPanel.managerCodeAssignDesc") : t("pages.adminPanel.managerCodeCreateDesc")}</p>
                    <div className="flex gap-2 items-center flex-wrap">
                      <Button size="sm" onClick={handleCreateManagerCode} disabled={generatingCode}>{generatingCode?<Loader2 className="w-3 h-3 animate-spin ml-1"/>:<Copy className="w-3 h-3 ml-1"/>}{t("pages.adminPanel.createCode")}</Button>
                      {lastGeneratedCode && (<div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted font-mono text-sm flex-1 justify-between"><span>{lastGeneratedCode}</span><Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={()=>{navigator.clipboard.writeText(lastGeneratedCode!);toast.success(t("pages.adminPanel.codeCopied"))}}><Copy className="w-3 h-3"/></Button></div>)}
                    </div>
                  </CardContent>
                </Card>
              )}
              {canAddUsers && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><UserPlus className="w-4 h-4"/>הזמן לפי אימייל</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-3">{t("pages.adminPanel.inviteUsersDesc")}</p>
                    <div className="flex gap-2 flex-wrap">
                      <Input type="email" placeholder={t("pages.adminPanel.userEmailPlaceholder")} value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} className="flex-1 min-w-[150px]"/>
                      {isSystemOwner && (<select value={inviteRole} onChange={e=>setInviteRole(e.target.value as "user"|"manager")} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="user">משתמש</option><option value="manager">מנהל</option></select>)}
                      <Button size="sm" onClick={handleInviteUser} disabled={inviting}>{inviting?<Loader2 className="w-3 h-3 animate-spin"/>:<UserPlus className="w-3 h-3 ml-1"/>}שלח</Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {canAddUsers && currentRestaurantId && !isSystemOwner && (
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Users className="w-5 h-5"/>{t("pages.adminPanel.restaurantUsers")}</CardTitle></CardHeader>
                <CardContent>{loadingUsers?(<div className="flex gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin"/>{t("pages.adminPanel.loadingUsers")}</div>):restaurantUsers.length===0?(<p className="text-sm text-muted-foreground">{t("pages.adminPanel.noUsersYet")}</p>):(<div className="space-y-3">{restaurantUsers.filter(u=>u.role!=="owner").map(u=>(<div key={u.uid} className="flex flex-col gap-3 p-3 rounded-lg border bg-muted/30"><div className="flex items-center justify-between"><span className="font-medium text-sm">{u.email||u.uid}</span>{editingPermissions===u.uid?(<Button size="sm" variant="ghost" onClick={()=>setEditingPermissions(null)}><X className="w-4 h-4"/></Button>):(<Button size="sm" variant="outline" onClick={()=>setEditingPermissions(u.uid)}>{t("pages.adminPanel.permissions")}</Button>)}</div>{editingPermissions===u.uid&&(<div className="grid grid-cols-2 gap-2 pt-2 border-t">{[{key:"canSeeDashboard" as const,lk:"permDashboard"},{key:"canSeeProductTree" as const,lk:"permProductTree"},{key:"canSeeIngredients" as const,lk:"permIngredients"},{key:"canSeeInventory" as const,lk:"permInventory"},{key:"canSeeSuppliers" as const,lk:"permSuppliers"},{key:"canSeePurchaseOrders" as const,lk:"permPurchaseOrders"},{key:"canSeeUpload" as const,lk:"permUpload"},{key:"canSeeReports" as const,lk:"permReports"},{key:"canSeeCosts" as const,lk:"permMenuCosts"},{key:"canSeeSettings" as const,lk:"permSettings"}].map(({key,lk})=>(<div key={key} className="flex items-center justify-between"><Label className="text-xs">{t(`pages.adminPanel.${lk}`)}</Label><Switch checked={u.permissions?.[key]??(key==="canSeeDashboard"||key==="canSeeProductTree"||key==="canSeeIngredients"||key==="canSeeInventory"||key==="canSeeSuppliers"||key==="canSeePurchaseOrders"||key==="canSeeUpload")} onCheckedChange={checked=>handleSavePermissions(u.uid,{...u.permissions,[key]:checked})}/></div>))}</div>)}</div>))}</div>)}</CardContent>
              </Card>
            )}

          </TabsContent>
        </Tabs>
      )}

      <Dialog open={addIngredientOpen} onOpenChange={(o) => { setAddIngredientOpen(o); if (!o) resetAddIngredientModal() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("pages.adminPanel.addIngredientToGlobal")}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {t("pages.adminPanel.addToGlobalDesc")}
            </p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("pages.adminPanel.ingredientNameLabel")}</Label>
              <Input value={addIngredientName} onChange={(e) => setAddIngredientName(e.target.value)} placeholder={t("pages.adminPanel.ingredientNamePlaceholder")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("pages.adminPanel.priceLabelNis")} *</Label>
                <Input type="text" inputMode="decimal" value={addIngredientPrice} onChange={(e) => setAddIngredientPrice(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>{t("pages.adminPanel.unitUnit")}</Label>
                <Select value={addIngredientUnit} onValueChange={setAddIngredientUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="גרם">{t("pages.adminPanel.unitGram")}</SelectItem>
                    <SelectItem value={'ק"ג'}>ק&quot;ג</SelectItem>
                    <SelectItem value="מל">{t("pages.adminPanel.unitMl")}</SelectItem>
                    <SelectItem value="ליטר">{t("pages.adminPanel.unitLiter")}</SelectItem>
                    <SelectItem value="יחידה">{t("pages.adminPanel.unitUnit")}</SelectItem>
                    <SelectItem value="חבילה">{t("pages.adminPanel.unitPackage")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("pages.adminPanel.wasteLabel")}</Label>
                <Input type="text" inputMode="decimal" value={addIngredientWaste} onChange={(e) => setAddIngredientWaste(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>{t("pages.adminPanel.inventory")}</Label>
                <Input type="text" inputMode="numeric" value={addIngredientStock} onChange={(e) => setAddIngredientStock(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>{t("pages.adminPanel.minStock")}</Label>
                <Input type="text" inputMode="numeric" value={addIngredientMinStock} onChange={(e) => setAddIngredientMinStock(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>{t("pages.adminPanel.skuLabel")}</Label>
                <Input value={addIngredientSku} onChange={(e) => setAddIngredientSku(e.target.value)} placeholder={t("pages.adminPanel.skuPlaceholder")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("pages.adminPanel.supplierOptional")}</Label>
              {(() => {
                const suppliers = suppliersWithRests.map((s) => s.name).sort()
                if (suppliers.length === 0) {
                  return (
                    <Input
                      value={addIngredientSupplier}
                      onChange={(e) => setAddIngredientSupplier(e.target.value)}
                      placeholder={t("pages.adminPanel.enterSupplierName")}
                    />
                  )
                }
                return (
                  <Select value={addIngredientSupplier || "__none__"} onValueChange={(v) => setAddIngredientSupplier(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder={t("pages.adminPanel.selectSupplier")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("pages.adminPanel.noSupplier")}</SelectItem>
                      {suppliers.map((name) => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddIngredientOpen(false)}>{t("pages.adminPanel.cancel")}</Button>
            <Button onClick={handleSaveAddIngredient} disabled={addIngredientSaving}>
              {addIngredientSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
              שמור רכיב
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editAdminIngredientOpen} onOpenChange={(o) => { setEditAdminIngredientOpen(o); if (!o) setEditAdminIngredient(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pages.adminPanel.editIngredient")}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {editAdminIngredient && `${editAdminIngredient.name} (${editAdminIngredient.source === "global" ? t("pages.adminPanel.global") : t("pages.adminPanel.restaurant")})`}
            </p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>מחיר ₪ *</Label>
                <Input type="text" inputMode="decimal" value={editAdminIngPrice} onChange={(e) => setEditAdminIngPrice(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>{t("pages.adminPanel.unitUnit")}</Label>
                <Select value={editAdminIngUnit} onValueChange={setEditAdminIngUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="גרם">{t("pages.adminPanel.unitGram")}</SelectItem>
                    <SelectItem value={'ק"ג'}>ק&quot;ג</SelectItem>
                    <SelectItem value="מל">{t("pages.adminPanel.unitMl")}</SelectItem>
                    <SelectItem value="ליטר">{t("pages.adminPanel.unitLiter")}</SelectItem>
                    <SelectItem value="יחידה">{t("pages.adminPanel.unitUnit")}</SelectItem>
                    <SelectItem value="חבילה">{t("pages.adminPanel.unitPackage")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>פחת %</Label>
                <Input type="text" inputMode="decimal" value={editAdminIngWaste} onChange={(e) => setEditAdminIngWaste(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>{t("pages.adminPanel.inventory")}</Label>
                <Input type="text" inputMode="numeric" value={editAdminIngStock} onChange={(e) => setEditAdminIngStock(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>{t("pages.adminPanel.minStock")}</Label>
                <Input type="text" inputMode="numeric" value={editAdminIngMinStock} onChange={(e) => setEditAdminIngMinStock(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("pages.adminPanel.skuLabel")}</Label>
              <Input value={editAdminIngSku} onChange={(e) => setEditAdminIngSku(e.target.value)} placeholder={t("pages.adminPanel.skuPlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label>{t("pages.adminPanel.supplierLabel")}</Label>
              <Input
                value={editAdminIngSupplier}
                onChange={(e) => setEditAdminIngSupplier(e.target.value)}
                placeholder={t("pages.adminPanel.supplierNamePlaceholder")}
                list="edit-admin-ing-supplier-list"
              />
              <datalist id="edit-admin-ing-supplier-list">
                {suppliersWithRests.map((s) => (
                  <option key={s.name} value={s.name} />
                ))}
              </datalist>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAdminIngredientOpen(false)}>{t("pages.adminPanel.cancel")}</Button>
            <Button onClick={handleSaveEditAdminIngredient} disabled={editAdminIngSaving}>
              {editAdminIngSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
              שמור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteRestDialogOpen} onOpenChange={setDeleteRestDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pages.adminPanel.deleteRestaurantTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את המסעדה &quot;{restToDelete?.name}&quot;? פעולה זו תמחק את כל המנות, הרכיבים וההגדרות ולא ניתן לשחזר.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingRestId}>{t("pages.adminPanel.cancel")}</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => restToDelete && handleDeleteRestaurant(restToDelete)}
              disabled={!!deletingRestId}
            >
              {deletingRestId ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Trash2 className="w-4 h-4 ml-1" />}
              מחק
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteSupplierDialogOpen} onOpenChange={(o) => { setDeleteSupplierDialogOpen(o); if (!o) setSupplierToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pages.adminPanel.deleteSupplierTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את הספק &quot;{supplierToDelete?.name}&quot;? פעולה זו תמחק את פרטי הספק, את כל הרכיבים הגלובליים שלו ואת השיוך למסעדות. לא ניתן לשחזר.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingSupplierName}>{t("pages.adminPanel.cancel")}</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDeleteSupplier}
              disabled={!!deletingSupplierName}
            >
              {deletingSupplierName ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Trash2 className="w-4 h-4 ml-1" />}
              מחק ספק
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={addSupplierOpen} onOpenChange={(o) => { setAddSupplierOpen(o); if (!o) resetAddSupplierModal() }}>
        <DialogContent className="!max-w-[min(98vw,100rem)] w-[calc(100vw-1rem)] sm:!max-w-[min(98vw,100rem)] max-h-[90dvh] overflow-hidden flex flex-col p-4 sm:p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">🏭</span>
              הוספת ספק חדש
            </DialogTitle>
            <p className="text-sm text-muted-foreground">{t("pages.adminPanel.supplierDetailsFull")}</p>
          </DialogHeader>
          <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0 -mx-2 px-2 mt-2">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6 xl:gap-10 min-w-0">
              <div className="space-y-4 p-5 rounded-xl bg-muted/50 border min-w-0">
                <h4 className="font-semibold flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center shrink-0">1</span>
                  פרטי הספק
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  <div className="space-y-2 sm:col-span-2 xl:col-span-3">
                    <Label>{t("pages.adminPanel.supplierNameLabel")}</Label>
                    <Input value={nsmName} onChange={(e) => setNsmName(e.target.value)} placeholder={t("pages.adminPanel.supplierNameExample")} className="w-full min-w-0" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("pages.adminPanel.phone")}</Label>
                    <Input value={nsmPhone} onChange={(e) => setNsmPhone(e.target.value)} type="tel" placeholder={t("pages.adminPanel.phonePlaceholder")} className="w-full min-w-0" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("pages.adminPanel.fax")}</Label>
                    <Input value={nsmFax} onChange={(e) => setNsmFax(e.target.value)} type="tel" placeholder="03-0000000" className="w-full min-w-0" />
                  </div>
                  <div className="space-y-2 sm:col-span-2 xl:col-span-1">
                    <Label>{t("pages.adminPanel.email")}</Label>
                    <Input value={nsmEmail} onChange={(e) => setNsmEmail(e.target.value)} type="email" placeholder="supplier@email.com" className="w-full min-w-0" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("pages.adminPanel.contact")}</Label>
                    <Input value={nsmContact} onChange={(e) => setNsmContact(e.target.value)} placeholder={t("pages.adminPanel.contactPlaceholder")} className="w-full min-w-0" />
                  </div>
                  <div className="space-y-2 sm:col-span-2 xl:col-span-1">
                    <Label>{t("pages.adminPanel.address")}</Label>
                    <Input value={nsmAddress} onChange={(e) => setNsmAddress(e.target.value)} placeholder={t("pages.adminPanel.addressPlaceholder")} className="w-full min-w-0" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("pages.adminPanel.deliveryDay")}</Label>
                    <Select value={nsmDeliveryDay} onValueChange={setNsmDeliveryDay}>
                      <SelectTrigger className="w-full min-w-0"><SelectValue placeholder={t("pages.adminPanel.selectDay")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ראשון">{t("pages.adminPanel.daySun")}</SelectItem>
                        <SelectItem value="שני">{t("pages.adminPanel.dayMon")}</SelectItem>
                        <SelectItem value="שלישי">{t("pages.adminPanel.dayTue")}</SelectItem>
                        <SelectItem value="רביעי">{t("pages.adminPanel.dayWed")}</SelectItem>
                        <SelectItem value="חמישי">{t("pages.adminPanel.dayThu")}</SelectItem>
                        <SelectItem value="שישי">{t("pages.adminPanel.dayFri")}</SelectItem>
                        <SelectItem value="כל יום">{t("pages.adminPanel.everyDay")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("pages.adminPanel.paymentTerms")}</Label>
                    <Select value={nsmPaymentTerms} onValueChange={setNsmPaymentTerms}>
                      <SelectTrigger className="w-full min-w-0"><SelectValue placeholder={t("pages.adminPanel.select")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="מזומן">{t("pages.adminPanel.cash")}</SelectItem>
                        <SelectItem value="שוטף + 30">שוטף + 30</SelectItem>
                        <SelectItem value="שוטף + 60">שוטף + 60</SelectItem>
                        <SelectItem value="שוטף + 90">שוטף + 90</SelectItem>
                        <SelectItem value="שיק">{t("pages.adminPanel.check")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("pages.adminPanel.minOrder")}</Label>
                    <Input value={nsmMinOrder} onChange={(e) => setNsmMinOrder(e.target.value)} type="number" placeholder="" min={0} className="w-full min-w-0" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("pages.adminPanel.deliveryCost")}</Label>
                    <Input value={nsmDeliveryCost} onChange={(e) => setNsmDeliveryCost(e.target.value)} type="number" placeholder="" min={0} className="w-full min-w-0" />
                  </div>
                  <div className="space-y-2 sm:col-span-2 xl:col-span-1">
                    <Label>{t("pages.adminPanel.vatId")}</Label>
                    <Input value={nsmVatId} onChange={(e) => setNsmVatId(e.target.value)} placeholder={t("pages.adminPanel.vatIdPlaceholder")} className="w-full min-w-0" />
                  </div>
                  <div className="space-y-2 sm:col-span-2 xl:col-span-3">
                    <Label>{t("pages.adminPanel.notes")}</Label>
                    <Input value={nsmNotes} onChange={(e) => setNsmNotes(e.target.value)} placeholder={t("pages.adminPanel.notesPlaceholder")} className="w-full min-w-0" />
                  </div>
                </div>
              </div>
            <div className="space-y-3 sm:space-y-4 p-5 rounded-xl bg-primary/5 border border-primary/20 min-w-0">
              <h4 className="font-semibold flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center shrink-0">2</span>
                רכיבים של הספק
                <Badge variant="secondary">{nsmItems.length} רכיבים</Badge>
              </h4>
              <div className="max-h-40 sm:max-h-52 overflow-y-auto border rounded-lg p-2 space-y-2">
                {nsmItems.map((i) => (
                  <div key={i.name} className="flex items-center justify-between gap-2 py-1 px-2 bg-background rounded">
                    <span className="text-sm">
                      {i.name} — ₪{i.price.toFixed(2)} / {i.unit}
                      {i.waste > 0 && ` | פחת ${i.waste}%`}
                      {i.sku && ` | מק״ט ${i.sku}`}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => removeNsmItem(i.name)} className="text-destructive">
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                {nsmItems.length === 0 && <p className="text-sm text-muted-foreground py-2">{t("pages.adminPanel.addIngredients")}</p>}
              </div>
              <div className="space-y-3 p-4 bg-background rounded-lg border">
                <p className="text-sm font-medium">➕ הוסף רכיב</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 min-w-0">
                  <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                    <Label className="text-xs">{t("pages.adminPanel.searchOrEnterIngredient")}</Label>
                    <Input value={nsmItemName} onChange={(e) => setNsmItemName(e.target.value)} placeholder={t("pages.adminPanel.ingredientNamePlaceholderShort")} className="min-w-0 w-full" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNsmItem())} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("pages.adminPanel.pricePlaceholder")}</Label>
                    <Input value={nsmItemPrice} onChange={(e) => setNsmItemPrice(e.target.value)} type="text" inputMode="decimal" placeholder={t("pages.adminPanel.pricePlaceholder")} className="min-w-0" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("pages.adminPanel.unitUnit")}</Label>
                    <Select value={nsmItemUnit} onValueChange={setNsmItemUnit}>
                    <SelectTrigger className="w-full min-w-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="גרם">{t("pages.adminPanel.unitGram")}</SelectItem>
                      <SelectItem value={'ק"ג'}>ק&quot;ג</SelectItem>
                      <SelectItem value="מל">{t("pages.adminPanel.unitMl")}</SelectItem>
                      <SelectItem value="ליטר">{t("pages.adminPanel.unitLiter")}</SelectItem>
                      <SelectItem value="יחידה">{t("pages.adminPanel.unitUnit")}</SelectItem>
                      <SelectItem value="חבילה">{t("pages.adminPanel.unitPackage")}</SelectItem>
                    </SelectContent>
                  </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("pages.adminPanel.wastePlaceholder")}</Label>
                    <Input value={nsmItemWaste} onChange={(e) => setNsmItemWaste(e.target.value)} type="text" inputMode="decimal" placeholder={t("pages.adminPanel.wastePlaceholder")} className="min-w-0" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("pages.adminPanel.inventory")}</Label>
                    <Input value={nsmItemStock} onChange={(e) => setNsmItemStock(e.target.value)} type="text" inputMode="numeric" placeholder={t("pages.adminPanel.inventory")} className="min-w-0" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("pages.adminPanel.minStockPlaceholder")}</Label>
                    <Input value={nsmItemMinStock} onChange={(e) => setNsmItemMinStock(e.target.value)} type="text" inputMode="numeric" placeholder={t("pages.adminPanel.minStockPlaceholder")} className="min-w-0" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">{t("pages.adminPanel.skuPlaceholderShort")}</Label>
                    <Input value={nsmItemSku} onChange={(e) => setNsmItemSku(e.target.value)} placeholder={t("pages.adminPanel.skuPlaceholderShort")} className="min-w-0 w-full" />
                  </div>
                </div>
                <Button type="button" size="sm" onClick={addNsmItem}>➕ {t("pages.adminPanel.addIngredient")}</Button>
              </div>
            </div>
          </div>
          </div>
          <DialogFooter className="shrink-0 border-t pt-4 mt-4">
            <Button type="button" variant="outline" onClick={() => setAddSupplierOpen(false)}>{t("pages.adminPanel.cancel")}</Button>
            <Button type="button" onClick={handleSaveNewSupplier} disabled={addSupplierSaving}>
              {addSupplierSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
              💾 {t("pages.adminPanel.saveSupplier")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editSupplierOpen} onOpenChange={setEditSupplierOpen}>
        <DialogContent className="!max-w-[min(98vw,100rem)] w-[calc(100vw-1rem)] sm:!max-w-[min(98vw,100rem)] max-h-[90dvh] overflow-hidden flex flex-col p-6">
          <DialogHeader className="shrink-0 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">✏️</span>
              {t("pages.adminPanel.addIngredientsToSupplier")}: {editSupplierName}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1">{t("pages.adminPanel.newIngredientsNotice")}</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 space-y-6 mt-2">
            {(supplierToIngredients[editSupplierName] || []).length > 0 && (
              <div className="space-y-2">
                <Label>{t("pages.adminPanel.existingIngredientsLabel")} ({supplierToIngredients[editSupplierName]?.length ?? 0})</Label>
                <div className="max-h-32 overflow-y-auto border rounded-lg p-2 space-y-1 bg-muted/30">
                  {(supplierToIngredients[editSupplierName] || []).map((i) => (
                    <div key={i.id} className="flex items-center justify-between gap-2 py-1 px-2 text-sm">
                      <span>{i.name} — ₪{i.price.toFixed(2)} / {i.unit}{i.waste > 0 ? ` | פחת ${i.waste}%` : ""}{i.sku ? ` | מק״ט ${i.sku}` : ""}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => handleDeleteIngredientFromSupplier(i, editSupplierName, (suppliersWithRests.find((s) => s.name === editSupplierName)?.restaurantIds || []))}
                        disabled={deletingIngredientId === `${i.source}-${i.id}`}
                      >
                        {deletingIngredientId === `${i.source}-${i.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-4">
              <Label className="text-base">{t("pages.adminPanel.newIngredientsToAdd")}</Label>
              <div className="max-h-40 overflow-y-auto border rounded-lg p-3 space-y-2">
                {editNsmItems.map((i) => (
                  <div key={i.name} className="flex items-center justify-between gap-2 py-1 px-2 bg-muted rounded">
                    <span className="text-sm">
                      {i.name} — ₪{i.price.toFixed(2)} / {i.unit}
                      {i.waste > 0 && ` | פחת ${i.waste}%`}
                      {i.sku && ` | מק״ט ${i.sku}`}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => removeEditNsmItem(i.name)} className="text-destructive h-8 w-8 p-0">
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                {editNsmItems.length === 0 && <p className="text-sm text-muted-foreground py-2">{t("pages.adminPanel.addIngredients")}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg border">
                <div className="relative space-y-1.5 sm:col-span-2 lg:col-span-1">
                  <Label className="text-sm font-medium">{t("pages.adminPanel.searchOrEnterIngredient")}</Label>
                  <Input
                    value={editNsmItemName}
                    onChange={(e) => {
                      setEditNsmItemName(e.target.value)
                      setEditIngredientSearchOpen(true)
                    }}
                    onFocus={() => setEditIngredientSearchOpen(true)}
                    onBlur={() => setTimeout(() => setEditIngredientSearchOpen(false), 120)}
                    placeholder={t("pages.adminPanel.searchOrEnterIngredient")}
                    className="min-w-[200px] w-full"
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEditNsmItem())}
                    autoFocus
                  />
                  {editIngredientSearchOpen && (() => {
                    const q = editNsmItemName.trim().toLowerCase()
                    const allIngs = Object.values(supplierToIngredients || {}).flat()
                    const matches = q ? allIngs.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 10) : allIngs.slice(0, 8)
                    if (matches.length === 0) return null
                    return (
                      <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-background border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {matches.map((i) => (
                          <button
                            key={`${i.supplier}-${i.id}`}
                            type="button"
                            className="w-full px-3 py-2 text-right hover:bg-muted text-sm flex items-center justify-between gap-2"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              setEditNsmItemName(i.name)
                              setEditNsmItemPrice(String(i.price))
                              setEditNsmItemUnit(i.unit)
                              setEditNsmItemWaste(String(i.waste))
                              setEditNsmItemStock(String(i.stock))
                              setEditNsmItemMinStock(String(i.minStock))
                              setEditNsmItemSku(i.sku || "")
                              setEditIngredientSearchOpen(false)
                            }}
                          >
                            <span>{i.name}</span>
                            <span className="text-muted-foreground text-xs">₪{i.price.toFixed(2)} / {i.unit}</span>
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t("pages.adminPanel.pricePlaceholder")}</Label>
                  <Input value={editNsmItemPrice} onChange={(e) => setEditNsmItemPrice(e.target.value)} type="text" inputMode="decimal" placeholder={t("pages.adminPanel.pricePlaceholderHelp")} className="min-w-0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t("pages.adminPanel.unitUnit")}</Label>
                  <Select value={editNsmItemUnit} onValueChange={setEditNsmItemUnit}>
                  <SelectTrigger className="w-full min-w-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="גרם">{t("pages.adminPanel.unitGram")}</SelectItem>
                    <SelectItem value={'ק"ג'}>ק&quot;ג</SelectItem>
                    <SelectItem value="מל">{t("pages.adminPanel.unitMl")}</SelectItem>
                    <SelectItem value="ליטר">{t("pages.adminPanel.unitLiter")}</SelectItem>
                    <SelectItem value="יחידה">{t("pages.adminPanel.unitUnit")}</SelectItem>
                    <SelectItem value="חבילה">{t("pages.adminPanel.unitPackage")}</SelectItem>
                  </SelectContent>
                </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t("pages.adminPanel.wastePlaceholder")}</Label>
                  <Input value={editNsmItemWaste} onChange={(e) => setEditNsmItemWaste(e.target.value)} type="text" inputMode="decimal" placeholder={t("pages.adminPanel.wastePlaceholderHelp")} className="min-w-0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t("pages.adminPanel.inventory")}</Label>
                  <Input value={editNsmItemStock} onChange={(e) => setEditNsmItemStock(e.target.value)} type="text" inputMode="numeric" placeholder={t("pages.adminPanel.inventoryPlaceholderHelp")} className="min-w-0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t("pages.adminPanel.minStockPlaceholder")}</Label>
                  <Input value={editNsmItemMinStock} onChange={(e) => setEditNsmItemMinStock(e.target.value)} type="text" inputMode="numeric" placeholder={t("pages.adminPanel.minStockPlaceholderHelp")} className="min-w-0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t("pages.adminPanel.skuPlaceholderShort")}</Label>
                  <Input value={editNsmItemSku} onChange={(e) => setEditNsmItemSku(e.target.value)} placeholder={t("pages.adminPanel.skuPlaceholderHelp")} className="min-w-0" />
                </div>
                <Button type="button" size="sm" onClick={addEditNsmItem} className="sm:col-span-2">➕ {t("pages.adminPanel.addIngredient")}</Button>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setEditSupplierOpen(false)}>{t("pages.adminPanel.cancel")}</Button>
            <Button type="button" onClick={handleSaveEditSupplier} disabled={editSupplierSaving || editNsmItems.length === 0}>
              {editSupplierSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
              💾 {t("pages.adminPanel.saveAndUpdateRestaurants")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editSupplierDetailsOpen} onOpenChange={setEditSupplierDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pages.adminPanel.editSupplierDetails")}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {editSupplierDetailsName && `${t("pages.adminPanel.supplierLabelShort")}: ${editSupplierDetailsName}`}
            </p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("pages.adminPanel.phone")}</Label>
              <Input
                value={editSupplierDetailsPhone}
                onChange={(e) => setEditSupplierDetailsPhone(e.target.value)}
                placeholder={t("pages.adminPanel.phonePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("pages.adminPanel.email")}</Label>
              <Input
                type="email"
                value={editSupplierDetailsEmail}
                onChange={(e) => setEditSupplierDetailsEmail(e.target.value)}
                placeholder={t("pages.adminPanel.emailPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("pages.adminPanel.contact")}</Label>
              <Input
                value={editSupplierDetailsContact}
                onChange={(e) => setEditSupplierDetailsContact(e.target.value)}
                placeholder={t("pages.adminPanel.contactNamePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("pages.adminPanel.address")}</Label>
              <Input
                value={editSupplierDetailsAddress}
                onChange={(e) => setEditSupplierDetailsAddress(e.target.value)}
                placeholder={t("pages.adminPanel.addressPlaceholderShort")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditSupplierDetailsOpen(false)}>{t("pages.adminPanel.cancel")}</Button>
            <Button type="button" onClick={handleSaveEditSupplierDetails} disabled={editSupplierDetailsSaving}>
              {editSupplierDetailsSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
              {t("pages.adminPanel.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


    </div>
  )
}
