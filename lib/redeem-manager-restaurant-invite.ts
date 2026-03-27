import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { firestoreConfig } from "@/lib/firestore-config"

const { inviteCodesCollection, inviteCodeFields, restaurantsCollection, restaurantFields, usersCollection } =
  firestoreConfig

function normEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * מנהל שחשבון נוצר לו בלי מסעדה — מזין קוד הזמנה (עם allowedEmail אם הוגדר) ומקים מסעדה.
 */
export async function redeemManagerRestaurantInvite(options: {
  uid: string
  email: string | null
  codeRaw: string
  restaurantName: string
  branch: string
}): Promise<{ ok: true; restaurantId: string } | { ok: false; message: string }> {
  const code = options.codeRaw.trim().toUpperCase().replace(/\s/g, "")
  const name = options.restaurantName.trim()
  const br = options.branch.trim()
  if (!code) return { ok: false, message: "נא להזין קוד הזמנה" }
  if (!name) return { ok: false, message: "נא להזין שם מסעדה" }
  const userEmail = normEmail(options.email || "")
  if (!userEmail) return { ok: false, message: "לא נמצא אימייל בחשבון" }

  const codeRef = doc(db, inviteCodesCollection, code)
  const codeSnap = await getDoc(codeRef)
  if (!codeSnap.exists()) return { ok: false, message: "קוד לא תקין" }
  const codeData = codeSnap.data()
  if (codeData?.[inviteCodeFields.used]) return { ok: false, message: "הקוד כבר נוצל" }
  if (codeData?.[inviteCodeFields.type] !== "manager") {
    return { ok: false, message: "הקוד אינו מתאים להקמת מסעדה" }
  }
  const allowed = codeData?.[inviteCodeFields.allowedEmail]
  if (allowed && typeof allowed === "string" && normEmail(allowed) !== userEmail) {
    return { ok: false, message: "הקוד מיועד לאימייל אחר" }
  }
  const existingRestId = codeData?.[inviteCodeFields.restaurantId] as string | undefined
  if (existingRestId) {
    return { ok: false, message: "קוד זה משויך למסעדה קיימת" }
  }

  const restId = `rest_${Date.now()}`
  await setDoc(doc(db, restaurantsCollection, restId), {
    [restaurantFields.name]: name,
    [restaurantFields.branch]: br || "סניף ראשי",
    target: 30,
  })
  await setDoc(
    doc(db, usersCollection, options.uid),
    {
      restaurantId: restId,
      role: "manager",
      email: options.email,
    },
    { merge: true },
  )
  await setDoc(codeRef, { [inviteCodeFields.used]: true }, { merge: true })
  return { ok: true, restaurantId: restId }
}
