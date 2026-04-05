/**
 * קריאה כפולה ל-getRedirectResult (React Strict Mode / מרוצים) עלולה להחזיר null בקריאה השנייה.
 * מבטיחים קריאה אחת ל-Firebase לכל טעינת דף.
 *
 * Safari/ITP: לפעמים auth.currentUser מתמלא רק אחרי עיכוב קצר אחרי redirect — ראו waitForRedirectAuthUser.
 */
import { getRedirectResult, type Auth, type User, type UserCredential } from "firebase/auth"

let redirectResultPromise: Promise<UserCredential | null> | null = null

export function getGoogleRedirectResultOnce(auth: Auth): Promise<UserCredential | null> {
  if (!redirectResultPromise) {
    redirectResultPromise = getRedirectResult(auth)
  }
  return redirectResultPromise
}

/** המתנה מקסימלית ~maxWaitMs ל־currentUser אחרי redirect (רק כשיש intent — קוראים מ־page / LoginScreen). */
export async function waitForRedirectAuthUser(
  auth: Auth,
  options?: { maxWaitMs?: number; stepMs?: number },
): Promise<User | null> {
  const maxWaitMs = options?.maxWaitMs ?? 2800
  const stepMs = options?.stepMs ?? 120
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    if (auth.currentUser) return auth.currentUser
    await new Promise((r) => setTimeout(r, stepMs))
  }
  return auth.currentUser
}
