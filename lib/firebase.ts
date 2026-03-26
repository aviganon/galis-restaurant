import { getApps, initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore"
import { getStorage } from "firebase/storage"
import { getFunctions } from "firebase/functions"

/** ייצוא לשימוש ב־App משני (יצירת משתמש בלי להחליף את ההתחברות הנוכחית) */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "placeholder",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "placeholder.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "placeholder",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "placeholder.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "placeholder",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "placeholder",
}

// ב-Vercel build משתני הסביבה עשויים להיות חסרים — משתמשים ב-placeholder כדי שה-build יצליח.
// הוסף את משתני Firebase ב-Vercel Dashboard כדי שהאפליקציה תעבוד.
if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && typeof window !== "undefined") {
  console.error("חסרים משתני סביבה של Firebase. הוסף אותם ב-Vercel או צור .env.local")
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

const SECONDARY_AUTH_APP_NAME = "user-creation-secondary"

/** Auth נפרד ליצירת משתמשים — לא מחליף את המשתמש המחובר באפליקציה הראשית */
export function getAuthForUserCreation() {
  const secondaryApp =
    getApps().find((a) => a.name === SECONDARY_AUTH_APP_NAME) ??
    initializeApp(firebaseConfig, SECONDARY_AUTH_APP_NAME)
  return getAuth(secondaryApp)
}

/**
 * מטמון Firestore מקומי (IndexedDB) בדפדפן — מזרז חזרה לנתונים אחרי מעבר דף / יציאה מהתחזה,
 * ומפחית רשת כשהקולקציות כבר נטענו פעם באותו טאב/מסעדה.
 * ב-SSR נשאר getFirestore רגיל (ללא persistence).
 */
function createFirestore() {
  if (typeof window === "undefined") {
    return getFirestore(app)
  }
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })
  } catch {
    // כבר אותחל (HMR / קריאה כפולה) — מחזירים את אותו מופע
    return getFirestore(app)
  }
}

export const db = createFirestore()
export const storage = getStorage(app)

/** Cloud Functions — אותו אזור כמו deleteOrphanAuthUser (v2) */
export function getFirebaseFunctions() {
  return getFunctions(app, "us-central1")
}
