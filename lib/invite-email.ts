import { firebaseBearerHeaders } from "@/lib/api-auth-client"

/** קריאה ל־/api/invite — שימוש אחרי יצירת משתמש או הזמנה ידנית */
export async function postInviteEmail(payload: {
  email: string
  restaurantName?: string | null
  role?: string
  /** true כשנוצר חשבון Auth + מסמך users — המייל מסביר התחברות ולא הרשמה */
  accountCreated?: boolean
  /** קישור לאימות כתובת המייל (Email Verification) — נשלח רק אם הצלחנו לייצר אותו */
  emailVerificationLink?: string | null
  /** קוד הזמנה שנוצר ב־Firestore (אוטומטי אחרי יצירת משתמש) */
  inviteCode?: string | null
  /** מנהל בלי מסעדה — המייל מסביר להתחבר ולהשלים הקמה עם הקוד */
  pendingRestaurantSetup?: boolean
  /**
   * כפתור «הזמנה»: אם ב-Auth יש משתמש עם סיסמה והמייל לא מאומת — השרת מצרף קישור אימות למייל.
   */
  attachVerificationIfPasswordUnverified?: boolean
  /**
   * מנהל בלי מסעדה (בעל מערכת): מייל «הזמנה» כולל שוב קוד הקמת מסעדה (או יוצר קוד אם חסר).
   */
  includeManagerRestaurantSetupIfEligible?: boolean
}): Promise<void> {
  const res = await fetch("/api/invite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await firebaseBearerHeaders()),
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || `שגיאה ${res.status}`)
  }
}
