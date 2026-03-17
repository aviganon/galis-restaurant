"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { collection, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Search,
  Plus,
  ChefHat,
  DollarSign,
  Scale,
  MoreVertical,
  Edit,
  Loader2,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/use-translations"

const CATEGORY_KEYS = ["all", "starters", "mainDishes", "desserts", "drinks", "sides", "salads", "other"] as const
const CATEGORY_TO_HE: Record<string, string> = {
  all: "הכל",
  starters: "ראשונות",
  mainDishes: "עיקריות",
  desserts: "קינוחים",
  drinks: "משקאות",
  sides: "תוספות",
  salads: "סלטים",
  other: "אחר",
}

interface Recipe {
  id: string
  name: string
  category: string
  cost: number
  price: number
  margin: number
  ingredients: number
}

const isOwnerRole = (role: string, isSystemOwner?: boolean) => isSystemOwner || role === "owner"

export function Recipes() {
  const t = useTranslations()
  const { currentRestaurantId, setCurrentPage, userRole, isSystemOwner } = useApp()
  const isOwner = isOwnerRole(userRole, isSystemOwner)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")

  useEffect(() => {
    if (!currentRestaurantId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const load = async () => {
      try {
        const [recSnap, restIngSnap, asDoc] = await Promise.all([
          getDocs(collection(db, "restaurants", currentRestaurantId, "recipes")),
          getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients")),
          getDoc(doc(db, "restaurants", currentRestaurantId, "appState", "assignedSuppliers")),
        ])
        const assignedList: string[] = Array.isArray(asDoc.data()?.list) ? asDoc.data()!.list : []
        const globalIngSnap = isOwner ? await getDocs(collection(db, "ingredients")) : null
        const prices: Record<string, number> = {}
        restIngSnap.forEach((d) => {
          const data = d.data()
          prices[d.id] = typeof data.price === "number" ? data.price : 0
        })
        globalIngSnap?.forEach((d) => {
          if (!(d.id in prices)) {
            const data = d.data()
            const sup = (data.supplier as string) || ""
            if (!sup) return
            if (!assignedList.includes(sup)) return
            prices[d.id] = typeof data.price === "number" ? data.price : 0
          }
        })

        const list: Recipe[] = []
        recSnap.docs.forEach((r) => {
          const data = r.data()
          if (data.isCompound) return
          const sellingPrice = typeof data.sellingPrice === "number" ? data.sellingPrice : 0
          const ing = Array.isArray(data.ingredients) ? data.ingredients : []
          let cost = 0
          ing.forEach((i: { name?: string; qty?: number; waste?: number; unit?: string }) => {
            const p = prices[i.name || ""] ?? 0
            let mult = 1
            if (i.unit === "גרם") mult = 0.001
            else if (i.unit === "מל") mult = 0.001
            cost += (i.qty || 0) * p * mult * (1 + (i.waste || 0) / 100)
          })
          const margin = sellingPrice > 0 ? ((sellingPrice - cost) / sellingPrice) * 100 : 0
          list.push({
            id: r.id,
            name: r.id,
            category: (data.category as string) || "עיקריות",
            cost,
            price: sellingPrice,
            margin,
            ingredients: ing.length,
          })
        })
        setRecipes(list)
      } catch (e) {
        console.error("load recipes:", e)
        toast.error("שגיאה בטעינת מתכונים")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentRestaurantId, isOwner])

  const filteredRecipes = recipes.filter((recipe) => {
    const matchesSearch = recipe.name.includes(searchQuery)
    const heCategory = CATEGORY_TO_HE[selectedCategory] ?? selectedCategory
    const matchesCategory = selectedCategory === "all" || recipe.category === heCategory
    return matchesSearch && matchesCategory
  })

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
        <h1 className="text-2xl font-bold mb-1">{t("nav.recipes")}</h1>
        <p className="text-muted-foreground">{t("pages.recipes.selectRestaurant")}</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1">מתכונים</h1>
          <p className="text-muted-foreground">ניהול המנות והמתכונים שלך</p>
        </div>
        <Button className="rounded-xl" onClick={() => setCurrentPage?.("calc")}>
          <Plus className="w-4 h-4 ml-2" />
          {t("pages.recipes.newRecipeProductTree")}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("pages.recipes.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10 h-11 rounded-xl"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
          {CATEGORY_KEYS.map((key, i) => (
            <Button
              key={key}
              variant={selectedCategory === key ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(key)}
              className="rounded-full whitespace-nowrap"
            >
              {t(`pages.productTree.${key}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredRecipes.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <ChefHat className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground">{t("pages.recipes.noRecipes")}. {t("pages.recipes.addInProductTree")}</p>
          </div>
        ) : (
          filteredRecipes.map((recipe) => (
            <Card key={recipe.id} className="border-0 shadow-sm hover:shadow-md transition-shadow group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <ChefHat className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">{recipe.name}</CardTitle>
                      <Badge variant="secondary" className="text-xs mt-1">
                        {recipe.category}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setCurrentPage?.("calc")}>
                        <Edit className="w-4 h-4 ml-2" />
                        {t("pages.recipes.editProductTree")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{t("pages.recipes.cost")}:</span>
                    <span className="font-medium">₪{recipe.cost.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Scale className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{t("pages.recipes.margin")}:</span>
                    <span
                      className={cn(
                        "font-medium",
                        recipe.margin >= 70 ? "text-green-600" : recipe.margin >= 60 ? "text-amber-600" : "text-red-600"
                      )}
                    >
                      {recipe.margin.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground col-span-2">
                    {recipe.ingredients} {t("pages.recipes.ingredients")}
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t flex items-center justify-between">
                  <span className="text-lg font-bold">₪{recipe.price.toFixed(0)}</span>
                  <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setCurrentPage?.("calc")}>
                    {t("pages.recipes.details")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
