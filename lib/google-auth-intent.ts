/**
 * מצב זמני לפני/אחרי signInWithRedirect — sessionStorage + localStorage (גיבוי Safari).
 */

export const GOOGLE_AUTH_INTENT_KEY = "google-auth-intent"
export const GOOGLE_REGISTER_DRAFT_KEY = "google-register-draft"
/** נשמר לפני redirect ב־iOS — אחרי חזרה מוצגת הודעת PWA אם עדיין במסך כניסה */
export const GOOGLE_IOS_PWA_TIP_KEY = "google-ios-pwa-tip"
/** מונע כפל הצגה ב־React Strict Mode (אפקט כפול באותה טעינה) */
const GOOGLE_IOS_TIP_SHOWN_SESSION_KEY = "google-ios-pwa-tip-shown-session"

export function setGoogleIosPwaTipPending(): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(GOOGLE_IOS_PWA_TIP_KEY, "1")
    sessionStorage.removeItem(GOOGLE_IOS_TIP_SHOWN_SESSION_KEY)
  } catch {
    /* */
  }
}

export function clearGoogleIosPwaTipFlag(): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.removeItem(GOOGLE_IOS_PWA_TIP_KEY)
    sessionStorage.removeItem(GOOGLE_IOS_TIP_SHOWN_SESSION_KEY)
  } catch {
    /* */
  }
}

/** קוראים מ־LoginScreen: אם מגיעים אחרי redirect iOS ועדיין במסך כניסה */
export function shouldShowGoogleIosPwaTipAfterRedirect(): boolean {
  if (typeof window === "undefined") return false
  try {
    if (sessionStorage.getItem(GOOGLE_IOS_PWA_TIP_KEY) !== "1") return false
    if (sessionStorage.getItem(GOOGLE_IOS_TIP_SHOWN_SESSION_KEY) === "1") return false
    sessionStorage.setItem(GOOGLE_IOS_TIP_SHOWN_SESSION_KEY, "1")
    sessionStorage.removeItem(GOOGLE_IOS_PWA_TIP_KEY)
    return true
  } catch {
    return false
  }
}

export function saveGoogleAuthDraft(intent: "login" | "register", draft?: { code: string; name: string; br: string }) {
  if (typeof window === "undefined") return
  sessionStorage.setItem(GOOGLE_AUTH_INTENT_KEY, intent)
  localStorage.setItem(GOOGLE_AUTH_INTENT_KEY, intent)
  if (draft) {
    const raw = JSON.stringify(draft)
    sessionStorage.setItem(GOOGLE_REGISTER_DRAFT_KEY, raw)
    localStorage.setItem(GOOGLE_REGISTER_DRAFT_KEY, raw)
  }
}

export function clearGoogleAuthDraft() {
  if (typeof window === "undefined") return
  sessionStorage.removeItem(GOOGLE_AUTH_INTENT_KEY)
  localStorage.removeItem(GOOGLE_AUTH_INTENT_KEY)
  sessionStorage.removeItem(GOOGLE_REGISTER_DRAFT_KEY)
  localStorage.removeItem(GOOGLE_REGISTER_DRAFT_KEY)
}

export function readGoogleAuthIntent(): "login" | "register" | null {
  if (typeof window === "undefined") return null
  const v = sessionStorage.getItem(GOOGLE_AUTH_INTENT_KEY) || localStorage.getItem(GOOGLE_AUTH_INTENT_KEY)
  return v === "login" || v === "register" ? v : null
}

export function readGoogleRegisterDraft(): { code: string; name: string; br: string } {
  if (typeof window === "undefined") return { code: "", name: "", br: "" }
  const raw =
    sessionStorage.getItem(GOOGLE_REGISTER_DRAFT_KEY) || localStorage.getItem(GOOGLE_REGISTER_DRAFT_KEY) || ""
  try {
    const parsed = JSON.parse(raw) as { code?: string; name?: string; br?: string }
    return {
      code: (parsed.code || "").trim().toUpperCase().replace(/\s/g, ""),
      name: (parsed.name || "").trim(),
      br: (parsed.br || "").trim(),
    }
  } catch {
    return { code: "", name: "", br: "" }
  }
}

export function hasGoogleAuthRedirectIntent(): boolean {
  return readGoogleAuthIntent() !== null
}
