/**
 * מיגרציה: משיכת קטלוג רכיבים גלובלי מהמערכת הישנה לחדשה
 *
 * הרצה:
 * 1. הורד מפתחות Service Account משני הפרויקטים (ראה README-MIGRATE.md)
 * 2. npm run migrate:ingredients
 *
 * הסקריפט קורא מ-restaurant-pro-2026 (ברירת מחדל) וכותב לפרויקט החדש.
 */

import { config } from "dotenv"
config({ path: ".env.local" })

import { initializeApp } from "firebase/app"
import { getFirestore, collection, getDocs, doc, setDoc } from "firebase/firestore"

// פרויקט ישן (restaurant-pro-2026) – קורא עם Client SDK (דורש שהכללים יאפשרו)
const OLD_CONFIG = {
  apiKey: process.env.OLD_FIREBASE_API_KEY || "AIzaSyBRts-rDdaSwEHnq2NxHcCYzvnnzoFWnB4",
  authDomain: process.env.OLD_FIREBASE_AUTH_DOMAIN || "restaurant-pro-2026.firebaseapp.com",
  projectId: process.env.OLD_FIREBASE_PROJECT_ID || "restaurant-pro-2026",
  storageBucket: process.env.OLD_FIREBASE_STORAGE_BUCKET || "restaurant-pro-2026.firebasestorage.app",
  messagingSenderId: process.env.OLD_FIREBASE_MESSAGING_SENDER_ID || "793284617422",
  appId: process.env.OLD_FIREBASE_APP_ID || "1:793284617422:web:50af799b9471c9dc451c9f",
}

// פרויקט חדש (משתני .env.local)
const NEW_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

async function migrate() {
  if (!NEW_CONFIG.projectId) {
    console.error("❌ חסרים משתני סביבה של הפרויקט החדש. ודא ש-.env.local מכיל NEXT_PUBLIC_FIREBASE_*")
    process.exit(1)
  }

  const oldApp = initializeApp(OLD_CONFIG, "old")
  const newApp = initializeApp(NEW_CONFIG, "new")
  const oldDb = getFirestore(oldApp)
  const newDb = getFirestore(newApp)

  console.log("📖 קורא קטלוג רכיבים מהמערכת הישנה (restaurant-pro-2026)...")
  let snap
  try {
    snap = await getDocs(collection(oldDb, "ingredients"))
  } catch (e) {
    console.error("❌ לא ניתן לקרוא מהפרויקט הישן. ייתכן שהכללים דורשים התחברות.")
    console.error("   פתרון: השתמש ב-Firebase Admin SDK עם Service Account (ראה README-MIGRATE.md)")
    process.exit(1)
  }

  const items = snap.docs.map((d) => ({ id: d.id, data: d.data() }))
  console.log(`   נמצאו ${items.length} רכיבים`)

  if (items.length === 0) {
    console.log("   אין מה להעביר.")
    process.exit(0)
  }

  console.log("📤 מעתיק לפרויקט החדש...")
  let done = 0
  for (const { id, data } of items) {
    const { price, unit, waste, supplier, currentStock, minStock, createdBy, sku, pkgSize, pkgPrice, lastUpdated, ...rest } = data
    const clean: Record<string, unknown> = {
      price: typeof price === "number" ? price : 0,
      unit: unit || "גרם",
      waste: waste != null ? waste : 0,
      supplier: supplier || "",
      ...(currentStock != null && { currentStock }),
      ...(minStock != null && { minStock }),
      ...(createdBy && { createdBy }),
      ...(sku && { sku }),
      ...(pkgSize != null && { pkgSize }),
      ...(pkgPrice != null && { pkgPrice }),
      ...(lastUpdated && { lastUpdated }),
      ...rest,
    }
    await setDoc(doc(newDb, "ingredients", id), clean, { merge: true })
    done++
    if (done % 50 === 0) console.log(`   ${done}/${items.length}`)
  }

  console.log(`✅ הועברו ${items.length} רכיבים בהצלחה`)
  process.exit(0)
}

migrate().catch((e) => {
  console.error("❌ שגיאה:", e)
  process.exit(1)
})
