import type { Firestore } from "firebase-admin/firestore"
import type { DecodedIdToken } from "firebase-admin/auth"
import { firestoreConfig } from "@/lib/firestore-config"
import { loadAdminEmailSet } from "@/lib/firebase-admin-permissions"

/** האם המשתמש המחובר הוא בעל מערכת או ברשימת admins (לשימוש ב-API routes). */
export async function callerIsSystemOwner(db: Firestore, decoded: DecodedIdToken): Promise<boolean> {
  const emailLower = decoded.email?.trim().toLowerCase()
  if (emailLower) {
    const adminSet = await loadAdminEmailSet(db)
    if (adminSet.has(emailLower)) return true
  }
  const snap = await db.collection(firestoreConfig.usersCollection).doc(decoded.uid).get()
  const d = snap.data()
  return d?.isSystemOwner === true
}
