/**
 * אתחול Firebase Admin לשימוש בשרת (API routes) בלבד.
 * דורש: משתנה סביבה FIREBASE_SERVICE_ACCOUNT_JSON — JSON מלא של service account מ-Firebase Console.
 */
import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"

let app: App | null = null

export function getFirebaseAdminApp(): App | null {
  if (app) return app
  const existing = getApps()[0]
  if (existing) {
    app = existing
    return app
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw?.trim()) return null
  try {
    const sa = JSON.parse(raw) as ServiceAccount
    app = initializeApp({
      credential: cert(sa),
    })
    return app
  } catch (e) {
    console.error("[firebase-admin-server] init failed:", e)
    return null
  }
}

export function getFirebaseAdminAuth() {
  const a = getFirebaseAdminApp()
  if (!a) return null
  return getAuth(a)
}

/** Firestore Admin — לאותו פרויקט כמו Auth (נדרש לאימות הרשאות ב-API). */
export function getFirebaseAdminFirestore(): Firestore | null {
  const a = getFirebaseAdminApp()
  if (!a) return null
  return getFirestore(a)
}

export function getFirebaseAdminStorageBucket() {
  const a = getFirebaseAdminApp()
  if (!a) return null
  return getStorage(a).bucket()
}
