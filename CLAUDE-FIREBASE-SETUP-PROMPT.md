# הוראות ל-Claude: הקמת פרויקט Firebase למערכת Restaurant Pro החדשה

**העתק את כל התוכן למטה ושלח ל-Claude.** Claude יבצע את כל השלבים.

---

## המשימה

הקמת פרויקט Firebase חדש ונפרד למערכת Restaurant Pro החדשה (Next.js). המערכת כבר מוכנה ומשתמשת במשתני סביבה – צריך רק ליצור את הפרויקט ב-Firebase ולהגדיר אותו.

---

## שלב 1: יצירת פרויקט Firebase

1. גלוש ל־https://console.firebase.google.com
2. לחץ **"הוסף פרויקט"** / **"Add project"**
3. שם הפרויקט: **`restaurant-pro-new`** (או שם אחר לפי בחירה)
4. (אופציונלי) כבה Google Analytics
5. לחץ **"צור פרויקט"** → **"המשך"**

---

## שלב 2: הוספת אפליקציית Web

1. במסך הפרויקט לחץ על אייקון **`</>`** (Web)
2. כינוי: **Restaurant Pro**
3. **אל תסמן** Firebase Hosting
4. לחץ **"רשום אפליקציה"**
5. **העתק** את ערכי `firebaseConfig`:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`

---

## שלב 3: הפעלת שירותים

### Authentication
- **Build** → **Authentication** → **Get started**
- **Sign-in method** → **Email/Password** → **Enable** → **Save**

### Firestore Database
- **Build** → **Firestore Database** → **Create database**
- בחר **"מצב ייצור"** (Production mode)
- מיקום: **europe-west1** (או קרוב למשתמשים)
- **Enable**

### Storage (נדרש ל-AI Upload – העלאת קבצים)
- **Build** → **Storage** → **Get started**
- בחר **Production mode**
- מיקום: אותו כמו Firestore
- **Done**
- אחרי ההפעלה: **Rules** → החלף ל:
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
- **Publish**

---

## שלב 4: יצירת config/admins ב-Firestore

1. **Firestore Database** → **Start collection**
2. **Collection ID:** `config`
3. **Document ID:** `admins`
4. הוסף שדה:
   - **Field:** `emails`
   - **Type:** `array`
   - **Value:** הוסף איבר – האימייל של בעל המערכת (למשל `ganonavi@gmail.com`)
5. **Save**

**חשוב:** `emails` חייב להיות **array**, לא string.

---

## שלב 4.1: יצירת משתמש Admin ב-Authentication (חובה!)

**בפרויקט חדש אין משתמשים** – צריך ליצור את בעל המערכת ידנית:

1. **Build** → **Authentication** → **Users**
2. לחץ **"Add user"** / **"הוסף משתמש"**
3. **Email:** האימייל של בעל המערכת (אותו שהוספת ל־config/admins, למשל `ganonavi@gmail.com`)
4. **Password:** סיסמה (לפחות 6 תווים) – **שמור אותה**, תצטרך להתחבר איתה
5. **Save**

עכשיו תוכל להתחבר למערכת עם האימייל והסיסמה האלה – המערכת תזהה אותך כ־admin (בעלים) כי האימייל נמצא ב־config/admins.emails.

---

## שלב 4.2: config/anthropic (AI Upload – מפתח Claude – אופציונלי)

להפעלת העלאת קבצים חכמה (AI) שמחלצת רכיבים ומחירים מתמונות/PDF/Excel:

1. באוסף **config**, צור מסמך חדש
2. **Document ID:** `anthropic`
3. שדות:
   - **Field:** `key` | **Type:** string | **Value:** מפתח API מ־[console.anthropic.com](https://console.anthropic.com)
   - **Field:** `updatedAt` | **Type:** string | **Value:** `2025-01-01T00:00:00.000Z`

**הערה:** ניתן גם להגדיר את המפתח מהאפליקציה (פאנל ניהול → הגדרות Claude) – אז המסמך ייווצר אוטומטית.

---

## שלב 5: העלאת Firestore Security Rules

העתק את ה-Rules הבאים ל-**Firestore Database** → **Rules** → החלף את התוכן הקיים → **Publish**:

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

---

## שלב 6: יצירת קובץ .env.local בפרויקט

בתיקיית הפרויקט (איפה שנמצאים `package.json` ו-`lib/firebase.ts`), צור קובץ **`.env.local`** עם התוכן הבא – **החלף** את הערכים בערכים מהשלב 2:

```
NEXT_PUBLIC_FIREBASE_API_KEY=הערך_מ_שלב_2
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=הערך_מ_שלב_2
NEXT_PUBLIC_FIREBASE_PROJECT_ID=הערך_מ_שלב_2
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=הערך_מ_שלב_2
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=הערך_מ_שלב_2
NEXT_PUBLIC_FIREBASE_APP_ID=הערך_מ_שלב_2
```

**דוגמה:**
```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyABC123...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=restaurant-pro-new.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=restaurant-pro-new
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=restaurant-pro-new.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
```

---

## שלב 7: חיבור Firebase CLI (אופציונלי – להעלאת Rules מהפרויקט)

אם רוצים להעלות Rules מהקובץ `firestore.rules` בפרויקט:

```bash
firebase login
firebase use --add
# בחר את הפרויקט החדש
firebase deploy --only firestore:rules
```

---

## סיכום – מה צריך להיות מוכן

| פריט | סטטוס |
|------|--------|
| פרויקט Firebase חדש | ☐ |
| אפליקציית Web רשומה | ☐ |
| Authentication (Email/Password) מופעל | ☐ |
| Firestore Database מופעל | ☐ |
| Storage מופעל + Rules | ☐ |
| משתמש Admin ב-Authentication (אימייל + סיסמה) | ☐ |
| config/admins עם emails (array) | ☐ |
| config/anthropic (מפתח Claude – אופציונלי ל-AI Upload) | ☐ |
| Firestore Rules מעודכנים | ☐ |
| .env.local עם ערכי Firebase | ☐ |

---

## בדיקה

לאחר ההגדרה:
1. הרץ `npm run dev` בפרויקט
2. היכנס עם האימייל מ־config/admins.emails
3. אמור להופיע תפריט בעלים: לוח בקרה, עץ מוצר, פאנל ניהול
4. **AI Upload:** עבור להעלאה → העלאת מחירון/חשבונית/מתכון. אם config/anthropic לא הוגדר, הגדר מפתח Claude בפאנל ניהול
