/**
 * לוגיקת שמירה משותפת לחשבונית ספק ודוח מכירות (מסך העלאה + עץ מוצר).
 */
import {
  writeBatch,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
} from "firebase/firestore"
import type { Firestore } from "firebase/firestore"
import { toast } from "sonner"
import { syncSupplierIngredientsToAssignedRestaurants } from "@/lib/sync-supplier-ingredients"
import { upsertRestaurantSupplierPrice } from "@/lib/restaurant-supplier-prices"
import type { ExtractedSupplierItem } from "@/lib/ai-extract"
import type { SalesReportPeriod } from "@/lib/ai-extract"
import { safeFirestoreRecipeId } from "@/lib/recipe-id"

const VAT_RATE = 1.17

export async function confirmSupplierInvoiceImport(params: {
  db: Firestore
  items: ExtractedSupplierItem[]
  supName: string
  saveToGlobal?: boolean
  isOwner: boolean
  currentRestaurantId: string | null
  refreshIngredients?: () => void
}): Promise<boolean> {
  const { db, items, supName, saveToGlobal: stg, isOwner, currentRestaurantId, refreshIngredients } = params
  const toGlobal = !!stg && isOwner
  if (!toGlobal && !currentRestaurantId) {
    toast.error("יש לבחור מסעדה לפני עדכון מחירי ספקים")
    return false
  }
  const restId = currentRestaurantId!
  const now = new Date().toISOString()

  if (!toGlobal && supName?.trim()) {
    const asRef = doc(db, "restaurants", restId, "appState", "assignedSuppliers")
    const asSnap = await getDoc(asRef)
    const currentList: string[] = Array.isArray(asSnap.data()?.list) ? asSnap.data()!.list : []
    const trimmed = supName.trim()
    if (!currentList.some((s) => (s || "").trim() === trimmed)) {
      await setDoc(asRef, { list: [...currentList, trimmed] }, { merge: true })
    }
  }

  let currentStocks: Record<string, number> = {}
  if (!toGlobal) {
    const restIngSnap = await getDocs(collection(db, "restaurants", restId, "ingredients"))
    restIngSnap.forEach((d) => {
      const data = d.data()
      currentStocks[d.id] = typeof data.stock === "number" ? data.stock : 0
    })
  }

  const batch = writeBatch(db)
  let count = 0
  items.forEach((item) => {
    if (!item.name?.trim()) return
    const isDeliveryNoteItem = item.price === 0 && typeof item.qty === "number" && item.qty > 0
    if (item.price <= 0 && !isDeliveryNoteItem) return
    const qty = typeof item.qty === "number" && item.qty > 0 ? item.qty : 0
    const payload: Record<string, unknown> = {
      price: item.price,
      unit: item.unit || "קג",
      supplier: supName,
      lastUpdated: now,
      createdBy: toGlobal ? "global" : "restaurant",
      waste: 0,
      sku: item.sku ?? "",
    }
    if (!toGlobal && qty > 0) {
      payload.stock = (currentStocks[item.name.trim()] ?? 0) + qty
    }
    if (toGlobal) {
      batch.set(doc(db, "ingredients", item.name.trim()), { ...payload }, { merge: true })
      const priceId = (supName || "").replace(/\//g, "_").replace(/\./g, "_").trim() || "default"
      batch.set(doc(db, "ingredients", item.name.trim(), "prices", priceId), {
        price: item.price,
        unit: item.unit || "קג",
        supplier: supName,
        lastUpdated: now,
      }, { merge: true })
    } else {
      batch.set(
        doc(db, "restaurants", restId, "ingredients", item.name.trim()),
        { ...payload },
        { merge: true }
      )
    }
    count++
  })
  if (count > 0) {
    await batch.commit()
    if (!toGlobal && supName?.trim()) {
      await Promise.all(
        items
          .filter((item) => item.name?.trim() && item.price > 0)
          .map((item) =>
            upsertRestaurantSupplierPrice({
              db,
              restaurantId: restId,
              ingredientName: item.name.trim(),
              supplier: supName.trim(),
              price: item.price,
              unit: item.unit || "קג",
              lastUpdated: now,
            }),
          ),
      )
    }
    if (toGlobal && supName?.trim()) {
      const toSync = items
        .filter((item) => item.name?.trim() && item.price > 0)
        .map((item) => ({
          name: item.name.trim(),
          price: item.price,
          unit: item.unit || "קג",
          supplier: supName.trim(),
        }))
      if (toSync.length > 0) {
        syncSupplierIngredientsToAssignedRestaurants(supName.trim(), toSync).catch((e) =>
          console.warn("sync to restaurants:", e)
        )
      }
    }
    const withStock = items.filter((i) => typeof i.qty === "number" && i.qty > 0).length
    toast.success(
      `${count} רכיבים עודכנו בהצלחה${withStock > 0 ? ` — מלאי עודכן ל־${withStock} רכיבים` : ""} — עלויות המנות יתעדכנו אוטומטית`
    )
    refreshIngredients?.()
    return true
  }
  toast.warning("אין רכיבים תקינים לשמירה (שם ריק או מחיר 0)")
  return false
}

export async function confirmSalesReportImport(params: {
  db: Firestore
  currentRestaurantId: string | null
  items: Array<{ name: string; qty: number; price: number }>
  meta?: {
    salesReportPeriod?: SalesReportPeriod
    salesReportDateFrom?: string
    salesReportDateTo?: string
  }
  refreshIngredients?: () => void
}): Promise<void> {
  const { db, currentRestaurantId, items, meta, refreshIngredients } = params
  if (!currentRestaurantId) {
    toast.error("יש לבחור מסעדה לפני שמירת דוח מכירות")
    return
  }
  const salesReportPeriod = meta?.salesReportPeriod
  const salesReportDateFrom = meta?.salesReportDateFrom ?? null
  const salesReportDateTo = meta?.salesReportDateTo ?? null
  try {
    const salesRef = doc(db, "restaurants", currentRestaurantId, "appState", `salesReport_${currentRestaurantId}`)
    const prevSnap = await getDoc(salesRef)
    const prevDaily =
      (prevSnap.data()?.dailySales as Record<string, { avg: number; trend?: number; total?: number }>) || {}
    const dailySales: Record<string, { avg: number; trend: number }> = {}
    Object.entries(prevDaily).forEach(([k, v]) => {
      dailySales[k] = {
        avg: typeof v?.avg === "number" ? v.avg : 0,
        trend: typeof v?.trend === "number" ? v.trend : 0,
      }
    })
    const priceUpdates: { recipeId: string; price: number }[] = []
    const importedRecipeIds = new Set<string>()
    items.forEach((it) => {
      const name = it.name?.trim()
      if (!name) return
      const recipeId = safeFirestoreRecipeId(name)
      importedRecipeIds.add(recipeId)
      const prev = dailySales[recipeId]
      const trend = typeof prev?.trend === "number" ? prev.trend : 0
      dailySales[recipeId] = { avg: it.qty || 0, trend }
      if (typeof it.price === "number" && it.price > 0) priceUpdates.push({ recipeId, price: it.price })
    })
    const nowIso = new Date().toISOString()
    await setDoc(
      salesRef,
      {
        dailySales,
        lastUpdated: nowIso,
        updatedAt: nowIso,
        ...(salesReportPeriod ? { salesReportPeriod } : {}),
        salesReportDateFrom,
        salesReportDateTo,
      },
      { merge: true }
    )
    if (priceUpdates.length > 0) {
      const batch = writeBatch(db)
      priceUpdates.forEach(({ recipeId, price }) => {
        batch.set(
          doc(db, "restaurants", currentRestaurantId, "recipes", recipeId),
          { sellingPrice: price * VAT_RATE, lastUpdated: new Date().toISOString() },
          { merge: true }
        )
      })
      await batch.commit()
    }

    const [recSnap, ingSnap] = await Promise.all([
      getDocs(collection(db, "restaurants", currentRestaurantId, "recipes")),
      getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients")),
    ])
    const recipesMap: Record<string, { ingredients: { name: string; qty: number; unit: string; isSubRecipe?: boolean }[]; yieldQty?: number }> = {}
    recSnap.forEach((d) => {
      const data = d.data()
      recipesMap[d.id] = {
        ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
        yieldQty: typeof data.yieldQty === "number" ? data.yieldQty : 1,
      }
    })
    const ingData: Record<string, { stock: number; unit: string }> = {}
    ingSnap.forEach((d) => {
      const data = d.data()
      ingData[d.id] = {
        stock: typeof data.stock === "number" ? data.stock : 0,
        unit: (data.unit as string) || "קג",
      }
    })

    const toDeduct: Record<string, number> = {}
    const toGrams = (qty: number, unit: string): number => {
      const u = (unit || "").toLowerCase()
      if (u === "גרם" || u === "ג") return qty
      if (u === "קג" || u === 'ק"ג') return qty * 1000
      if (u === "מל" || u === "מ\"ל") return qty
      if (u === "ליטר") return qty * 1000
      return qty
    }
    const fromGrams = (grams: number, unit: string): number => {
      const u = (unit || "").toLowerCase()
      if (u === "גרם" || u === "ג") return grams
      if (u === "קג" || u === 'ק"ג') return grams / 1000
      if (u === "מל" || u === "מ\"ל") return grams
      if (u === "ליטר") return grams / 1000
      return grams
    }
    const addUsage = (recipeName: string, mult: number) => {
      const rec = recipesMap[recipeName]
      if (!rec?.ingredients?.length) return
      const yieldQty = rec.yieldQty ?? 1
      rec.ingredients.forEach((ing) => {
        if (ing.isSubRecipe) addUsage(ing.name, ((ing.qty || 0) / yieldQty) * mult)
        else {
          const g = (toGrams(ing.qty || 0, ing.unit || "גרם") * mult) / yieldQty
          toDeduct[ing.name] = (toDeduct[ing.name] ?? 0) + g
        }
      })
    }
    importedRecipeIds.forEach((dishId) => {
      const sold = Math.round(dailySales[dishId]?.avg ?? 0) || 0
      if (sold > 0) addUsage(dishId, sold)
    })

    if (Object.keys(toDeduct).length > 0) {
      const stockBatch = writeBatch(db)
      Object.entries(toDeduct).forEach(([ingName, gramsUsed]) => {
        const ing = ingData[ingName]
        if (!ing) return
        const deduct = fromGrams(gramsUsed, ing.unit)
        const newStock = Math.max(0, ing.stock - deduct)
        stockBatch.set(
          doc(db, "restaurants", currentRestaurantId, "ingredients", ingName),
          { stock: newStock, lastUpdated: new Date().toISOString() },
          { merge: true }
        )
      })
      await stockBatch.commit()
    }

    const stockUpdated = Object.keys(toDeduct).length
    toast.success(
      `דוח מכירות נשמר — ${importedRecipeIds.size} שורות מהדוח${priceUpdates.length > 0 ? `, ${priceUpdates.length} מחירים עודכנו` : ""}${stockUpdated > 0 ? ` — מלאי עודכן (${stockUpdated} רכיבים)` : ""}`
    )
    refreshIngredients?.()
  } catch (e) {
    toast.error("שגיאה בשמירה: " + (e as Error).message)
  }
}
