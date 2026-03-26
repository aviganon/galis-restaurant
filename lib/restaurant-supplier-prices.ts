import { doc, setDoc, type Firestore } from "firebase/firestore"
import { supplierFirestoreDocId } from "@/lib/supplier-firestore-id"

export async function upsertRestaurantSupplierPrice(params: {
  db: Firestore
  restaurantId: string
  ingredientName: string
  supplier: string
  price: number
  unit: string
  lastUpdated?: string
}) {
  const supplier = params.supplier.trim()
  const ingredientName = params.ingredientName.trim()
  if (!supplier || !ingredientName || params.price <= 0) return
  const priceId = supplierFirestoreDocId(supplier)
  const now = params.lastUpdated || new Date().toISOString()
  await setDoc(
    doc(params.db, "restaurants", params.restaurantId, "ingredients", ingredientName, "prices", priceId),
    {
      supplier,
      price: params.price,
      unit: params.unit || "קג",
      ingredientName,
      restaurantId: params.restaurantId,
      lastUpdated: now,
    },
    { merge: true },
  )
}

