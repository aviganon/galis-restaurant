/**
 * הרשאות דרך Firebase Admin (API routes) — שיתוף עם set-user-password ו-invite.
 */
import type { DocumentData, Firestore } from "firebase-admin/firestore"

function collectAdminEmails(data: DocumentData | undefined): string[] {
  if (!data) return []
  const a = data.emails
  const b = data.adminEmails
  const out: string[] = []
  if (Array.isArray(a)) out.push(...a.map((e) => String(e).toLowerCase()))
  if (Array.isArray(b)) out.push(...b.map((e) => String(e).toLowerCase()))
  return out
}

export async function loadAdminEmailSet(db: Firestore): Promise<Set<string>> {
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

/** שליחת מייל הזמנה — רק בעל מערכת / רשימת admins / מנהל או אדמין מסעדה */
export async function canSendInviteEmail(
  db: Firestore,
  uid: string,
  email: string | undefined,
  adminEmailSet: Set<string>,
): Promise<boolean> {
  const snap = await db.collection("users").doc(uid).get()
  if (!snap.exists) return false
  const d = snap.data()!
  if (d.isSystemOwner === true) return true
  const emailLower = email?.toLowerCase()
  if (emailLower && adminEmailSet.has(emailLower)) return true
  const role = String(d.role || "user")
  return role === "manager" || role === "admin" || role === "owner"
}
