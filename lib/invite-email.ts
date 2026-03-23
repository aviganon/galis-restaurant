/** קריאה ל־/api/invite — שימוש אחרי יצירת משתמש או הזמנה ידנית */
export async function postInviteEmail(payload: {
  email: string
  restaurantName?: string | null
  role?: string
  /** true כשנוצר חשבון Auth + מסמך users — המייל מסביר התחברות ולא הרשמה */
  accountCreated?: boolean
  /** קוד הזמנה שנוצר ב־Firestore (אוטומטי אחרי יצירת משתמש) */
  inviteCode?: string | null
}): Promise<void> {
  const res = await fetch("/api/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || `שגיאה ${res.status}`)
  }
}
