"use client"

import { httpsCallable } from "firebase/functions"
import { getFirebaseFunctions } from "@/lib/firebase"

/**
 * מוחק משתמש ב-Firebase Auth כשאין מסמך users/{uid} (יתום אחרי מחיקה מהמערכת).
 * דורש Cloud Function `deleteOrphanAuthUser` בפרויקט.
 */
export async function deleteOrphanAuthUserIfAllowed(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed) return { ok: false, error: "אימייל ריק" }
  try {
    const fn = httpsCallable(getFirebaseFunctions(), "deleteOrphanAuthUser")
    await fn({ email: trimmed })
    return { ok: true }
  } catch (e: unknown) {
    const fe = e as { code?: string; message?: string }
    const msg = typeof fe.message === "string" && fe.message.length > 0 ? fe.message : "שגיאה בשחרור האימייל"
    if (fe.code === "functions/not-found") {
      return {
        ok: false,
        error: "הפונקציה לא זמינה בשרת — אריץ: firebase deploy --only functions",
      }
    }
    return { ok: false, error: msg }
  }
}
