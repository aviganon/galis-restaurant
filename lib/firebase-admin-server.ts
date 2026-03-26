/**
 * אתחול Firebase Admin לשימוש בשרת (API routes) בלבד.
 * דורש: משתנה סביבה FIREBASE_SERVICE_ACCOUNT_JSON — JSON מלא של service account מ-Firebase Console.
 */
import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"

let app: App | null = null

function resolveStorageBucketName(): string | undefined {
  const raw =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ||
    undefined
  if (!raw) return undefined
  return raw.replace(/^gs:\/\//, "").replace(/\/+$/, "")
}

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
    const storageBucket = resolveStorageBucketName()
    app = initializeApp({
      credential: cert(sa),
      ...(storageBucket ? { storageBucket } : {}),
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
  try {
    const storageBucket = resolveStorageBucketName()
    return storageBucket ? getStorage(a).bucket(storageBucket) : getStorage(a).bucket()
  } catch (e) {
    console.error("[firebase-admin-server] storage bucket init failed:", e)
    return null
  }
}
