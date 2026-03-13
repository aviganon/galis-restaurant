"use client"

import { useState, useEffect, useCallback } from "react"
import { Shield, Key, Loader2, Building2, UserPlus, Users, Check, X, Copy, Ticket, UserCircle, UtensilsCrossed, Package, Truck, Trash2, Plus, Edit2, RefreshCw, Search, ArrowUpDown, ArrowUp, ArrowDown, Globe, ChevronDown } from "lucide-react"
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
  DialogFooter,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { getClaudeApiKey, setClaudeApiKey, testClaudeConnection } from "@/lib/claude"
import { toast } from "sonner"
import { useTranslations } from "@/lib/use-translations"
import { doc, setDoc, getDoc, getDocFromServer, collection, collectionGroup, query, where, getDocs, getDocsFromServer, deleteDoc, writeBatch } from "firebase/firestore"
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
      <PopoverContent align="start" className="w-72">
        <div className="space-y-2">
          {gc ? (
            <div className="text-sm text-muted-foreground">
              <span className="text-muted-foreground">{t("pages.adminPanel.fromSuppliers")}:</span> ₪{gc.price.toFixed(1)}/{gc.unit}
              {gc.supplier && <span className="text-primary font-medium"> {t("pages.ingredients.at")} {gc.supplier}</span>}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">{t("pages.adminPanel.fromSuppliers")}: —</div>
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
      <div className="text-blue-600 dark:text-blue-400 text-xs space-y-1">
        <div>
          <span className="text-muted-foreground">{t("pages.adminPanel.fromInternet")}:</span> ₪{data.price.toFixed(1)}/{data.unit} {t("pages.ingredients.at")} {data.store}
        </div>
        <div className="flex gap-2 items-center">
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs text-primary"
            onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(ingredientName + " " + data.store + " מחיר קנייה")}`, "_blank")}
          >
            {t("pages.adminPanel.buyOnline")} →
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={fetchWebPrice} disabled={loading}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 ml-1" />}
            {t("pages.adminPanel.checkAgain")}
          </Button>
        </div>
      </div>
    )
  }
  return (
    <Button variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={fetchWebPrice} disabled={loading}>
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3 ml-1" />}
      {t("pages.adminPanel.checkOnline")}
    </Button>
  )
}

export function AdminPanel() {
  const t = useTranslations()
  const { userRole, isSystemOwner, currentRestaurantId, restaurants, onImpersonate, refreshRestaurants, refreshIngredients } = useApp()
  const [apiKey, setApiKey] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newRestName, setNewRestName] = useState("")
  const [newRestEmoji, setNewRestEmoji] = useState("")
  const [newRestInviteCode, setNewRestInviteCode] = useState("")
  const [creatingRest, setCreatingRest] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviting, setInviting] = useState(false)
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

  const [suppliersSearchText, setSuppliersSearchText] = useState("")
  const [suppliersFilterAssigned, setSuppliersFilterAssigned] = useState<string>("__all__")
  const [suppliersSortBy, setSuppliersSortBy] = useState<string>("")
  const [suppliersSortDir, setSuppliersSortDir] = useState<"asc" | "desc">("asc")
  const [selectedSupplierDetail, setSelectedSupplierDetail] = useState<string | null>(null)
  const [loadingSystemOwner, setLoadingSystemOwner] = useState(false)
  const [addIngredientOpen, setAddIngredientOpen] = useState(false)
  const [addIngredientName, setAddIngredientName] = useState("")
  const [addIngredientPrice, setAddIngredientPrice] = useState("")
  const [addIngredientUnit, setAddIngredientUnit] = useState("ק\"ג")
  const [addIngredientWaste, setAddIngredientWaste] = useState("0")
  const [addIngredientStock, setAddIngredientStock] = useState("0")
  const [addIngredientMinStock, setAddIngredientMinStock] = useState("0")
  const [addIngredientSku, setAddIngredientSku] = useState("")
  const [addIngredientSupplier, setAddIngredientSupplier] = useState("")
  const [addIngredientSaving, setAddIngredientSaving] = useState(false)
  const [editAdminIngredientOpen, setEditAdminIngredientOpen] = useState(false)
  const [editAdminIngredient, setEditAdminIngredient] = useState<IngredientRow | null>(null)
  const [editAdminIngPrice, setEditAdminIngPrice] = useState("")
  const [editAdminIngUnit, setEditAdminIngUnit] = useState("ק\"ג")
  const [editAdminIngWaste, setEditAdminIngWaste] = useState("0")
  const [editAdminIngStock, setEditAdminIngStock] = useState("0")
  const [editAdminIngMinStock, setEditAdminIngMinStock] = useState("0")
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
  const [nsmItemWaste, setNsmItemWaste] = useState("0")
  const [nsmItemStock, setNsmItemStock] = useState("0")
  const [nsmItemMinStock, setNsmItemMinStock] = useState("0")
  const [nsmItemSku, setNsmItemSku] = useState("")

  // Edit supplier - add ingredients to existing
  const [editSupplierOpen, setEditSupplierOpen] = useState(false)
  const [editSupplierName, setEditSupplierName] = useState("")
  const [editSupplierSaving, setEditSupplierSaving] = useState(false)
  const [editNsmItems, setEditNsmItems] = useState<{ name: string; price: number; unit: string; waste: number; stock: number; minStock: number; sku: string }[]>([])
  const [editNsmItemName, setEditNsmItemName] = useState("")
  const [editNsmItemPrice, setEditNsmItemPrice] = useState("")
  const [editNsmItemUnit, setEditNsmItemUnit] = useState("ק\"ג")
  const [editNsmItemWaste, setEditNsmItemWaste] = useState("0")
  const [editNsmItemStock, setEditNsmItemStock] = useState("0")
  const [editNsmItemMinStock, setEditNsmItemMinStock] = useState("0")
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
        <p className="text-lg text-muted-foreground mb-2">אין הרשאה לצפייה בדף זה</p>
        <p className="text-sm text-muted-foreground">פאנל הניהול זמין לבעלים ולמנהלים בלבד</p>
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
      toast.error("שגיאה בטעינת נתונים")
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

  const resetAddIngredientModal = () => {
    setAddIngredientName("")
    setAddIngredientPrice("")
    setAddIngredientUnit("ק\"ג")
    setAddIngredientWaste("0")
    setAddIngredientStock("0")
    setAddIngredientMinStock("0")
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
      toast.error("הזן שם רכיב")
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
      toast.error((e as Error)?.message || "שגיאה")
    } finally {
      setAddIngredientSaving(false)
    }
  }

  const openEditAdminIngredient = (ing: IngredientRow) => {
    setEditAdminIngredient(ing)
    setEditAdminIngPrice(String(ing.price))
    setEditAdminIngUnit(ing.unit || "ק\"ג")
    setEditAdminIngWaste(String(ing.waste))
    setEditAdminIngStock(String(ing.stock))
    setEditAdminIngMinStock(String(ing.minStock))
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
      toast.error((e as Error)?.message || "שגיאה")
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
      toast.error((e as Error)?.message || "שגיאה במחיקה")
    } finally {
      setDeletingIngredientId(null)
    }
  }

  const handleAssignSupplier = async (restId: string, supplierName: string) => {
    setAssigningSupplier(`${restId}:${supplierName}`)
    try {
      const sn = (supplierName || "").trim()
      if (!sn) {
        toast.error("שם ספק לא תקין")
        return
      }
      const asRef = doc(db, "restaurants", restId, "appState", "assignedSuppliers")
      const asSnap = await getDocFromServer(asRef).catch(() => getDoc(asRef))
      const current: string[] = Array.isArray(asSnap.data()?.list) ? asSnap.data()!.list : []
      if (current.some((s) => (s || "").trim() === sn)) {
        toast.info("הספק כבר משויך")
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
    setNsmItemWaste("0")
    setNsmItemStock("0")
    setNsmItemMinStock("0")
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
      toast.error("הזן שם רכיב")
      return
    }
    setNsmItems((prev) => [...prev.filter((i) => i.name !== name), { name, price, unit: nsmItemUnit, waste, stock, minStock, sku, pkgSize: 0, pkgPrice: 0 }])
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

  const handleSaveNewSupplier = async () => {
    const supName = nsmName.trim()
    if (!supName) {
      toast.error("הזן שם ספק")
      return
    }
    if (nsmItems.length === 0) {
      toast.error("הוסף לפחות רכיב אחד")
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
    setEditNsmItemWaste("0")
    setEditNsmItemStock("0")
    setEditNsmItemMinStock("0")
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
      toast.error("הזן שם רכיב")
      return
    }
    setEditNsmItems((prev) => [...prev.filter((i) => i.name !== name), { name, price, unit: editNsmItemUnit, waste, stock, minStock, sku }])
    setEditNsmItemName("")
    setEditNsmItemPrice("")
    setEditNsmItemUnit("ק\"ג")
    setEditNsmItemWaste("0")
    setEditNsmItemStock("0")
    setEditNsmItemMinStock("0")
    setEditNsmItemSku("")
  }

  const removeEditNsmItem = (name: string) => {
    setEditNsmItems((prev) => prev.filter((i) => i.name !== name))
  }

  const handleSaveEditSupplier = async () => {
    if (!editSupplierName || editNsmItems.length === 0) {
      toast.error("הוסף לפחות רכיב אחד")
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
          : "רכיבים עודכנו בהצלחה"
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
      window.location.reload()
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
      toast.success("ההרשאות עודכנו")
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
      setApiTestResult(res.ok ? "✅ חיבור תקין" : `❌ ${res.message || "שגיאה"}`)
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
      toast.error("הזן שם מסעדה")
      return
    }
    const codeRaw = newRestInviteCode.trim().toUpperCase().replace(/\s/g, "")
    if (codeRaw) {
      const { inviteCodesCollection, inviteCodeFields } = firestoreConfig
      const codeSnap = await getDoc(doc(db, inviteCodesCollection, codeRaw))
      if (!codeSnap.exists()) {
        toast.error("קוד הזמנה לא תקין")
        return
      }
      const codeData = codeSnap.data()
      if (codeData?.[inviteCodeFields.used]) {
        toast.error("קוד הזמנה כבר נוצל")
        return
      }
      if (codeData?.[inviteCodeFields.type] !== "manager") {
        toast.error("קוד זה לא מתאים לשיוך מנהל")
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

  const handleInviteUser = async () => {
    const email = inviteEmail.trim()
    if (!email || !currentRestaurantId) {
      toast.error("הזן אימייל ובחר מסעדה")
      return
    }
    setInviting(true)
    try {
      const ref = doc(db, "restaurants", currentRestaurantId, "appState", "invitedEmails")
      const snap = await getDoc(ref)
      const current: string[] = Array.isArray(snap.data()?.list) ? snap.data()!.list : []
      if (current.includes(email)) {
        toast.info("המשתמש כבר הוזמן")
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
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-6 h-6" />
            פאנל ניהול
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {isSystemOwner
              ? "בעלים — ניהול כל המסעדות, משתמשים, התחזה וכו'."
              : userRole === "owner" || userRole === "manager"
                ? "מנהל מסעדה — הרשאות מלאות למסעדה שלך."
                : "גישה מוגבלת."}
          </p>
        </CardContent>
      </Card>

      {isSystemOwner && adminStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">{adminStats.rests}</p>
              <p className="text-xs text-muted-foreground">מסעדות</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">{adminStats.users}</p>
              <p className="text-xs text-muted-foreground">משתמשים</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">{adminStats.dishes}</p>
              <p className="text-xs text-muted-foreground">מנות</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">{adminStats.ings}</p>
              <p className="text-xs text-muted-foreground">רכיבים</p>
            </CardContent>
          </Card>
        </div>
      )}

      {isSystemOwner && (
        <Tabs value={systemOwnerTab} onValueChange={(v) => setSystemOwnerTab(v as "restaurants" | "suppliers" | "ingredients")}>
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
                      לחץ לרענון
                    </Button>
                  </p>
                )}
                <p className="text-sm text-muted-foreground mb-4">
                  צור מסעדה חדשה — תהיה הבעלים שלה. אפשר לשייך משתמשים אחר כך.
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  <div className="flex-1 min-w-[200px]">
                    <Label htmlFor="new-rest-name">שם המסעדה</Label>
                    <Input
                      id="new-rest-name"
                      value={newRestName}
                      onChange={(e) => setNewRestName(e.target.value)}
                      placeholder={t("pages.adminPanel.enterRestaurantName")}
                      className="mt-1"
                    />
                  </div>
                  <div className="w-24">
                    <Label htmlFor="new-rest-emoji">אימוג'י</Label>
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
                  <Label htmlFor="new-rest-invite-code">קוד הזמנה (אופציונלי)</Label>
                  <div className="flex gap-2 items-center mt-1">
                    <Input
                      id="new-rest-invite-code"
                      value={newRestInviteCode}
                      onChange={(e) => setNewRestInviteCode(e.target.value)}
                      placeholder="XXXX-XXXX — לשיוך מנהל מאוחר יותר"
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
                          toast.success("קוד נוצר והוזן בשדה. צור את המסעדה כדי לשייך.")
                        } catch (e) {
                          toast.error((e as Error).message)
                        } finally {
                          setGeneratingCode(false)
                        }
                      }}
                      disabled={generatingCode}
                    >
                      {generatingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      צור קוד
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    אופציונלי: צור קוד או הדבק קוד קיים. המנהל יוכל להירשם עם הקוד ולקבל גישה למסעדה.
                  </p>
                </div>
                <Button onClick={handleCreateRestaurant} disabled={creatingRest}>
                  {creatingRest ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Building2 className="w-4 h-4 ml-2" />}
                  צור מסעדה
                </Button>
              </CardContent>
            </Card>
            {loadingSystemOwner ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8">
                <Loader2 className="w-5 h-5 animate-spin" />
                טוען מסעדות...
              </div>
            ) : (
              <div className="space-y-4">
                {restsWithDetails.map((rest) => (
                  <Card key={rest.id}>
                    <CardHeader className="pb-2" dir="rtl">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {rest.emoji && <span>{rest.emoji}</span>}
                          {rest.name}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {rest.dishesCount} מנות · FC ממוצע {rest.fcAvg}%
                          </span>
                          {onImpersonate && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                onImpersonate({ id: rest.id, name: rest.name, emoji: rest.emoji })
                                toast.success(`מתחזה כמסעדה: ${rest.emoji ? `${rest.emoji} ` : ""}${rest.name}`)
                              }}
                            >
                              <UserCircle className="w-4 h-4 ml-1" />
                              התחזה
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
                            <span className="text-sm text-muted-foreground">אין ספקים משויכים</span>
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
                        <p className="text-sm font-medium mb-2">ספקים זמינים לשיוך:</p>
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
                            <span className="text-sm text-muted-foreground">כל הספקים כבר משויכים</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {restsWithDetails.length === 0 && !loadingSystemOwner && (
                  <p className="text-muted-foreground py-4">אין מסעדות במערכת</p>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="suppliers" className="mt-4">
            {loadingSystemOwner ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8">
                <Loader2 className="w-5 h-5 animate-spin" />
                טוען ספקים...
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle>ספקים גלובליים</CardTitle>
                      <p className="text-sm text-muted-foreground">רשימת כל הספקים מרכיבים גלובליים ומשיכתם למסעדות</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => loadSystemOwnerData()} disabled={loadingSystemOwner}>
                        <RefreshCw className={`w-4 h-4 ml-1 ${loadingSystemOwner ? "animate-spin" : ""}`} />
                        רענן
                      </Button>
                      <Button onClick={() => setAddSupplierOpen(true)}>
                        <Plus className="w-4 h-4 ml-1" />
                        הוסף ספק
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 items-center mb-4 p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                      <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                      <Input
                        value={suppliersSearchText}
                        onChange={(e) => setSuppliersSearchText(e.target.value)}
                        placeholder="חיפוש: ספק, טלפון, אימייל..."
                        className="h-9"
                      />
                    </div>
                    <Select value={suppliersFilterAssigned} onValueChange={setSuppliersFilterAssigned}>
                      <SelectTrigger className="w-[140px] h-9">
                        <SelectValue placeholder={t("pages.adminPanel.assign")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">הכל</SelectItem>
                        <SelectItem value="assigned">משויך למסעדות</SelectItem>
                        <SelectItem value="unassigned">לא משויך</SelectItem>
                      </SelectContent>
                    </Select>
                    {(suppliersSearchText || suppliersFilterAssigned !== "__all__") && (
                      <Button variant="ghost" size="sm" onClick={() => { setSuppliersSearchText(""); setSuppliersFilterAssigned("__all__") }}>
                        נקה סינון
                      </Button>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {filteredAndSortedSuppliers.length === (suppliersWithRests?.length ?? 0)
                        ? `${suppliersWithRests?.length ?? 0} ספקים`
                        : `מציג ${filteredAndSortedSuppliers.length} מתוך ${suppliersWithRests?.length ?? 0}`}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">לחץ על ספק כדי לראות את הפרטים והרכיבים שלו</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {filteredAndSortedSuppliers.map((s) => {
                      const ingCount = (supplierToIngredients[s.name] || []).length
                      return (
                        <Card
                          key={s.name}
                          className={cn(
                            "border-0 shadow-sm cursor-pointer transition-colors",
                            selectedSupplierDetail === s.name ? "ring-2 ring-primary bg-muted/50" : "hover:bg-muted/50"
                          )}
                          onClick={() => setSelectedSupplierDetail(selectedSupplierDetail === s.name ? null : s.name)}
                        >
                          <CardContent className="p-4 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                              <Truck className="w-6 h-6 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold truncate">{s.name}</p>
                              <p className="text-xs text-muted-foreground">{ingCount} רכיבים</p>
                            </div>
                            <span className="text-muted-foreground">›</span>
                          </CardContent>
                        </Card>
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
                              ערוך פרטים
                            </Button>
                            <Button size="sm" onClick={() => openEditSupplier(s.name)}>
                              <Plus className="w-4 h-4 ml-1" />
                              הוסף רכיב
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => { e.stopPropagation(); setSupplierToDelete(s); setDeleteSupplierDialogOpen(true) }}
                            >
                              <Trash2 className="w-4 h-4 ml-1" />
                              מחק ספק
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground mb-0.5">טלפון</p>
                            <p className="font-medium">{s.phone || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-0.5">אימייל</p>
                            <p className="font-medium">{s.email || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-0.5">איש קשר</p>
                            <p className="font-medium">{s.contact || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-0.5">כתובת</p>
                            <p className="font-medium">{s.address || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-0.5">משויך למסעדות</p>
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
                          <p className="text-sm font-medium mb-2">רכיבים ({supplierIngs.length})</p>
                          {supplierIngs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">אין רכיבים — לחץ על &quot;הוסף רכיב&quot;</p>
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
                                    <th className="text-right py-2 px-2 font-medium">מק״ט</th>
                                    <th className="text-right py-2 px-2 font-medium">מינ׳</th>
                                    <th className="text-right py-2 px-2 font-medium">מלאי</th>
                                    <th className="text-right py-2 px-2 font-medium">פחת %</th>
                                    <th className="text-right py-2 px-2 font-medium">יחידה</th>
                                    <th className="text-right py-2 px-2 font-medium">מחיר</th>
                                    <th className="text-right py-2 px-2 font-medium">רכיב</th>
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
                טוען רכיבים...
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>רכיבים</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="w-full overflow-x-hidden overflow-y-auto max-h-[min(60vh,600px)] rounded-lg border">
                  <Table className="table-fixed w-full text-sm" style={{ tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "6%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "6%" }} />
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "9%" }} />
                      <col style={{ width: "5%" }} />
                      <col style={{ width: "5%" }} />
                      <col style={{ width: "5%" }} />
                      <col style={{ width: "6%" }} />
                      <col style={{ width: "4%" }} />
                    </colgroup>
                    <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:bg-background [&_tr]:border-b">
                      <TableRow className="bg-muted/50 hover:bg-muted/50 border-b">
                        <TableHead className="text-right p-1.5 align-middle max-w-0">
                          <div className="flex items-center gap-1 min-w-0">
                            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <Input
                              value={ingredientsSearchText}
                              onChange={(e) => setIngredientsSearchText(e.target.value)}
                              placeholder="חיפוש..."
                              className="h-7 text-right flex-1 min-w-0 text-xs"
                            />
                            {ingredientsSearchText && (
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => setIngredientsSearchText("")} title="נקה">
                                <X className="w-3 h-3" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              className="h-7 shrink-0 text-xs px-1.5"
                              onClick={() => { setAddIngredientSupplier(""); setAddIngredientOpen(true) }}
                            >
                              <Plus className="w-3.5 h-3.5 ml-0.5" />
                              הוסף
                            </Button>
                          </div>
                        </TableHead>
                        <TableHead className="text-right p-2 align-middle text-xs text-muted-foreground">
                          {filteredAndSortedIngredients.length === (ingredientsList?.length ?? 0)
                            ? `${ingredientsList?.length ?? 0} רכיבים`
                            : `מציג ${filteredAndSortedIngredients.length} מתוך ${ingredientsList?.length ?? 0}`}
                        </TableHead>
                        <TableHead colSpan={10} className="p-0" />
                      </TableRow>
                      <TableRow>
                        {(["name", "price", "cheapest", "sku", "status", "source", "supplier", "minStock", "stock", "waste", "unit"] as const).map((key) => {
                          if (key === "cheapest") {
                            return <TableHead key="cheapest" className="text-right">הכי זול</TableHead>
                          }
                          const labels: Record<string, string> = { name: "רכיב", price: "מחיר", unit: "יחידה", waste: "פחת %", stock: "מלאי", minStock: "מינ׳", supplier: "ספק", sku: "מק״ט", source: "מקור", status: "סטטוס" }
                          const isSortable = ["name", "price", "unit", "waste", "stock", "minStock", "supplier", "sku", "source", "status"].includes(key)
                          return (
                            <TableHead
                              key={key}
                              className={`text-right ${isSortable ? "cursor-pointer hover:bg-muted/50 select-none" : ""}`}
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
                              <span className="flex items-center gap-1 justify-end">
                                {labels[key] || key}
                                {ingredientsSortBy === key && (
                                  ingredientsSortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                )}
                                {ingredientsSortBy !== key && isSortable && <ArrowUpDown className="w-3 h-3 opacity-40" />}
                              </span>
                            </TableHead>
                          )
                        })}
                        <TableHead className="text-right w-14">פעולות</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...filteredAndSortedIngredients].reverse().map((ing) => (
                        <TableRow key={`${ing.source}-${ing.id}`}>
                          <TableCell className="font-medium text-right truncate" title={ing.name}>{ing.name}</TableCell>
                          <TableCell className="text-right">₪{ing.price.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-sm">
                            <AdminCheapestPopover
                              ing={ing}
                              webPrice={webPriceByIngredient[ing.name]}
                              onWebPriceSaved={(d) => setWebPriceByIngredient((prev) => ({ ...prev, [ing.name]: d }))}
                              t={t}
                            />
                          </TableCell>
                          <TableCell className="text-right truncate" title={ing.sku || undefined}>{ing.sku || "—"}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={ing.status === "שויך" ? "default" : "secondary"}>{ing.status === "שויך" ? t("pages.adminPanel.assigned") : t("pages.adminPanel.pending")}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{ing.source === "global" ? t("pages.adminPanel.global") : t("pages.adminPanel.restaurant")}</TableCell>
                          <TableCell className="text-right truncate" title={ing.supplier || undefined}>{ing.supplier || "—"}</TableCell>
                          <TableCell className="text-right">{ing.minStock}</TableCell>
                          <TableCell className="text-right">{ing.stock}</TableCell>
                          <TableCell className="text-right">{ing.waste}%</TableCell>
                          <TableCell className="text-right">{ing.unit}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
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
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                  {filteredAndSortedIngredients.length === 0 && !loadingSystemOwner && (
                    <p className="text-muted-foreground py-4">
                      {(ingredientsList?.length ?? 0) === 0 ? t("pages.adminPanel.noIngredients") : t("pages.adminPanel.noResults")}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={addIngredientOpen} onOpenChange={(o) => { setAddIngredientOpen(o); if (!o) resetAddIngredientModal() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>הוסף רכיב לקטלוג הגלובלי</DialogTitle>
            <p className="text-sm text-muted-foreground">
              הרכיב יתווסף לקטלוג הגלובלי. ישויך אותו לספק — והספק למסעדות — כדי שיופיע אצלן.
            </p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>שם הרכיב *</Label>
              <Input value={addIngredientName} onChange={(e) => setAddIngredientName(e.target.value)} placeholder="למשל: קמח, שמן" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>מחיר ₪ *</Label>
                <Input type="number" value={addIngredientPrice} onChange={(e) => setAddIngredientPrice(e.target.value)} placeholder="0" min={0} step={0.01} />
              </div>
              <div className="space-y-2">
                <Label>יחידה</Label>
                <Select value={addIngredientUnit} onValueChange={setAddIngredientUnit}>
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
              <div className="space-y-2">
                <Label>פחת %</Label>
                <Input type="number" value={addIngredientWaste} onChange={(e) => setAddIngredientWaste(e.target.value)} placeholder="0" min={0} max={100} step={0.1} />
              </div>
              <div className="space-y-2">
                <Label>מלאי</Label>
                <Input type="number" value={addIngredientStock} onChange={(e) => setAddIngredientStock(e.target.value)} placeholder="0" min={0} />
              </div>
              <div className="space-y-2">
                <Label>מינ׳ מלאי</Label>
                <Input type="number" value={addIngredientMinStock} onChange={(e) => setAddIngredientMinStock(e.target.value)} placeholder="0" min={0} />
              </div>
              <div className="space-y-2">
                <Label>מק״ט</Label>
                <Input value={addIngredientSku} onChange={(e) => setAddIngredientSku(e.target.value)} placeholder="קוד מוצר" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>ספק (אופציונלי — ניתן לשייך בעריכה)</Label>
              {(() => {
                const suppliers = suppliersWithRests.map((s) => s.name).sort()
                if (suppliers.length === 0) {
                  return (
                    <Input
                      value={addIngredientSupplier}
                      onChange={(e) => setAddIngredientSupplier(e.target.value)}
                      placeholder="הזן שם ספק או השאר ריק"
                    />
                  )
                }
                return (
                  <Select value={addIngredientSupplier || "__none__"} onValueChange={(v) => setAddIngredientSupplier(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="בחר ספק או השאר ללא ספק" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">ללא ספק</SelectItem>
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
            <Button variant="outline" onClick={() => setAddIngredientOpen(false)}>ביטול</Button>
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
            <DialogTitle>עריכת רכיב</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {editAdminIngredient && `${editAdminIngredient.name} (${editAdminIngredient.source === "global" ? "גלובלי" : "מסעדה"})`}
            </p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>מחיר ₪ *</Label>
                <Input type="number" value={editAdminIngPrice} onChange={(e) => setEditAdminIngPrice(e.target.value)} min={0} step={0.01} />
              </div>
              <div className="space-y-2">
                <Label>יחידה</Label>
                <Select value={editAdminIngUnit} onValueChange={setEditAdminIngUnit}>
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
              <div className="space-y-2">
                <Label>פחת %</Label>
                <Input type="number" value={editAdminIngWaste} onChange={(e) => setEditAdminIngWaste(e.target.value)} min={0} max={100} step={0.1} />
              </div>
              <div className="space-y-2">
                <Label>מלאי</Label>
                <Input type="number" value={editAdminIngStock} onChange={(e) => setEditAdminIngStock(e.target.value)} min={0} />
              </div>
              <div className="space-y-2">
                <Label>מינ׳ מלאי</Label>
                <Input type="number" value={editAdminIngMinStock} onChange={(e) => setEditAdminIngMinStock(e.target.value)} min={0} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>מק״ט</Label>
              <Input value={editAdminIngSku} onChange={(e) => setEditAdminIngSku(e.target.value)} placeholder="קוד מוצר" />
            </div>
            <div className="space-y-2">
              <Label>ספק</Label>
              <Input
                value={editAdminIngSupplier}
                onChange={(e) => setEditAdminIngSupplier(e.target.value)}
                placeholder="שם ספק"
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
            <Button variant="outline" onClick={() => setEditAdminIngredientOpen(false)}>ביטול</Button>
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
            <AlertDialogTitle>מחיקת מסעדה</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את המסעדה &quot;{restToDelete?.name}&quot;? פעולה זו תמחק את כל המנות, הרכיבים וההגדרות ולא ניתן לשחזר.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingRestId}>ביטול</AlertDialogCancel>
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
            <AlertDialogTitle>מחיקת ספק</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את הספק &quot;{supplierToDelete?.name}&quot;? פעולה זו תמחק את פרטי הספק, את כל הרכיבים הגלובליים שלו ואת השיוך למסעדות. לא ניתן לשחזר.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingSupplierName}>ביטול</AlertDialogCancel>
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
        <DialogContent className="w-[calc(100vw-2rem)] sm:w-[90vw] max-w-[min(90vw,88rem)] max-h-[90dvh] overflow-hidden flex flex-col p-4 sm:p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">🏭</span>
              הוספת ספק חדש
            </DialogTitle>
            <p className="text-sm text-muted-foreground">פרטי ספק מלאים + רשימת רכיבים</p>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 -mx-2 px-2 mt-2">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6 xl:gap-10">
              <div className="space-y-4 p-5 rounded-xl bg-muted/50 border min-w-[280px]">
                <h4 className="font-semibold flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center shrink-0">1</span>
                  פרטי הספק
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  <div className="space-y-2 sm:col-span-2 xl:col-span-3">
                    <Label>שם הספק *</Label>
                    <Input value={nsmName} onChange={(e) => setNsmName(e.target.value)} placeholder="תנובה, אסם..." className="w-full min-w-0" />
                  </div>
                  <div className="space-y-2">
                    <Label>טלפון</Label>
                    <Input value={nsmPhone} onChange={(e) => setNsmPhone(e.target.value)} type="tel" placeholder="050-0000000" className="w-full min-w-0" />
                  </div>
                  <div className="space-y-2">
                    <Label>פקס</Label>
                    <Input value={nsmFax} onChange={(e) => setNsmFax(e.target.value)} type="tel" placeholder="03-0000000" className="w-full min-w-0" />
                  </div>
                  <div className="space-y-2 sm:col-span-2 xl:col-span-1">
                    <Label>אימייל</Label>
                    <Input value={nsmEmail} onChange={(e) => setNsmEmail(e.target.value)} type="email" placeholder="supplier@email.com" className="w-full min-w-0" />
                  </div>
                  <div className="space-y-2">
                    <Label>איש קשר</Label>
                    <Input value={nsmContact} onChange={(e) => setNsmContact(e.target.value)} placeholder="שם נציג" className="w-full min-w-0" />
                  </div>
                  <div className="space-y-2 sm:col-span-2 xl:col-span-1">
                    <Label>כתובת</Label>
                    <Input value={nsmAddress} onChange={(e) => setNsmAddress(e.target.value)} placeholder="רחוב, עיר" className="w-full min-w-0" />
                  </div>
                  <div className="space-y-2">
                    <Label>יום אספקה</Label>
                    <Select value={nsmDeliveryDay} onValueChange={setNsmDeliveryDay}>
                      <SelectTrigger className="w-full min-w-0"><SelectValue placeholder="בחר יום" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ראשון">ראשון</SelectItem>
                        <SelectItem value="שני">שני</SelectItem>
                        <SelectItem value="שלישי">שלישי</SelectItem>
                        <SelectItem value="רביעי">רביעי</SelectItem>
                        <SelectItem value="חמישי">חמישי</SelectItem>
                        <SelectItem value="שישי">שישי</SelectItem>
                        <SelectItem value="כל יום">כל יום</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>תנאי תשלום</Label>
                    <Select value={nsmPaymentTerms} onValueChange={setNsmPaymentTerms}>
                      <SelectTrigger className="w-full min-w-0"><SelectValue placeholder="בחר" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="מזומן">מזומן</SelectItem>
                        <SelectItem value="שוטף + 30">שוטף + 30</SelectItem>
                        <SelectItem value="שוטף + 60">שוטף + 60</SelectItem>
                        <SelectItem value="שוטף + 90">שוטף + 90</SelectItem>
                        <SelectItem value="שיק">שיק</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>מינ׳ הזמנה (₪)</Label>
                    <Input value={nsmMinOrder} onChange={(e) => setNsmMinOrder(e.target.value)} type="number" placeholder="0" min={0} className="w-full min-w-0" />
                  </div>
                  <div className="space-y-2">
                    <Label>עלות משלוח (₪)</Label>
                    <Input value={nsmDeliveryCost} onChange={(e) => setNsmDeliveryCost(e.target.value)} type="number" placeholder="0" min={0} className="w-full min-w-0" />
                  </div>
                  <div className="space-y-2 sm:col-span-2 xl:col-span-1">
                    <Label>ח.פ / ע.מ</Label>
                    <Input value={nsmVatId} onChange={(e) => setNsmVatId(e.target.value)} placeholder="מספר עוסק" className="w-full min-w-0" />
                  </div>
                  <div className="space-y-2 sm:col-span-2 xl:col-span-3">
                    <Label>הערות</Label>
                    <Input value={nsmNotes} onChange={(e) => setNsmNotes(e.target.value)} placeholder="תנאים, הנחות..." className="w-full min-w-0" />
                  </div>
                </div>
              </div>
            <div className="space-y-3 sm:space-y-4 p-5 rounded-xl bg-primary/5 border border-primary/20 min-w-[280px]">
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
                {nsmItems.length === 0 && <p className="text-sm text-muted-foreground py-2">הוסף רכיבים</p>}
              </div>
              <div className="space-y-2 p-3 bg-background rounded-lg border">
                <p className="text-sm font-medium">➕ הוסף רכיב</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Input value={nsmItemName} onChange={(e) => setNsmItemName(e.target.value)} placeholder="שם רכיב" className="min-w-0" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNsmItem())} />
                  <Input value={nsmItemPrice} onChange={(e) => setNsmItemPrice(e.target.value)} type="number" placeholder="מחיר ₪" min={0} step={0.01} className="min-w-0" />
                  <Select value={nsmItemUnit} onValueChange={setNsmItemUnit}>
                    <SelectTrigger className="w-full min-w-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="גרם">גרם</SelectItem>
                      <SelectItem value={'ק"ג'}>ק&quot;ג</SelectItem>
                      <SelectItem value="מל">מל</SelectItem>
                      <SelectItem value="ליטר">ליטר</SelectItem>
                      <SelectItem value="יחידה">יחידה</SelectItem>
                      <SelectItem value="חבילה">חבילה</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input value={nsmItemWaste} onChange={(e) => setNsmItemWaste(e.target.value)} type="number" placeholder="פחת %" min={0} max={100} step={0.1} className="min-w-0" />
                  <Input value={nsmItemStock} onChange={(e) => setNsmItemStock(e.target.value)} type="number" placeholder="מלאי" min={0} className="min-w-0" />
                  <Input value={nsmItemMinStock} onChange={(e) => setNsmItemMinStock(e.target.value)} type="number" placeholder="מינ׳ מלאי" min={0} className="min-w-0" />
                  <Input value={nsmItemSku} onChange={(e) => setNsmItemSku(e.target.value)} placeholder="מק״ט" className="min-w-0 sm:col-span-2" />
                </div>
                <Button size="sm" onClick={addNsmItem}>➕ הוסף</Button>
              </div>
            </div>
          </div>
          </div>
          <DialogFooter className="shrink-0 border-t pt-4 mt-4">
            <Button variant="outline" onClick={() => setAddSupplierOpen(false)}>ביטול</Button>
            <Button onClick={handleSaveNewSupplier} disabled={addSupplierSaving}>
              {addSupplierSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
              💾 שמור ספק
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editSupplierOpen} onOpenChange={setEditSupplierOpen}>
        <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90dvh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">✏️</span>
              הוספת רכיבים לספק: {editSupplierName}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">רכיבים חדשים יתווספו לקטלוג הגלובלי ויעודכנו אוטומטית במסעדות המשויכות</p>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 space-y-4 mt-4">
            {(supplierToIngredients[editSupplierName] || []).length > 0 && (
              <div className="space-y-2">
                <Label>רכיבים קיימים ({supplierToIngredients[editSupplierName]?.length ?? 0})</Label>
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
            <div className="space-y-2">
              <Label>רכיבים חדשים להוספה *</Label>
              <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-2">
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
                {editNsmItems.length === 0 && <p className="text-sm text-muted-foreground py-2">הוסף רכיבים</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <div className="relative">
                  <Input
                    value={editNsmItemName}
                    onChange={(e) => {
                      setEditNsmItemName(e.target.value)
                      setEditIngredientSearchOpen(true)
                    }}
                    onFocus={() => setEditIngredientSearchOpen(true)}
                    onBlur={() => setTimeout(() => setEditIngredientSearchOpen(false), 150)}
                    placeholder="חפש או הזן שם רכיב"
                    className="min-w-0"
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
                <Input value={editNsmItemPrice} onChange={(e) => setEditNsmItemPrice(e.target.value)} type="number" placeholder="מחיר ₪" min={0} step={0.01} className="min-w-0" />
                <Select value={editNsmItemUnit} onValueChange={setEditNsmItemUnit}>
                  <SelectTrigger className="w-full min-w-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="גרם">גרם</SelectItem>
                    <SelectItem value={'ק"ג'}>ק&quot;ג</SelectItem>
                    <SelectItem value="מל">מל</SelectItem>
                    <SelectItem value="ליטר">ליטר</SelectItem>
                    <SelectItem value="יחידה">יחידה</SelectItem>
                    <SelectItem value="חבילה">חבילה</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={editNsmItemWaste} onChange={(e) => setEditNsmItemWaste(e.target.value)} type="number" placeholder="פחת %" min={0} max={100} step={0.1} className="min-w-0" />
                <Input value={editNsmItemStock} onChange={(e) => setEditNsmItemStock(e.target.value)} type="number" placeholder="מלאי" min={0} className="min-w-0" />
                <Input value={editNsmItemMinStock} onChange={(e) => setEditNsmItemMinStock(e.target.value)} type="number" placeholder="מינ׳ מלאי" min={0} className="min-w-0" />
                <Input value={editNsmItemSku} onChange={(e) => setEditNsmItemSku(e.target.value)} placeholder="מק״ט" className="min-w-0" />
                <Button size="sm" onClick={addEditNsmItem} className="sm:col-span-2">➕ הוסף</Button>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditSupplierOpen(false)}>ביטול</Button>
            <Button onClick={handleSaveEditSupplier} disabled={editSupplierSaving || editNsmItems.length === 0}>
              {editSupplierSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
              💾 שמור ועדכן מסעדות
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editSupplierDetailsOpen} onOpenChange={setEditSupplierDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>עריכת פרטי ספק</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {editSupplierDetailsName && `ספק: ${editSupplierDetailsName}`}
            </p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>טלפון</Label>
              <Input
                value={editSupplierDetailsPhone}
                onChange={(e) => setEditSupplierDetailsPhone(e.target.value)}
                placeholder="מספר טלפון"
              />
            </div>
            <div className="space-y-2">
              <Label>אימייל</Label>
              <Input
                type="email"
                value={editSupplierDetailsEmail}
                onChange={(e) => setEditSupplierDetailsEmail(e.target.value)}
                placeholder="דוא״ל"
              />
            </div>
            <div className="space-y-2">
              <Label>איש קשר</Label>
              <Input
                value={editSupplierDetailsContact}
                onChange={(e) => setEditSupplierDetailsContact(e.target.value)}
                placeholder="שם איש קשר"
              />
            </div>
            <div className="space-y-2">
              <Label>כתובת</Label>
              <Input
                value={editSupplierDetailsAddress}
                onChange={(e) => setEditSupplierDetailsAddress(e.target.value)}
                placeholder="כתובת"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSupplierDetailsOpen(false)}>ביטול</Button>
            <Button onClick={handleSaveEditSupplierDetails} disabled={editSupplierDetailsSaving}>
              {editSupplierDetailsSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
              שמור
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
                מפתח Claude API
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                מפתח זה נשמר ב-Firestore ומשמש לניתוח קבצים (מחירונים, תפריטים, חשבוניות) ובדיקת מחירים באינטרנט באמצעות AI.
              </p>
              <p className="text-xs text-muted-foreground">
                איפה נרשמים:{" "}
                <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Anthropic (Claude)
                </a>
                {" "}•{" "}
                <a href="https://serper.dev/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Serper
                </a>
                {" "}(חיפוש באינטרנט — לפריסה בשרת)
              </p>
              {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  טוען...
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="claude-api-key">מפתח</Label>
                  <Input
                    id="claude-api-key"
                    name="claudeApiKey"
                    type="password"
                    placeholder={apiKey ? "מפתח מוגדר — הזן להחלפה" : "sk-ant-..."}
                    className="font-mono"
                    autoComplete="off"
                  />
                  <div className="flex flex-wrap gap-2 items-center">
                    <Button onClick={handleSaveKey} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                      שמור
                    </Button>
                    {apiKey && (
                      <>
                        <Button variant="outline" onClick={handleTestApi} disabled={testingApi}>
                          {testingApi ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                          בדוק חיבור
                        </Button>
                        <Button variant="outline" onClick={handleClearKey} disabled={saving}>
                          הסר מפתח
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
                  צור קוד הזמנה למנהל
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {currentRestaurantId && isSystemOwner
                    ? "קוד זה ישייך את המנהל למסעדה הנבחרת. העבר את הקוד למנהל — הוא יירשם ויקבל גישה."
                    : "קוד זה יאפשר למנהל להקים מסעדה חדשה. העבר את הקוד — הוא יירשם ויקים מסעדה."}
                </p>
                <div className="flex gap-2 items-center">
                  <Button onClick={handleCreateManagerCode} disabled={generatingCode}>
                    {generatingCode ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Copy className="w-4 h-4 ml-1" />}
                    צור קוד
                  </Button>
                  {lastGeneratedCode && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted font-mono text-sm">
                      {lastGeneratedCode}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(lastGeneratedCode!)
                          toast.success("הקוד הועתק")
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

          {canAddUsers && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5" />
                  הוסף משתמש למסעדה
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  הזמן משתמשים — הם יוכלו להירשם ולקבל גישה למסעדה. תוכל להגדיר מה כל משתמש רואה.
                </p>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="אימייל המשתמש"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={handleInviteUser} disabled={inviting}>
                    {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4 ml-1" />}
                    הזמן
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
                  משתמשי המסעדה
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  הגדר הרשאות לכל משתמש — מה הוא יכול לראות במערכת.
                </p>
                {loadingUsers ? (
                  <div className="flex gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    טוען משתמשים...
                  </div>
                ) : restaurantUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">אין עדיין משתמשים במסעדה זו.</p>
                ) : (
                  <div className="space-y-4">
                    {restaurantUsers
                      .filter((u) => u.role === "user")
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
                                title="סגור"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingPermissions(u.uid)}
                              >
                                הרשאות
                              </Button>
                            )}
                          </div>
                          {editingPermissions === u.uid && (
                            <div className="flex flex-col gap-2 pt-2 border-t">
                              <p className="text-xs text-muted-foreground mb-1">מה המשתמש רואה בתפריט:</p>
                              {[
                                { key: "canSeeDashboard" as const, label: "לוח בקרה" },
                                { key: "canSeeProductTree" as const, label: "עץ מוצר" },
                                { key: "canSeeIngredients" as const, label: "רכיבים" },
                                { key: "canSeeInventory" as const, label: "מלאי" },
                                { key: "canSeeSuppliers" as const, label: "ספקים" },
                                { key: "canSeePurchaseOrders" as const, label: "הזמנות ספקים" },
                                { key: "canSeeUpload" as const, label: "העלאה" },
                                { key: "canSeeReports" as const, label: "דוחות" },
                                { key: "canSeeCosts" as const, label: "עלויות תפריט" },
                                { key: "canSeeSettings" as const, label: "הגדרות" },
                              ].map(({ key, label }) => (
                                <div key={key} className="flex items-center justify-between">
                                  <Label className="text-sm">{label}</Label>
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
                    {restaurantUsers.filter((u) => u.role === "user").length === 0 && restaurantUsers.length > 0 && (
                      <p className="text-sm text-muted-foreground">אין משתמשים עם הרשאות להגדרה (רק מנהלים).</p>
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
