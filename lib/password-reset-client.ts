/**
 * איפוס סיסמה: מנסה API (Firebase Admin + Resend); אם אין הגדרה — sendPasswordResetEmail מהלקוח.
 */
import { sendPasswordResetEmail } from "firebase/auth"
import { auth } from "@/lib/firebase"

function actionCodeSettings() {
  return {
    url: typeof window !== "undefined" ? `${window.location.origin}/` : "/",
    handleCodeInApp: false as const,
  }
}

export type PasswordResetResult =
  | { ok: true; via: "resend" | "firebase" }
  | { ok: false; error: string }

export async function sendPasswordResetReliable(email: string): Promise<PasswordResetResult> {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed) {
    return { ok: false, error: "חסר אימייל" }
  }

  try {
    const res = await fetch("/api/auth/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmed }),
    })
    const data = (await res.json()) as { error?: string; fallback?: boolean; ok?: boolean }

    if (res.ok && data.ok) {
      return { ok: true, via: "resend" }
    }

    if (res.status === 503 && data.fallback) {
      auth.languageCode = "he"
      await sendPasswordResetEmail(auth, trimmed, actionCodeSettings())
      return { ok: true, via: "firebase" }
    }

    if (res.status === 404 && data.error) {
      return { ok: false, error: data.error }
    }

    return { ok: false, error: data.error || "שגיאה בשליחת אימייל" }
  } catch (e) {
    console.warn("[password-reset] fetch failed, trying client SDK:", e)
    try {
      auth.languageCode = "he"
      await sendPasswordResetEmail(auth, trimmed, actionCodeSettings())
      return { ok: true, via: "firebase" }
    } catch (e2) {
      const msg = e2 instanceof Error ? e2.message : "שגיאה"
      return { ok: false, error: msg }
    }
  }
}
