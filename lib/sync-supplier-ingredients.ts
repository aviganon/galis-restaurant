/**
 * Syncs global ingredient updates to restaurants that have the supplier assigned.
 * Call this whenever the owner updates/adds ingredients in the global catalog.
 */
import { db } from "@/lib/firebase"
import { collection, getDocs, getDoc, doc, writeBatch } from "firebase/firestore"

export type IngredientPayload = {
  name: string
  price: number
  unit: string
  supplier: string
  waste?: number
  sku?: string
  category?: string
  qty?: number
}

/**
 * Sync ingredients to all restaurants that have the given supplier assigned.
 * Preserves stock/minStock in restaurants (merge).
 */
export async function syncSupplierIngredientsToAssignedRestaurants(
  supplierName: string,
  ingredients: IngredientPayload[]
): Promise<number> {
  if (!supplierName || ingredients.length === 0) return 0

  const restsSnap = await getDocs(collection(db, "restaurants"))
  const assignedRestIds: string[] = []

  for (const r of restsSnap.docs) {
    const asDoc = await getDoc(doc(db, "restaurants", r.id, "appState", "assignedSuppliers"))
    const list: string[] = Array.isArray(asDoc.data()?.list) ? asDoc.data()!.list : []
    if (list.includes(supplierName)) assignedRestIds.push(r.id)
  }

  if (assignedRestIds.length === 0) return 0

  const now = new Date().toISOString()
  let totalUpdated = 0

  for (const restId of assignedRestIds) {
    const batch = writeBatch(db)
    for (const item of ingredients) {
      const syncPayload: Record<string, unknown> = {
          price: item.price,
          unit: item.unit,
          waste: item.waste ?? 0,
          supplier: item.supplier,
          sku: item.sku ?? "",
          lastUpdated: now,
        }
        if (typeof item.qty === "number" && item.qty > 0) {
          syncPayload.stock = item.qty
        }
        batch.set(
          doc(db, "restaurants", restId, "ingredients", item.name),
          syncPayload,
          { merge: true }
        )
      totalUpdated++
    }
    await batch.commit()
  }

  return totalUpdated
}
