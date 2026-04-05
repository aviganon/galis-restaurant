/**
 * מצב זמני לפני/אחרי signInWithRedirect — sessionStorage + localStorage (גיבוי Safari).
 */

export const GOOGLE_AUTH_INTENT_KEY = "google-auth-intent"
export const GOOGLE_REGISTER_DRAFT_KEY = "google-register-draft"

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
