import type { Firestore } from "firebase-admin/firestore"

/**
 * פרוקסי Claude — רק משתמש עם מסעדה (צוות) או בעל מערכת / אדמין מערכת.
 */
export async function assertClaudeProxyAllowed(
  db: Firestore,
  uid: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const snap = await db.collection("users").doc(uid).get()
  if (!snap.exists) {
    return { ok: false, status: 403, message: "משתמש לא נמצא" }
  }
  const d = snap.data() as { isSystemOwner?: boolean; restaurantId?: string | null }
  if (d.isSystemOwner === true) return { ok: true }
  if (d.restaurantId != null && String(d.restaurantId).trim() !== "") {
    return { ok: true }
  }
  return { ok: false, status: 403, message: "אין הרשאה לשימוש ב־AI — נדרשת שיוך למסעדה" }
}
