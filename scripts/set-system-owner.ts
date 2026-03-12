/**
 * הגדרת משתמש קיים כבעלים מערכת (isSystemOwner)
 * שימושי כשמשתמש admin רואה רק מסעדה אחת — מוסיף isSystemOwner: true
 *
 * הרצה: npm run set:system-owner
 * או: EMAIL=admin@example.com npm run set:system-owner
 *
 * משתמש ב-Firebase Auth כדי למצוא משתמש לפי אימייל (גם אם אין לו עדיין doc ב-Firestore)
 */

import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { initializeApp, cert, type ServiceAccount } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getAuth } from "firebase-admin/auth"

const EMAIL = process.env.EMAIL || "ganonavi@gmail.com"

const scriptDir = join(process.cwd(), "scripts")
const saPath = [join(scriptDir, "service-account.json"), join(scriptDir, "galis-sa.json")].find((p) => existsSync(p))

if (!saPath) {
  console.error("\n❌ לא נמצא service-account.json. הורד מ-Firebase Console → Service Accounts.\n")
  process.exit(1)
}

const sa = JSON.parse(readFileSync(saPath, "utf8")) as ServiceAccount
initializeApp({ credential: cert(sa) })
const db = getFirestore()
const auth = getAuth()

async function run() {
  const email = EMAIL.toLowerCase().trim()
  console.log(`\n🔍 מחפש משתמש עם אימייל: ${email}\n`)

  let uid: string
  try {
    const userRecord = await auth.getUserByEmail(email)
    uid = userRecord.uid
    console.log(`   נמצא ב-Firebase Auth: ${uid}\n`)
  } catch (e) {
    console.error("❌ לא נמצא משתמש עם אימייל זה ב-Firebase Auth.")
    console.error("   ודא שהתחברת לפחות פעם אחת לאפליקציה.\n")
    process.exit(1)
  }

  await db.collection("users").doc(uid).set({ isSystemOwner: true, email }, { merge: true })

  console.log("✅ הוגדר isSystemOwner: true")
  console.log(`   משתמש: ${uid}`)
  console.log("\n   התנתק והתחבר מחדש — תראה את כל המסעדות ותפריט בעלים.\n")
}

run().catch((e) => {
  console.error("❌ שגיאה:", e.message)
  process.exit(1)
})
