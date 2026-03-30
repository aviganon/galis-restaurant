import type { Firestore } from "firebase-admin/firestore"
import type { DecodedIdToken } from "firebase-admin/auth"

/** גישה למסעדה: בעל מערכת / אדמין מערכת או משתמש עם אותו restaurantId */
export async function assertCallerRestaurantAccess(
  db: Firestore,
  decoded: DecodedIdToken,
  restaurantId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const snap = await db.collection("users").doc(decoded.uid).get()
  if (!snap.exists) return { ok: false, status: 403, error: "משתמש לא נמצא" }
  const d = snap.data() as { isSystemOwner?: boolean; restaurantId?: string | null }
  if (d.isSystemOwner === true) return { ok: true }
  if (d.restaurantId === restaurantId) return { ok: true }
  return { ok: false, status: 403, error: "אין גישה למסעדה" }
}
