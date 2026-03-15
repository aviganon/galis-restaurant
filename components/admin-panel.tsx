"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { Shield, Key, Loader2, Building2, UserPlus, Users, Check, X, Copy, Ticket, UserCircle, UtensilsCrossed, Package, Truck, Trash2, Plus, Edit2, RefreshCw, Search, ArrowUpDown, ArrowUp, ArrowDown, Globe, ChevronDown, GripVertical, Columns3, Upload as UploadIcon, FileText } from "lucide-react"
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
import { doc, setDoc, getDoc, getDocFromServer, collection, collectionGroup, query, where, getDocs, getDocsFromServer, deleteDoc, writeBatch } from "firebase/firestore"
import { FilePreviewModal } from "@/components/file-preview-modal"
import type { ExtractedSupplierItem } from "@/lib/ai-extract"
import { syncSupplierIngredientsToAssignedRestaurants } from "@/lib/sync-supplier-ingredients"
import { firestoreConfig } from "@/lib/firestore-config"
import { db } from "@/lib/firebase"
import { auth } from "@/lib/firebase"
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
  const displayPrice = cheapest ? `₪${cheapest.price.toFixed(1)}/${cheapest.unit}` : null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors hover:bg-muted text-muted-foreground"
        >
          {displayPrice || "—"}
          <ChevronDown className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-4">
        <div className="space-y-4">
          {gc ? (
            <div className="rounded-lg border p-3 text-sm">
              <div className="text-xs font-medium text-muted-foreground mb-1">{t("pages.adminPanel.fromSuppliers")}</div>
              <div className="font-semibold">₪{gc.price.toFixed(1)}/{gc.unit}</div>
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
          <div className="font-semibold">₪{data.price.toFixed(1)}/{data.unit}</div>
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
    <Button variant="outline" size="sm" className="w-full" onClick={fetchWebPrice} disabled={loading}>
      {loading ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : <Globe className="w-3 h-3 ml-1" />}
      {t("pages.adminPanel.checkOnline")}
    </Button>
  )
}

export function AdminPanel() {
  const t = useTranslations()
  const { dir } = useLanguage()
  const { userRole, isSystemOwner, currentRestaurantId, restaurants, onImpersonate, onStopImpersonate, isImpersonating, onRestaurantDeleted, refreshRestaurants, refreshIngredients } = useApp()
  const isRtl = dir === "rtl"
  const textAlign = isRtl ? "text-right" : "text-left"
  const justify = isRtl ? "justify-end" : "justify-start"
  const [apiKey, setApiKey] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newRestName, setNewRestName] = useState("")
  const [newRestEmoji, setNewRestEmoji] = useState("")
  const [newRestInviteCode, setNewRestInviteCode] = useState("")
  const [creatingRest, setCreatingRest] = useState(false)
  const [newRestOpen, setNewRestOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
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
  const [systemOwnerTab, setSystemOwnerTab] = useState<"restaurants" | "suppliers" | "ingredients">("restaurants")
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
    <div style={{direction:"rtl",minHeight:"100vh",background:"var(--color-background-tertiary)",fontFamily:"var(--font-sans)"}}>

      {/* SIDEBAR */}
      <div style={{position:"fixed",top:0,right:0,bottom:0,width:60,background:"var(--color-background-primary)",borderLeft:"0.5px solid var(--color-border-tertiary)",display:"flex",flexDirection:"column",alignItems:"center",padding:"12px 0",gap:4,zIndex:50}}>
        <div style={{width:32,height:32,borderRadius:8,background:"#1D9E75",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8,cursor:"pointer",flexShrink:0}}>
          <span style={{color:"#fff",fontWeight:700,fontSize:13}}>R</span>
        </div>
        {([
          {id:"restaurants" as const,emoji:"🏠",tip:"מסעדות"},
          {id:"suppliers" as const,emoji:"🛒",tip:"ספקים"},
          {id:"ingredients" as const,emoji:"🥬",tip:"רכיבים"},
        ]).map(({id,emoji,tip})=>(
          <div key={id} title={tip}
            onClick={()=>setSystemOwnerTab(id)}
            style={{width:44,height:44,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:20,background:systemOwnerTab===id?"var(--color-background-secondary)":"transparent",transition:"background .15s",position:"relative"}}
            onMouseEnter={e=>{if(systemOwnerTab!==id)(e.currentTarget as HTMLElement).style.background="var(--color-background-secondary)"}}
            onMouseLeave={e=>{if(systemOwnerTab!==id)(e.currentTarget as HTMLElement).style.background="transparent"}}
          >
            {emoji}
            {systemOwnerTab===id&&<div style={{position:"absolute",left:-12,top:"50%",transform:"translateY(-50%)",width:3,height:24,background:"var(--color-text-primary)",borderRadius:2}}/>}
          </div>
        ))}
        <div style={{width:32,height:1,background:"var(--color-border-tertiary)",margin:"4px 0"}}/>
        <div title="משתמשים" style={{width:44,height:44,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:18}}
          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="var(--color-background-secondary)"}
          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="transparent"}
        >👥</div>
        <div title="קוד הזמנה" style={{width:44,height:44,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:18}}
          onClick={handleCreateManagerCode}
          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="var(--color-background-secondary)"}
          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="transparent"}
        >🎫</div>
        <div style={{flex:1}}/>
        <div title="הגדרות" style={{width:44,height:44,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:18}}
          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="var(--color-background-secondary)"}
          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="transparent"}
        >⚙️</div>
      </div>

      {/* MAIN */}
      <div style={{marginRight:60,padding:"20px 24px",maxWidth:1100}}>

        {/* TOP BAR */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <div>
            <div style={{fontSize:20,fontWeight:500,color:"var(--color-text-primary)"}}>
              {systemOwnerTab==="restaurants"&&"מסעדות"}
              {systemOwnerTab==="suppliers"&&"ספקים גלובליים"}
              {systemOwnerTab==="ingredients"&&"רכיבים גלובליים"}
            </div>
            <div style={{fontSize:13,color:"var(--color-text-secondary)",marginTop:2}}>
              {restsWithDetails.length} מסעדות · {suppliersWithRests.length} ספקים
            </div>
          </div>
          <div style={{marginRight:"auto",display:"flex",gap:8}}>
            {isImpersonating&&onStopImpersonate&&(
              <Button size="sm" variant="outline" onClick={onStopImpersonate}>← חזור לפאנל בעלים</Button>
            )}
            {lastGeneratedCode&&(
              <div style={{display:"flex",alignItems:"center",gap:6,background:"var(--color-background-secondary)",padding:"4px 10px",borderRadius:8,border:"0.5px solid var(--color-border-tertiary)"}}>
                <span style={{fontFamily:"var(--font-mono)",fontSize:14,fontWeight:600,letterSpacing:"0.1em"}}>{lastGeneratedCode}</span>
                <Button size="sm" variant="ghost" onClick={()=>navigator.clipboard.writeText(lastGeneratedCode!)} style={{fontSize:11,height:22}}>📋</Button>
              </div>
            )}
          </div>
        </div>

        {/* STATS */}
        {isSystemOwner&&adminStats&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
            {([
              {emoji:"🏠",val:restsWithDetails.length,lbl:"מסעדות פעילות",bg:"#EAF3DE"},
              {emoji:"🛒",val:suppliersWithRests.length,lbl:"ספקים גלובליים",bg:"#FAEEDA"},
              {emoji:"🥬",val:adminStats.ings,lbl:"רכיבים בקטלוג",bg:"#E6F1FB"},
              {emoji:"👥",val:adminStats.users,lbl:"משתמשים",bg:"#EEEDFE"},
            ] as const).map(({emoji,val,lbl,bg},i)=>(
              <div key={i} style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:12,padding:16,transition:"transform .2s",cursor:"default"}}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.transform="translateY(-2px)"}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.transform="translateY(0)"}
              >
                <div style={{width:36,height:36,borderRadius:8,background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,marginBottom:10}}>{emoji}</div>
                <div style={{fontSize:24,fontWeight:500,color:"var(--color-text-primary)"}}>{val}</div>
                <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>{lbl}</div>
              </div>
            ))}
          </div>
        )}

        {/* ===== RESTAURANTS ===== */}
        {systemOwnerTab==="restaurants"&&isSystemOwner&&(
          <div style={{marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:15,fontWeight:500,color:"var(--color-text-primary)",display:"flex",alignItems:"center",gap:8}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:"#1D9E75",display:"inline-block"}}/>מסעדות
              </div>
              <Button size="sm" onClick={()=>setNewRestOpen(true)}>+ מסעדה חדשה</Button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
              {restsWithDetails.map((rest,idx)=>{
                const grads=["linear-gradient(135deg,#0F6E56,#1D9E75)","linear-gradient(135deg,#185FA5,#378ADD)","linear-gradient(135deg,#533AAB,#7F77DD)","linear-gradient(135deg,#854F0B,#BA7517)","linear-gradient(135deg,#993C1D,#D85A30)"]
                const fc=rest.fcAvg||0
                const fcC=fc<30?"#1D9E75":fc<35?"#BA7517":"#D85A30"
                return (
                  <div key={rest.id} style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:12,overflow:"hidden",transition:"transform .2s"}}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.transform="translateY(-3px)"}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.transform="translateY(0)"}
                  >
                    <div style={{height:72,background:grads[idx%grads.length],position:"relative",display:"flex",alignItems:"flex-end",padding:"8px 12px"}}>
                      <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,.4),transparent 60%)"}}/>
                      <span style={{fontSize:24,position:"absolute",top:10,right:12,filter:"drop-shadow(0 2px 4px rgba(0,0,0,.2))"}}>{rest.emoji||"🍽️"}</span>
                      <span style={{position:"relative",zIndex:1,fontSize:13,fontWeight:500,color:"#fff"}}>{rest.name}</span>
                    </div>
                    <div style={{padding:12}}>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap" as const,marginBottom:10}}>
                        <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:"#EAF3DE",color:"#3B6D11",border:"0.5px solid #C0DD97"}}>פעיל</span>
                        <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:"#E6F1FB",color:"#185FA5",border:"0.5px solid #B5D4F4"}}>{(rest.assignedSuppliers||[]).length} ספקים</span>
                        {rest.dishesCount>0&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:"var(--color-background-secondary)",color:"var(--color-text-secondary)",border:"0.5px solid var(--color-border-tertiary)"}}>{rest.dishesCount} מנות</span>}
                      </div>
                      {fc>0&&(<>
                        <div style={{height:4,borderRadius:2,background:"var(--color-background-secondary)",overflow:"hidden",marginBottom:4}}>
                          <div style={{height:4,borderRadius:2,width:`${Math.min(fc*2.5,100)}%`,background:fcC,transition:"width .6s ease"}}/>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--color-text-tertiary)",marginBottom:10}}>
                          <span>food cost</span><span style={{color:fcC,fontWeight:500}}>{fc}%</span>
                        </div>
                      </>)}
                      <div style={{display:"flex",gap:6,marginBottom:8}}>
                        <Button size="sm" variant="outline" style={{flex:1,fontSize:11}} onClick={()=>onImpersonate?.({id:rest.id,name:rest.name,emoji:rest.emoji||""})}>← כנס</Button>
                        <Button size="sm" variant="outline" style={{fontSize:11}} onClick={()=>{setRestToDelete(rest);setDeleteRestDialogOpen(true)}}>🗑</Button>
                      </div>
                      <div style={{borderTop:"0.5px solid var(--color-border-tertiary)",paddingTop:8}}>
                        <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginBottom:5}}>ספקים:</div>
                        <div style={{display:"flex",flexWrap:"wrap" as const,gap:3}}>
                          {(rest.assignedSuppliers||[]).map((s:string)=>(
                            <span key={s} style={{fontSize:11,padding:"2px 6px",borderRadius:4,background:"var(--color-background-secondary)",color:"var(--color-text-secondary)",border:"0.5px solid var(--color-border-tertiary)",display:"flex",alignItems:"center",gap:3}}>
                              {s}<span style={{cursor:"pointer",fontSize:10,color:"var(--color-text-tertiary)"}} onClick={()=>handleRemoveSupplier(rest.id,s)}>✕</span>
                            </span>
                          ))}
                          <select style={{fontSize:11,padding:"2px 5px",borderRadius:4,border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",cursor:"pointer"}}
                            onChange={e=>{if(e.target.value){handleAssignSupplier(rest.id,e.target.value);e.target.value=""}}} defaultValue="">
                            <option value="">+ שייך ספק</option>
                            {suppliersWithRests.filter(s=>!(rest.assignedSuppliers||[]).includes(s.name)).map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div style={{background:"var(--color-background-secondary)",border:"1.5px dashed var(--color-border-secondary)",borderRadius:12,display:"flex",flexDirection:"column" as const,alignItems:"center",justifyContent:"center",padding:24,cursor:"pointer",minHeight:160,transition:"background .15s"}}
                onClick={()=>setNewRestOpen(true)}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="var(--color-background-tertiary)"}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="var(--color-background-secondary)"}
              >
                <div style={{fontSize:28,marginBottom:6}}>+</div>
                <div style={{fontSize:12,color:"var(--color-text-secondary)"}}>מסעדה חדשה</div>
              </div>
            </div>
          </div>
        )}

        {/* ===== SUPPLIERS ===== */}
        {systemOwnerTab==="suppliers"&&isSystemOwner&&(
          <div style={{marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:15,fontWeight:500,color:"var(--color-text-primary)",display:"flex",alignItems:"center",gap:8}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:"#BA7517",display:"inline-block"}}/>ספקים גלובליים
              </div>
              <Button size="sm" onClick={()=>setAddSupplierOpen(true)}>+ ספק חדש</Button>
            </div>
            <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:12,overflow:"hidden"}}>
              {/* Upload zone */}
              <div
                onDragOver={handleAdminInvoiceDragOver} onDragEnter={handleAdminInvoiceDragEnter}
                onDragLeave={handleAdminInvoiceDragLeave} onDrop={handleAdminInvoiceDrop}
                onClick={()=>adminInvoiceFileRef.current?.click()}
                style={{margin:12,border:`1.5px dashed ${isInvoiceDragging?"#1D9E75":"var(--color-border-secondary)"}`,borderRadius:8,padding:14,display:"flex",alignItems:"center",gap:10,cursor:"pointer",transition:"background .15s",background:isInvoiceDragging?"rgba(29,158,117,.07)":"transparent"}}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="var(--color-background-secondary)"}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=isInvoiceDragging?"rgba(29,158,117,.07)":"transparent"}
              >
                <input ref={adminInvoiceFileRef} type="file" accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.rtf" style={{display:"none"}} onChange={handleAdminInvoiceFileSelect}/>
                <div style={{width:38,height:38,borderRadius:8,background:"#FAEEDA",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>📄</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)"}}>העלה חשבונית ספק</div>
                  <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:2}}>PDF, Excel, תמונה — AI יחלץ פרטים אוטומטית</div>
                </div>
                <Button size="sm" style={{fontSize:11}} onClick={e=>{e.stopPropagation();adminInvoiceFileRef.current?.click()}}>העלה</Button>
              </div>
              {/* Search */}
              <div style={{display:"flex",gap:8,padding:"0 12px 10px",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                <Input placeholder="חיפוש ספק..." value={suppliersSearchText} onChange={e=>setSuppliersSearchText(e.target.value)} className="h-8" style={{fontSize:12}}/>
              </div>
              {/* List */}
              <div style={{maxHeight:500,overflowY:"auto" as const}}>
                {filteredAndSortedSuppliers.map(sup=>{
                  const bgs=["#EAF3DE","#E6F1FB","#FAEEDA","#FCEBEB","#EEEDFE"]
                  const tcs=["#0F6E56","#185FA5","#854F0B","#993C1D","#533AAB"]
                  const ci=Math.abs((sup.name||"").charCodeAt(0))%5
                  const initials=(sup.name||"").split(/\s+/).slice(0,2).map((w:string)=>w[0]||"").join("")
                  return (
                    <div key={sup.name} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",transition:"background .1s"}}
                      onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="var(--color-background-secondary)"}
                      onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="transparent"}
                    >
                      <div style={{width:34,height:34,borderRadius:8,background:bgs[ci],color:tcs[ci],display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600,flexShrink:0,border:"0.5px solid var(--color-border-tertiary)"}}>
                        {initials.slice(0,2)||"?"}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)"}}>{sup.name}</div>
                        <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:1}}>
                          {sup.restaurantIds?.length||0} מסעדות{sup.phone&&` · ${sup.phone}`}
                        </div>
                      </div>
                      <div style={{width:44,background:"var(--color-background-secondary)",borderRadius:2,height:3}}>
                        <div style={{height:3,borderRadius:2,background:"#1D9E75",width:`${Math.min(((sup.restaurantIds?.length||0)/Math.max(restsWithDetails.length,1))*100,100)}%`}}/>
                      </div>
                      <button onClick={e=>{e.stopPropagation();setEditSupplierName(sup.name)}} style={{height:26,padding:"0 8px",border:"0.5px solid var(--color-border-tertiary)",borderRadius:6,fontSize:11,background:"var(--color-background-primary)",cursor:"pointer"}}>✏️</button>
                      <button onClick={e=>{e.stopPropagation();setDeletingSupplierName(sup.name);setDeleteSupplierDialogOpen(true)}} style={{height:26,padding:"0 8px",border:"0.5px solid var(--color-border-tertiary)",borderRadius:6,fontSize:11,background:"var(--color-background-primary)",cursor:"pointer"}}>🗑</button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ===== INGREDIENTS ===== */}
        {systemOwnerTab==="ingredients"&&isSystemOwner&&(
          <div style={{marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:15,fontWeight:500,color:"var(--color-text-primary)",display:"flex",alignItems:"center",gap:8}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:"#639922",display:"inline-block"}}/>רכיבים גלובליים
              </div>
              <div style={{display:"flex",gap:8}}>
                <Button size="sm" variant="outline" style={{fontSize:11}}>⬇ Excel</Button>
                <Button size="sm" onClick={()=>setAddIngredientOpen(true)}>+ רכיב</Button>
              </div>
            </div>
            <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:12,overflow:"hidden"}}>
              <div style={{display:"flex",gap:8,padding:"10px 12px",borderBottom:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)"}}>
                <Input placeholder="חיפוש רכיב..." value={ingredientsSearchText} onChange={e=>setIngredientsSearchText(e.target.value)} className="h-8" style={{fontSize:12}}/>
                <select style={{height:32,fontSize:11,border:"0.5px solid var(--color-border-tertiary)",borderRadius:6,padding:"0 8px",background:"var(--color-background-primary)",color:"var(--color-text-secondary)"}}>
                  <option value="">כל הספקים</option>
                  {suppliersWithRests.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              </div>
              <div style={{overflowX:"auto" as const}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead style={{background:"var(--color-background-secondary)"}}>
                    <tr>
                      <th style={{textAlign:"right",padding:"9px 12px",fontWeight:500,color:"var(--color-text-tertiary)",fontSize:11,borderBottom:"0.5px solid var(--color-border-tertiary)",width:52}}>תמונה</th>
                      <th style={{textAlign:"right",padding:"9px 8px",fontWeight:500,color:"var(--color-text-tertiary)",fontSize:11,borderBottom:"0.5px solid var(--color-border-tertiary)"}}>שם רכיב</th>
                      <th style={{textAlign:"right",padding:"9px 8px",fontWeight:500,color:"var(--color-text-tertiary)",fontSize:11,borderBottom:"0.5px solid var(--color-border-tertiary)"}}>ספק</th>
                      <th style={{textAlign:"right",padding:"9px 8px",fontWeight:500,color:"var(--color-text-tertiary)",fontSize:11,borderBottom:"0.5px solid var(--color-border-tertiary)"}}>מחיר</th>
                      <th style={{textAlign:"right",padding:"9px 8px",fontWeight:500,color:"var(--color-text-tertiary)",fontSize:11,borderBottom:"0.5px solid var(--color-border-tertiary)"}}>יחידה</th>
                      <th style={{textAlign:"center",padding:"9px 8px",width:44,borderBottom:"0.5px solid var(--color-border-tertiary)"}}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedIngredients.map((ing:IngredientRow)=>{
                      const imgQ=encodeURIComponent(ing.name.replace(/[()]/g,"").trim())
                      const fallback=`https://ui-avatars.com/api/?name=${encodeURIComponent(ing.name.slice(0,2))}&size=40&background=EAF3DE&color=0F6E56&bold=true&format=svg`
                      return (
                        <tr key={ing.id} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",transition:"background .1s",cursor:"pointer"}}
                          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="var(--color-background-secondary)"}
                          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="transparent"}
                          onClick={()=>{setEditAdminIngredient(ing);setEditAdminIngredientOpen(true)}}
                        >
                          <td style={{padding:"7px 12px"}}>
                            <div style={{width:40,height:40,borderRadius:8,overflow:"hidden",background:"var(--color-background-secondary)"}}>
                              <img
                                src={`https://source.unsplash.com/40x40/?food,${imgQ}`}
                                alt={ing.name} width={40} height={40}
                                style={{width:40,height:40,objectFit:"cover" as const,display:"block"}}
                                onError={e=>{(e.target as HTMLImageElement).src=fallback}}
                              />
                            </div>
                          </td>
                          <td style={{padding:"7px 8px"}}>
                            <div style={{fontWeight:500,color:"var(--color-text-primary)",fontSize:13}}>{ing.name}</div>
                            {ing.sku&&<div style={{fontSize:10,color:"var(--color-text-tertiary)"}}>{ing.sku}</div>}
                          </td>
                          <td style={{padding:"7px 8px",color:"var(--color-text-secondary)",fontSize:12}}>{ing.supplier}</td>
                          <td style={{padding:"7px 8px"}}>
                            <span style={{fontSize:12,fontFamily:"var(--font-mono,monospace)",background:"var(--color-background-secondary)",padding:"2px 6px",borderRadius:4}}>₪{ing.price.toFixed(2)}</span>
                          </td>
                          <td style={{padding:"7px 8px",color:"var(--color-text-tertiary)",fontSize:11}}>{ing.unit}</td>
                          <td style={{padding:"7px 8px",textAlign:"center"}}>
                            <button onClick={e=>{e.stopPropagation();handleDeleteIngredientFromSupplier(ing,ing.supplier,ing.source==="global"?(suppliersWithRests.find(s=>s.name===ing.supplier)?.restaurantIds||[]):undefined)}}
                              style={{height:24,padding:"0 8px",border:"0.5px solid var(--color-border-tertiary)",borderRadius:4,fontSize:11,background:"transparent",color:"var(--color-text-tertiary)",cursor:"pointer"}}>🗑</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* canAddUsers section */}
        {canAddUsers&&currentRestaurantId&&(
          <div style={{marginBottom:20}}>
            <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:12,overflow:"hidden"}}>
              <div style={{padding:"12px 16px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:13,fontWeight:500,color:"var(--color-text-primary)",display:"flex",alignItems:"center",gap:7}}>
                <span>👥</span>{t("pages.adminPanel.restaurantUsers")}
              </div>
              <div style={{padding:"12px 16px"}}>
                {loadingUsers?<div style={{display:"flex",gap:8,color:"var(--color-text-secondary)",fontSize:13}}><Loader2 className="w-4 h-4 animate-spin"/>{t("pages.adminPanel.loadingUsers")}</div>
                :restaurantUsers.length===0?<p style={{fontSize:13,color:"var(--color-text-secondary)"}}>{t("pages.adminPanel.noUsersYet")}</p>
                :<div style={{display:"flex",flexDirection:"column" as const,gap:8}}>
                  {restaurantUsers.filter(u=>u.role!=="owner").map(u=>(
                    <div key={u.uid} style={{padding:10,borderRadius:8,border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                        <span style={{fontWeight:500,fontSize:13}}>{u.email||u.uid}</span>
                        <Button size="sm" variant="outline" onClick={()=>setEditingPermissions(editingPermissions===u.uid?null:u.uid)} style={{fontSize:11}}>{t("pages.adminPanel.permissions")}</Button>
                      </div>
                      {editingPermissions===u.uid&&(
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,paddingTop:8,borderTop:"0.5px solid var(--color-border-tertiary)"}}>
                          {([
                            {key:"canSeeDashboard" as const,labelKey:"permDashboard"},
                            {key:"canSeeProductTree" as const,labelKey:"permProductTree"},
                            {key:"canSeeIngredients" as const,labelKey:"permIngredients"},
                            {key:"canSeeInventory" as const,labelKey:"permInventory"},
                            {key:"canSeeSuppliers" as const,labelKey:"permSuppliers"},
                            {key:"canSeePurchaseOrders" as const,labelKey:"permPurchaseOrders"},
                            {key:"canSeeUpload" as const,labelKey:"permUpload"},
                            {key:"canSeeReports" as const,labelKey:"permReports"},
                            {key:"canSeeCosts" as const,labelKey:"permMenuCosts"},
                            {key:"canSeeSettings" as const,labelKey:"permSettings"},
                          ]).map(({key,labelKey})=>(
                            <div key={key} style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                              <Label style={{fontSize:11}}>{t(`pages.adminPanel.${labelKey}`)}</Label>
                              <Switch checked={u.permissions?.[key]??(["canSeeDashboard","canSeeProductTree","canSeeIngredients","canSeeInventory","canSeeSuppliers","canSeePurchaseOrders","canSeeUpload"].includes(key))}
                                onCheckedChange={checked=>handleSavePermissions(u.uid,{...u.permissions,[key]:checked})}/>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>}
              </div>
            </div>
          </div>
        )}

      </div>{/* /main */}

      {/* ===== DIALOGS ===== */}
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

      {hasFullAccess && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                {t("pages.adminPanel.claudeApiKey")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("pages.adminPanel.apiKeyDesc")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("pages.adminPanel.whereToRegister")}{" "}
                <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Anthropic (Claude)
                </a>
                {" "}•{" "}
                <a href="https://serper.dev/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Serper
                </a>
                {" "}({t("pages.adminPanel.serperSearchDesc")})
              </p>
              {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("common.loading")}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="claude-api-key">{t("pages.adminPanel.keyLabel")}</Label>
                  <Input
                    id="claude-api-key"
                    name="claudeApiKey"
                    type="password"
                    placeholder={apiKey ? t("pages.adminPanel.keyPlaceholderSet") : t("pages.adminPanel.keyPlaceholderNew")}
                    className="font-mono"
                    autoComplete="off"
                  />
                  <div className="flex flex-wrap gap-2 items-center">
                    <Button onClick={handleSaveKey} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                      {t("pages.adminPanel.save")}
                    </Button>
                    {apiKey && (
                      <>
                        <Button variant="outline" onClick={handleTestApi} disabled={testingApi}>
                          {testingApi ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                          {t("pages.adminPanel.checkConnection")}
                        </Button>
                        <Button variant="outline" onClick={handleClearKey} disabled={saving}>
                          {t("pages.adminPanel.removeKey")}
                        </Button>
                      </>
                    )}
                    {apiTestResult && (
                      <span className="text-sm text-muted-foreground">{apiTestResult}</span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {hasFullAccess && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ticket className="w-5 h-5" />
                  {t("pages.adminPanel.createInviteCode")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {currentRestaurantId && isSystemOwner
                    ? t("pages.adminPanel.managerCodeAssignDesc")
                    : t("pages.adminPanel.managerCodeCreateDesc")}
                </p>
                <div className="flex gap-2 items-center">
                  <Button onClick={handleCreateManagerCode} disabled={generatingCode}>
                    {generatingCode ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Copy className="w-4 h-4 ml-1" />}
                    {t("pages.adminPanel.createCode")}
                  </Button>
                  {lastGeneratedCode && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted font-mono text-sm">
                      {lastGeneratedCode}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(lastGeneratedCode!)
                          toast.success(t("pages.adminPanel.codeCopied"))
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {isSystemOwner && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  ניהול משתמשים ושיוך למסעדות
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {currentRestaurantId && (
                  <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
                    <p className="text-sm font-medium">שיוך מהיר לפי אימייל → מסעדה נבחרת</p>
                    <div className="flex gap-2">
                      <Input type="email" placeholder="אימייל המנהל" value={assignManagerEmail}
                        onChange={(e) => { setAssignManagerEmail(e.target.value); setAssignManagerResult(null) }}
                        className="flex-1" dir="ltr" />
                      <Button onClick={handleAssignManager} disabled={assigningManager}>
                        {assigningManager ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <UserPlus className="w-4 h-4 ml-1" />}
                        שייך
                      </Button>
                    </div>
                    {assignManagerResult && (
                      <p className={`text-sm ${assignManagerResult.ok ? "text-green-600" : "text-destructive"}`}>{assignManagerResult.msg}</p>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">כל המשתמשים במערכת</p>
                    <Button size="sm" variant="outline" onClick={loadAllSystemUsers} disabled={loadingAllUsers}>
                      {loadingAllUsers ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <span className="ml-1">🔄</span>}
                      {allUsersLoaded ? "רענן" : "טען משתמשים"}
                    </Button>
                  </div>
                  {allUsersLoaded && allSystemUsers.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted sticky top-0">
                            <tr>
                              <th className="text-right p-2 font-semibold">אימייל</th>
                              <th className="text-center p-2 font-semibold">תפקיד</th>
                              <th className="text-right p-2 font-semibold">מסעדה נוכחית</th>
                              <th className="text-center p-2 font-semibold w-20">שיוך</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allSystemUsers.map(user => (
                              <tr key={user.uid} className="border-t border-border hover:bg-muted/30">
                                <td className="p-2 text-xs">
                                  <div className="font-medium" dir="ltr">{user.email}</div>
                                  {(user.name || user.phone) && (
                                    <div className="text-muted-foreground mt-0.5">
                                      {user.name && <span>{user.name}</span>}
                                      {user.name && user.phone && <span className="mx-1">·</span>}
                                      {user.phone && <span dir="ltr">{user.phone}</span>}
                                    </div>
                                  )}
                                </td>
                                <td className="p-2 text-center">
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${user.role === "owner" ? "bg-purple-100 text-purple-700" : user.role === "manager" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                                    {user.role === "owner" ? "בעלים" : user.role === "manager" ? "מנהל" : "משתמש"}
                                  </span>
                                </td>
                                <td className="p-2 text-muted-foreground text-xs">{user.restaurantName || (user.restaurantId ? "—" : "ללא מסעדה")}</td>
                                <td className="p-2 text-center">
                                  {user.role !== "owner" && (
                                    <Button size="sm" variant="outline" className="h-7 text-xs px-2"
                                      onClick={() => { setAssignTarget({uid: user.uid, email: user.email}); setAssignTargetRestId(user.restaurantId || "") }}>
                                      שנה
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {allUsersLoaded && allSystemUsers.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">אין משתמשים</p>
                  )}
                </div>
                {assignTarget && (
                  <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
                    <p className="text-sm font-medium">שיוך: <span dir="ltr" className="font-normal">{assignTarget.email}</span></p>
                    <div className="flex gap-2">
                      <select className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={assignTargetRestId} onChange={e => setAssignTargetRestId(e.target.value)}>
                        <option value="">— ללא מסעדה —</option>
                        {restsWithDetails.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <Button size="sm" onClick={handleAssignFromTable} disabled={savingAssign}>
                        {savingAssign ? <Loader2 className="w-4 h-4 animate-spin" /> : "שמור"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAssignTarget(null)}>ביטול</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {canAddUsers && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5" />
                  {t("pages.adminPanel.addUserToRestaurant")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("pages.adminPanel.inviteUsersDesc")}
                </p>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder={t("pages.adminPanel.userEmailPlaceholder")}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={handleInviteUser} disabled={inviting}>
                    {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4 ml-1" />}
                    {t("pages.adminPanel.invite")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {canAddUsers && currentRestaurantId && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  {t("pages.adminPanel.restaurantUsers")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("pages.adminPanel.setPermissionsDesc")}
                </p>
                {loadingUsers ? (
                  <div className="flex gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("pages.adminPanel.loadingUsers")}
                  </div>
                ) : restaurantUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("pages.adminPanel.noUsersYet")}</p>
                ) : (
                  <div className="space-y-4">
                    {restaurantUsers
                      .filter((u) => u.role !== "owner")
                      .map((u) => (
                        <div
                          key={u.uid}
                          className="flex flex-col gap-3 p-3 rounded-lg border bg-muted/30"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{u.email || u.uid}</span>
                            {editingPermissions === u.uid ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingPermissions(null)}
                                title={t("pages.adminPanel.close")}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingPermissions(u.uid)}
                              >
                                {t("pages.adminPanel.permissions")}
                              </Button>
                            )}
                          </div>
                          {editingPermissions === u.uid && (
                            <div className="flex flex-col gap-2 pt-2 border-t">
                              <p className="text-xs text-muted-foreground mb-1">{t("pages.adminPanel.whatUserSeesInMenu")}</p>
                              {[
                                { key: "canSeeDashboard" as const, labelKey: "permDashboard" },
                                { key: "canSeeProductTree" as const, labelKey: "permProductTree" },
                                { key: "canSeeIngredients" as const, labelKey: "permIngredients" },
                                { key: "canSeeInventory" as const, labelKey: "permInventory" },
                                { key: "canSeeSuppliers" as const, labelKey: "permSuppliers" },
                                { key: "canSeePurchaseOrders" as const, labelKey: "permPurchaseOrders" },
                                { key: "canSeeUpload" as const, labelKey: "permUpload" },
                                { key: "canSeeReports" as const, labelKey: "permReports" },
                                { key: "canSeeCosts" as const, labelKey: "permMenuCosts" },
                                { key: "canSeeSettings" as const, labelKey: "permSettings" },
                              ].map(({ key, labelKey }) => (
                                <div key={key} className="flex items-center justify-between">
                                  <Label className="text-sm">{t(`pages.adminPanel.${labelKey}`)}</Label>
                                  <Switch
                                    checked={u.permissions?.[key] ?? (key === "canSeeDashboard" || key === "canSeeProductTree" || key === "canSeeIngredients" || key === "canSeeInventory" || key === "canSeeSuppliers" || key === "canSeePurchaseOrders" || key === "canSeeUpload")}
                                    onCheckedChange={(checked) => {
                                      const next = { ...u.permissions, [key]: checked }
                                      handleSavePermissions(u.uid, next)
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    {restaurantUsers.filter((u) => u.role !== "owner").length === 0 && restaurantUsers.length > 0 && (
                      <p className="text-sm text-muted-foreground">{t("pages.adminPanel.noUsersWithPermissions")}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
