"use client"

import { useState, useEffect } from "react"
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

const categories = ["הכל", "ראשונות", "עיקריות", "קינוחים", "משקאות", "תוספות", "סלטים", "אחר"]

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
  const { currentRestaurantId, setCurrentPage, userRole, isSystemOwner } = useApp()
  const isOwner = isOwnerRole(userRole, isSystemOwner)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("הכל")

  useEffect(() => {
    if (!currentRestaurantId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const load = async () => {
      try {
        const [recSnap, restIngSnap] = await Promise.all([
          getDocs(collection(db, "restaurants", currentRestaurantId, "recipes")),
          getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients")),
        ])
        const globalIngSnap = isOwner ? await getDocs(collection(db, "ingredients")) : null
        const prices: Record<string, number> = {}
        restIngSnap.forEach((d) => {
          const data = d.data()
          prices[d.id] = typeof data.price === "number" ? data.price : 0
        })
        globalIngSnap?.forEach((d) => {
          if (!(d.id in prices)) {
            const data = d.data()
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
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentRestaurantId, isOwner])

  const filteredRecipes = recipes.filter((recipe) => {
    const matchesSearch = recipe.name.includes(searchQuery)
    const matchesCategory = selectedCategory === "הכל" || recipe.category === selectedCategory
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
        <h1 className="text-2xl font-bold mb-1">מתכונים</h1>
        <p className="text-muted-foreground">בחר מסעדה</p>
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
          מתכון חדש (עץ מוצר)
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="חיפוש מתכון..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10 h-11 rounded-xl"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
              className="rounded-full whitespace-nowrap"
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredRecipes.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <ChefHat className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground">אין מתכונים. הוסף בעץ מוצר.</p>
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
                        עריכה (עץ מוצר)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">עלות:</span>
                    <span className="font-medium">₪{recipe.cost.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Scale className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">מרווח:</span>
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
                    {recipe.ingredients} רכיבים
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t flex items-center justify-between">
                  <span className="text-lg font-bold">₪{recipe.price.toFixed(0)}</span>
                  <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setCurrentPage?.("calc")}>
                    פרטים
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
