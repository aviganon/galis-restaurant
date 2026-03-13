import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { getStorage } from "firebase/storage"

const firebaseConfig = {
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
export const db = getFirestore(app)
export const storage = getStorage(app)
