/**
 * הגדרת סיסמה למשתמש אחר (בעל מערכת / מנהל באותה מסעדה) דרך API + Firebase Admin.
 */
import { auth } from "@/lib/firebase"

export async function setUserPasswordAsAdmin(
  targetUid: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = auth.currentUser
  if (!user) {
    return { ok: false, error: "יש להתחבר" }
  }
  const token = await user.getIdToken()
  const res = await fetch("/api/auth/set-user-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ targetUid, newPassword }),
  })
  const data = (await res.json()) as { error?: string; ok?: boolean }
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error || "שגיאה בעדכון הסיסמה" }
  }
  return { ok: true }
}
