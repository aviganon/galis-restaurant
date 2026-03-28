import { addDoc, collection, type Firestore } from "firebase/firestore"

export type RestaurantAuditPayload = {
  action: string
  summary: string
  meta?: Record<string, unknown>
  actorUid?: string | null
  actorEmail?: string | null
}

/** יומן פעולות למסעדה — restaurants/{restaurantId}/auditLog */
export async function appendRestaurantAuditLog(
  db: Firestore,
  restaurantId: string,
  payload: RestaurantAuditPayload
): Promise<void> {
  try {
    await addDoc(collection(db, "restaurants", restaurantId, "auditLog"), {
      action: payload.action,
      summary: payload.summary,
      meta: payload.meta ?? null,
      actorUid: payload.actorUid ?? null,
      actorEmail: payload.actorEmail ?? null,
      createdAt: new Date().toISOString(),
    })
  } catch (e) {
    console.error("[appendRestaurantAuditLog]", e)
  }
}

export type IngredientPriceHistoryPayload = {
  ingredientId: string
  ingredientName: string
  oldPrice: number
  newPrice: number
  unit: string
  actorEmail?: string | null
}

/** היסטוריית שינויי מחיר — restaurants/{restaurantId}/ingredientPriceHistory */
export async function appendIngredientPriceHistory(
  db: Firestore,
  restaurantId: string,
  payload: IngredientPriceHistoryPayload
): Promise<void> {
  try {
    await addDoc(collection(db, "restaurants", restaurantId, "ingredientPriceHistory"), {
      ingredientId: payload.ingredientId,
      ingredientName: payload.ingredientName,
      oldPrice: payload.oldPrice,
      newPrice: payload.newPrice,
      unit: payload.unit,
      actorEmail: payload.actorEmail ?? null,
      at: new Date().toISOString(),
    })
  } catch (e) {
    console.error("[appendIngredientPriceHistory]", e)
  }
}

export type OperationalTaskInput = {
  title: string
  notes?: string
  dueAt?: string | null
  createdByUid?: string | null
  createdByEmail?: string | null
}

/** משימת תפעול — restaurants/{restaurantId}/operationalTasks */
export async function createOperationalTask(
  db: Firestore,
  restaurantId: string,
  input: OperationalTaskInput
): Promise<void> {
  const now = new Date().toISOString()
  await addDoc(collection(db, "restaurants", restaurantId, "operationalTasks"), {
    title: input.title.trim(),
    notes: (input.notes ?? "").trim(),
    dueAt: input.dueAt?.trim() || null,
    done: false,
    createdAt: now,
    updatedAt: now,
    createdByUid: input.createdByUid ?? null,
    createdByEmail: input.createdByEmail ?? null,
  })
}
