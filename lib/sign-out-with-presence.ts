import { signOut, type Auth } from "firebase/auth"
import { doc, serverTimestamp, setDoc, type Firestore } from "firebase/firestore"
import { firestoreConfig } from "@/lib/firestore-config"

/**
 * מסמן ב-Firestore שהמשתמש לא מקוון ואז מתנתק.
 * חשוב: אחרי signOut אין אימות — לא ניתן לעדכן presence.
 */
export async function signOutWithPresence(authInst: Auth, dbInst: Firestore): Promise<void> {
  const uid = authInst.currentUser?.uid
  if (uid) {
    try {
      await setDoc(
        doc(dbInst, firestoreConfig.usersCollection, uid),
        { isOnline: false, lastSeenAt: serverTimestamp() },
        { merge: true },
      )
    } catch {
      /* לא חוסם יציאה */
    }
  }
  await signOut(authInst)
}
