import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { firestoreConfig } from "@/lib/firestore-config"

const { inviteCodesCollection, inviteCodeFields } = firestoreConfig

/** קוד בן 6 תווים (אותיות/מספרים) */
export function generateInviteCodeToken(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

/**
 * יוצר מסמך `inviteCodes/{code}` — תואם לבדיקות במסך ההרשמה (נדרש `type: "manager"` לזרימת הרשמה עם מסעדה).
 */
export async function saveInviteCodeDocument(params: {
  code: string
  restaurantId: string | null
  /** manager → type manager; user → type user (הרשמה דרך קוד במסך הכניסה כרגע תומכת ב־manager בלבד) */
  role: "manager" | "user"
}): Promise<void> {
  const type = params.role === "manager" ? "manager" : "user"
  await setDoc(doc(db, inviteCodesCollection, params.code), {
    [inviteCodeFields.createdAt]: new Date().toISOString(),
    [inviteCodeFields.used]: false,
    [inviteCodeFields.restaurantId]: params.restaurantId,
    [inviteCodeFields.type]: type,
  })
}

/** מנסה עד מספר ניסיונות למצוא קוד שלא קיים ב־Firestore */
export async function createUniqueInviteCode(params: {
  restaurantId: string | null
  role: "manager" | "user"
}): Promise<string> {
  const maxAttempts = 12
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateInviteCodeToken()
    const ref = doc(db, inviteCodesCollection, code)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await saveInviteCodeDocument({ code, restaurantId: params.restaurantId, role: params.role })
      return code
    }
  }
  throw new Error("לא ניתן ליצור קוד הזמנה ייחודי — נסה שוב")
}
