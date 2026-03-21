import { collection, getDocs, getDoc, doc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { IngredientForSuggestion } from "@/lib/ai-extract"

/**
 * רכיבים זמינים להצעות AI — כמו לוגיקת מחירים בעלויות תפריט:
 * תחילה רכיבי המסעדה; אם owner — רכיבים גלובליים מספקים משויכים.
 */
export async function loadRestaurantPantryForAi(
  restaurantId: string,
  isOwner: boolean
): Promise<IngredientForSuggestion[]> {
  const [restIngSnap, asDoc] = await Promise.all([
    getDocs(collection(db, "restaurants", restaurantId, "ingredients")),
    getDoc(doc(db, "restaurants", restaurantId, "appState", "assignedSuppliers")),
  ])
  const assignedList: string[] = Array.isArray(asDoc.data()?.list) ? asDoc.data()!.list : []
  const byId = new Map<string, IngredientForSuggestion>()

  restIngSnap.forEach((d) => {
    const data = d.data()
    const unit = (data.unit as string) || "גרם"
    const price = typeof data.price === "number" ? data.price : 0
    const stock = typeof data.stock === "number" ? data.stock : undefined
    const supplier = (data.supplier as string) || undefined
    byId.set(d.id, { name: d.id, price, unit, supplier, stock })
  })

  if (isOwner) {
    const globalSnap = await getDocs(collection(db, "ingredients"))
    globalSnap.forEach((d) => {
      if (byId.has(d.id)) return
      const data = d.data()
      const sup = (data.supplier as string) || ""
      if (!sup || !assignedList.includes(sup)) return
      const unit = (data.unit as string) || "גרם"
      const price = typeof data.price === "number" ? data.price : 0
      const stock = typeof data.stock === "number" ? data.stock : undefined
      byId.set(d.id, { name: d.id, price, unit, supplier: sup, stock })
    })
  }

  return Array.from(byId.values())
}
