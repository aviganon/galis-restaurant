/**
 * בדיקה: האם אימייל ברשימת הבעלים?
 * לא משנה כלום — רק קורא ומדווח.
 *
 * הרצה: npm run check:admin
 * או: EMAIL=xxx@yyy.com npm run check:admin
 */

import { config } from "dotenv"
config({ path: ".env.local" })

import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { initializeApp, cert, type ServiceAccount } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

const EMAIL_TO_CHECK = process.env.EMAIL || "ganonavi@gmail.com"

const scriptDir = join(process.cwd(), "scripts")
const possiblePaths = [
  join(scriptDir, "service-account.json"),
  join(scriptDir, "galis-sa.json"),
]

const saPath = possiblePaths.find((p) => existsSync(p))

if (!saPath) {
  console.log(`
⚠️  אין קובץ Service Account — אי אפשר לבדוק אוטומטית.

בדיקה ידנית:
1. גלוש ל: https://console.firebase.google.com/project/galis-6ebbc/firestore
2. פתח: config → admins
3. בדוק אם השדה "emails" מכיל את: ${EMAIL_TO_CHECK}
`)
  process.exit(0)
}

const sa = JSON.parse(readFileSync(saPath, "utf8")) as ServiceAccount
initializeApp({ credential: cert(sa) })
const db = getFirestore()

async function check() {
  const email = EMAIL_TO_CHECK.toLowerCase().trim()
  const snap = await db.collection("config").doc("admins").get()
  const data = snap.exists ? snap.data() : null
  const list: string[] = Array.isArray(data?.emails) ? data.emails.map((e) => String(e).toLowerCase()) : []
  const isAdmin = list.includes(email)

  console.log(`\n📧 אימייל: ${EMAIL_TO_CHECK}`)
  console.log(`📋 מסמך config/admins: ${snap.exists ? "קיים" : "לא קיים"}`)
  console.log(`👤 ברשימת בעלים: ${isAdmin ? "כן ✅" : "לא ❌"}`)
  if (list.length > 0) console.log(`   רשימה: ${list.join(", ")}`)
  console.log("")
}

check().catch((e) => {
  console.error("❌ שגיאה:", e.message)
  process.exit(1)
})
