/**
 * קריאה כפולה ל-getRedirectResult (React Strict Mode / מרוצים) עלולה להחזיר null בקריאה השנייה.
 * מבטיחים קריאה אחת ל-Firebase לכל טעינת דף.
 */
import { getRedirectResult, type Auth, type UserCredential } from "firebase/auth"

let redirectResultPromise: Promise<UserCredential | null> | null = null

export function getGoogleRedirectResultOnce(auth: Auth): Promise<UserCredential | null> {
  if (!redirectResultPromise) {
    redirectResultPromise = getRedirectResult(auth)
  }
  return redirectResultPromise
}
