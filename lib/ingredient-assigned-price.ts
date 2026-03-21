import { collectionGroup, getDocs, type Firestore } from "firebase/firestore"

/** תצוגת מסמך מ-query (תואם snapshot.docs) */
type PriceQueryDoc = {
  ref: { parent: { parent: { id: string } | null } | null }
  data: () => unknown
}

/** נתוני מסמך ראשי ב-ingredients/{שם} */
export type IngredientMainLike = { price?: number; unit?: string; supplier?: string }

/** שורה מתת-אוסף ingredients/{שם}/prices/{ספק} */
export type PriceSubEntry = { supplier: string; price: number; unit: string }

export function groupPriceSubdocsByIngredient(docs: readonly PriceQueryDoc[]): Map<string, PriceSubEntry[]> {
  const map = new Map<string, PriceSubEntry[]>()
  for (const pd of docs) {
    const parentIng = pd.ref.parent?.parent
    if (!parentIng) continue
    const ingId = parentIng.id
    const data = pd.data() as Record<string, unknown>
    const sup = typeof data.supplier === "string" ? data.supplier.trim() : ""
    const price = typeof data.price === "number" ? data.price : 0
    const unit = typeof data.unit === "string" && data.unit.trim() ? data.unit.trim() : "קג"
    if (!sup || price <= 0) continue
    const list = map.get(ingId) ?? []
    list.push({ supplier: sup, price, unit })
    map.set(ingId, list)
  }
  return map
}

/** טוען את כל תת-המסמכים prices — לקביעת מחיר לפי ספק */
export async function loadGlobalPriceSubdocsMap(db: Firestore): Promise<Map<string, PriceSubEntry[]>> {
  try {
    const snap = await getDocs(collectionGroup(db, "prices"))
    return groupPriceSubdocsByIngredient(snap.docs)
  } catch {
    return new Map()
  }
}

/**
 * רשימת assignedSuppliers.list היא לפי סדר הוספה: האיבר האחרון = הספק ששויך/נוצר לאחרונה.
 * בין כל הספקים המשויכים שיש להם מחיר לרכיב (תת-אוסף prices או מסמך ראשי) — בוחרים את המחיר של הספק עם האינדקס הגבוה ביותר ברשימה.
 */
export function pickGlobalIngredientRowFromAssigned(
  assignedList: string[],
  mainData: IngredientMainLike | undefined,
  subPrices: PriceSubEntry[] | undefined
): { price: number; unit: string; supplier: string } | null {
  if (!assignedList.length) return null
  const subs = subPrices ?? []
  const bySup = new Map<string, { price: number; unit: string; idx: number }>()
  for (const sp of subs) {
    const idx = assignedList.indexOf(sp.supplier)
    if (idx < 0) continue
    bySup.set(sp.supplier, { price: sp.price, unit: sp.unit, idx })
  }
  const mainSup = (mainData?.supplier && String(mainData.supplier).trim()) || ""
  const mainPrice = typeof mainData?.price === "number" ? mainData.price : 0
  const mainUnit =
    typeof mainData?.unit === "string" && mainData.unit.trim() ? mainData.unit.trim() : "קג"
  if (mainSup && assignedList.includes(mainSup) && mainPrice > 0 && !bySup.has(mainSup)) {
    bySup.set(mainSup, { price: mainPrice, unit: mainUnit, idx: assignedList.indexOf(mainSup) })
  }
  if (bySup.size === 0) return null
  let bestSup = ""
  let bestIdx = -1
  let bestPrice = 0
  let bestUnit = "קג"
  for (const [sup, v] of bySup) {
    if (v.idx > bestIdx) {
      bestIdx = v.idx
      bestSup = sup
      bestPrice = v.price
      bestUnit = v.unit
    }
  }
  return { price: bestPrice, unit: bestUnit, supplier: bestSup }
}
