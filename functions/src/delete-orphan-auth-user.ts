/**
 * מחיקת משתמש Auth כשאין מסמך users/{uid} — מאפשר ליצור מחדש אותו אימייל אחרי מחיקה מהמערכת.
 * רק בעל מערכת / אימייל ב-config/admins.
 */
import * as admin from "firebase-admin"
import { onCall, HttpsError } from "firebase-functions/v2/https"

if (!admin.apps.length) admin.initializeApp()

function collectAdminEmails(data: admin.firestore.DocumentData | undefined): string[] {
  if (!data) return []
  const a = data.emails
  const b = data.adminEmails
  const out: string[] = []
  if (Array.isArray(a)) out.push(...a.map((e) => String(e).toLowerCase()))
  if (Array.isArray(b)) out.push(...b.map((e) => String(e).toLowerCase()))
  return out
}

async function loadAdminEmailSet(db: admin.firestore.Firestore): Promise<Set<string>> {
  const set = new Set<string>()
  try {
    const [adminsSnap, altSnap] = await Promise.all([
      db.collection("config").doc("admins").get(),
      db.collection("config").doc("adminEmails").get(),
    ])
    for (const e of collectAdminEmails(adminsSnap.exists ? adminsSnap.data() : undefined)) set.add(e)
    for (const e of collectAdminEmails(altSnap.exists ? altSnap.data() : undefined)) set.add(e)
  } catch {
    /* ignore */
  }
  return set
}

export const deleteOrphanAuthUser = onCall(
  { region: "us-central1", cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "נדרשת התחברות")
    }
    const raw = request.data?.email
    const email = typeof raw === "string" ? raw.trim().toLowerCase() : ""
    if (!email || !email.includes("@")) {
      throw new HttpsError("invalid-argument", "אימייל לא תקין")
    }

    const db = admin.firestore()
    const adminEmailSet = await loadAdminEmailSet(db)
    const callerUid = request.auth.uid
    const callerTokenEmail = request.auth.token.email?.toLowerCase()

    const callerSnap = await db.collection("users").doc(callerUid).get()
    if (!callerSnap.exists) {
      throw new HttpsError("permission-denied", "לא נמצאו פרטי משתמש מחובר")
    }
    const caller = callerSnap.data()!
    const callerIsSystemOwner =
      caller.isSystemOwner === true || (!!callerTokenEmail && adminEmailSet.has(callerTokenEmail))
    if (!callerIsSystemOwner) {
      throw new HttpsError("permission-denied", "אין הרשאה — רק בעל מערכת")
    }

    if (callerTokenEmail === email) {
      throw new HttpsError("permission-denied", "לא ניתן למחוק את החשבון שלך")
    }

    let targetUid: string
    try {
      const rec = await admin.auth().getUserByEmail(email)
      targetUid = rec.uid
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : ""
      if (code === "auth/user-not-found") {
        throw new HttpsError("not-found", "לא נמצא חשבון התחברות באימייל זה")
      }
      throw new HttpsError("internal", "שגיאה בחיפוש משתמש")
    }

    const userDoc = await db.collection("users").doc(targetUid).get()
    if (userDoc.exists) {
      throw new HttpsError(
        "failed-precondition",
        "המשתמש עדיין קיים במערכת (Firestore). מחק אותו בטאב משתמשים או ערוך לפני שחרור האימייל.",
      )
    }

    try {
      await admin.auth().deleteUser(targetUid)
    } catch (e: unknown) {
      console.error("[deleteOrphanAuthUser] deleteUser failed:", e)
      throw new HttpsError("internal", "מחיקת חשבון Auth נכשלה")
    }

    return { ok: true as const }
  },
)
