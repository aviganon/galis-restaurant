# הוראות מלאות ל-Claude – Restaurant Pro Firebase

**נתיב הפרויקט:** `~/Library/Mobile Documents/com~apple~CloudDocs/cursor`

**איך להשתמש:** העתק את כל הקובץ הזה ושלח ל-Claude. Claude יבצע את כל השלבים.

---

# חלק א': הקמת פרויקט Firebase

## 1. יצירת פרויקט
1. https://console.firebase.google.com
2. **הוסף פרויקט** → שם: `restaurant-pro-new`
3. **צור פרויקט** → **המשך**

## 2. Web App
1. אייקון **`</>`** → כינוי: Restaurant Pro
2. **רשום אפליקציה** → **העתק** את firebaseConfig

## 3. שירותים
- **Authentication** → Email/Password → Enable
- **Firestore** → Create database → Production → europe-west1
- **Storage** → Get started → Production → Rules:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 4. נתונים ראשוניים
- **Firestore** → collection `config` → document `admins` → שדה `emails` (array) → הוסף אימייל בעלים
- **Authentication** → Add user → אותו אימייל + סיסמה (שמור!)

## 5. Firestore Rules
**Firestore** → **Rules** → החלף → **Publish**:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isConfigAdmin() {
      return request.auth != null
        && request.auth.token.email != null
        && exists(/databases/$(database)/documents/config/admins)
        && request.auth.token.email in get(/databases/$(database)/documents/config/admins).data.emails;
    }
    match /config/{docId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    match /users/{userId} {
      allow get: if request.auth != null && (request.auth.uid == userId || isConfigAdmin());
      allow list: if request.auth != null && isConfigAdmin();
      allow create, update, delete: if request.auth != null && request.auth.uid == userId;
    }
    match /restaurants/{restaurantId} {
      allow get: if true;
      allow list, create, update, delete: if request.auth != null;
      match /appState/{docId} {
        allow read, write: if request.auth != null;
      }
      match /{subcollection}/{docId} {
        allow read, write: if request.auth != null;
      }
    }
    match /inviteCodes/{codeId} {
      allow get: if true;
      allow list, create, update, delete: if request.auth != null;
    }
    match /ingredients/{docId} {
      allow read, write: if request.auth != null;
    }
    match /invoiceLog/{docId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 6. .env.local
בתיקיית הפרויקט צור `.env.local`:
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```
(החלף ... בערכים משלב 2)

---

# חלק ב': מיגרציית קטלוג רכיבים (אופציונלי)

## 7. מפתחות Service Account
- **פרויקט ישן** (restaurant-pro-2026): Project Settings → Service Accounts → Generate key → שמור כ־`scripts/old-sa.json`
- **פרויקט חדש**: אותו דבר → שמור כ־`scripts/new-sa.json`

## 8. סקריפט מיגרציה
אם הקובץ `scripts/migrate-ingredients-admin.mjs` לא קיים, צור אותו עם התוכן הבא:

```javascript
/**
 * מיגרציה: ingredients מהמערכת הישנה לחדשה
 */
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { initializeApp, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

const __dirname = dirname(fileURLToPath(import.meta.url))
const oldSa = JSON.parse(readFileSync(join(__dirname, "old-sa.json"), "utf8"))
const newSa = JSON.parse(readFileSync(join(__dirname, "new-sa.json"), "utf8"))

const oldApp = initializeApp({ credential: cert(oldSa) }, "old")
const newApp = initializeApp({ credential: cert(newSa) }, "new")
const oldDb = getFirestore(oldApp)
const newDb = getFirestore(newApp)

async function migrate() {
  const snap = await oldDb.collection("ingredients").get()
  const items = snap.docs.map((d) => ({ id: d.id, data: d.data() }))
  console.log(`מעביר ${items.length} רכיבים...`)
  for (const { id, data } of items) {
    const { price, unit, waste, supplier, currentStock, minStock, createdBy, sku, pkgSize, pkgPrice, lastUpdated, ...rest } = data
    await newDb.collection("ingredients").doc(id).set({
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
    }, { merge: true })
  }
  console.log("✅ הושלם")
  process.exit(0)
}
migrate().catch((e) => { console.error(e); process.exit(1) })
```

## 9. הרצה
```bash
cd ~/Library/Mobile\ Documents/com~apple~CloudDocs/cursor
npm install
npm run migrate:ingredients:admin
```
(ודא ש־package.json מכיל: `"migrate:ingredients:admin": "node scripts/migrate-ingredients-admin.mjs"` ו־`"firebase-admin"` ב־devDependencies)

---

# סיכום

| # | משימה |
|---|--------|
| 1 | פרויקט Firebase + Web app |
| 2 | Authentication, Firestore, Storage |
| 3 | config/admins + משתמש Admin |
| 4 | Firestore Rules |
| 5 | .env.local |
| 6 | (אופציונלי) מיגרציית ingredients |

**בדיקה:** `npm run dev` → התחברות → תפריט בעלים אמור להופיע.
