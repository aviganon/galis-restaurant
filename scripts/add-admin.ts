/**
 * הוספת אימייל לרשימת בעלים (config/admins)
 *
 * הרצה:
 * 1. Firebase Console → Project Settings → Service Accounts → Generate new private key
 * 2. שמור את הקובץ כ־scripts/service-account.json (או ציין נתיב אחר ב־SERVICE_ACCOUNT_PATH)
 * 3. npm run add:admin
 *
 * או: npx tsx scripts/add-admin.ts
 */

import { config } from "dotenv"
config({ path: ".env.local" })

import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { initializeApp, cert, type ServiceAccount } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

const EMAIL_TO_ADD = "ganonavi@gmail.com"

const scriptDir = join(process.cwd(), "scripts")
const possiblePaths = [
  join(scriptDir, "service-account.json"),
  join(scriptDir, "galis-sa.json"),
  join(process.cwd(), "service-account.json"),
]

let saPath = process.env.SERVICE_ACCOUNT_PATH
if (!saPath) {
  saPath = possiblePaths.find((p) => existsSync(p)) || possiblePaths[0]
}

if (!existsSync(saPath)) {
  console.error(`
❌ לא נמצא קובץ Service Account.

עשה את השלבים הבאים:

1. גלוש ל: https://console.firebase.google.com/project/galis-6ebbc/settings/serviceaccounts/adminsdk

2. לחץ על "Generate new private key" (צור מפתח פרטי חדש)

3. שמור את הקובץ JSON שהורדת בשם:
   scripts/service-account.json

4. הרץ שוב: npm run add:admin

או הרץ עם נתיב מותאם:
   SERVICE_ACCOUNT_PATH=path/to/your-key.json npm run add:admin
`)
  process.exit(1)
}

const sa = JSON.parse(readFileSync(saPath, "utf8")) as ServiceAccount

initializeApp({ credential: cert(sa) })
const db = getFirestore()

async function addAdmin() {
  const email = EMAIL_TO_ADD.toLowerCase().trim()
  console.log(`\n📧 מוסיף את ${email} לרשימת הבעלים...\n`)

  const adminsRef = db.collection("config").doc("admins")

  const snap = await adminsRef.get()
  const existing = snap.exists ? snap.data() : null
  const emailsField = existing?.emails ?? existing?.adminEmails ?? []
  const currentList: string[] = Array.isArray(emailsField) ? emailsField.map((e) => String(e).toLowerCase()) : []

  if (currentList.includes(email)) {
    console.log("✅ האימייל כבר ברשימה. אין צורך בעדכון.")
    process.exit(0)
  }

  const newList = [...currentList, email]

  await adminsRef.set({ emails: newList }, { merge: true })

  console.log("✅ האימייל נוסף בהצלחה!")
  console.log(`   רשימת הבעלים: ${newList.join(", ")}`)
  console.log("\n   התנתק מהמערכת והתחבר מחדש כדי לראות את פאנל הניהול.\n")
}

addAdmin().catch((e) => {
  console.error("❌ שגיאה:", e.message)
  process.exit(1)
})
