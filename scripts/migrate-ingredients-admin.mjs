/**
 * מיגרציה עם Firebase Admin SDK – עוקף את כללי האבטחה
 * דורש: מפתחות Service Account משני הפרויקטים
 *
 * הרצה:
 * 1. Firebase Console → Project Settings → Service Accounts → Generate new private key
 *    עבור הפרויקט הישן והחדש
 * 2. שמור כ־old-sa.json ו־new-sa.json בתיקיית scripts/
 * 3. node scripts/migrate-ingredients-admin.mjs
 */

import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { initializeApp, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

const __dirname = dirname(fileURLToPath(import.meta.url))

const oldSaPath = join(__dirname, "old-sa.json")
const newSaPath = join(__dirname, "new-sa.json")

let oldSa, newSa
try {
  oldSa = JSON.parse(readFileSync(oldSaPath, "utf8"))
  newSa = JSON.parse(readFileSync(newSaPath, "utf8"))
} catch (e) {
  console.error("❌ לא נמצאו old-sa.json או new-sa.json. הורד מפתחות Service Account מ-Firebase Console.")
  process.exit(1)
}

const oldApp = initializeApp({ credential: cert(oldSa) }, "old")
const newApp = initializeApp({ credential: cert(newSa) }, "new")
const oldDb = getFirestore(oldApp)
const newDb = getFirestore(newApp)

async function migrate() {
  console.log("📖 קורא ingredients מהפרויקט הישן...")
  const snap = await oldDb.collection("ingredients").get()
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
    const clean = {
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
    await newDb.collection("ingredients").doc(id).set(clean, { merge: true })
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
