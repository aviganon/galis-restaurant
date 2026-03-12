# הוראות מלאות ל-Claude: הקמת Firebase + מיגרציה למערכת Restaurant Pro

**העתק את כל התוכן למטה ושלח ל-Claude.** Claude יבצע את כל השלבים לפי הסדר.

---

# חלק א': הקמת פרויקט Firebase חדש

## 1. יצירת פרויקט

1. גלוש ל־https://console.firebase.google.com
2. לחץ **"הוסף פרויקט"** / **"Add project"**
3. שם: **`restaurant-pro-new`** (או שם אחר)
4. (אופציונלי) כבה Google Analytics
5. **צור פרויקט** → **המשך**

---

## 2. הוספת אפליקציית Web

1. לחץ על אייקון **`</>`** (Web)
2. כינוי: **Restaurant Pro**
3. **אל תסמן** Firebase Hosting
4. **רשום אפליקציה**
5. **העתק** את ערכי firebaseConfig: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`

---

## 3. הפעלת שירותים

### 3.1 Authentication
- **Build** → **Authentication** → **Get started**
- **Sign-in method** → **Email/Password** → **Enable** → **Save**

### 3.2 Firestore Database
- **Build** → **Firestore Database** → **Create database**
- **מצב ייצור** (Production)
- מיקום: **europe-west1**
- **Enable**

### 3.3 Storage
- **Build** → **Storage** → **Get started**
- **Production mode** → מיקום כמו Firestore → **Done**
- **Rules** → החלף ל:
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

## 4. נתוני Firestore ראשוניים

### 4.1 config/admins
1. **Firestore** → **Start collection**
2. Collection: `config` | Document: `admins`
3. שדה `emails` (סוג **array**) – הוסף אימייל בעלים, למשל `ganonavi@gmail.com`
4. **Save**

### 4.2 משתמש Admin ב-Authentication (חובה!)
1. **Authentication** → **Users** → **Add user**
2. **Email:** אותו אימייל מ־config/admins
3. **Password:** סיסמה (לפחות 6 תווים) – **שמור אותה**
4. **Save**

### 4.3 config/anthropic (אופציונלי – ל-AI Upload)
1. באוסף `config` צור מסמך `anthropic`
2. שדות: `key` (string – מפתח Claude), `updatedAt` (string)

---

## 5. Firestore Security Rules

**Firestore** → **Rules** → החלף את התוכן → **Publish**:

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

## 6. קובץ .env.local

בתיקיית הפרויקט (עם package.json) צור **`.env.local`**:

```
NEXT_PUBLIC_FIREBASE_API_KEY=ערך_מ_שלב_2
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=ערך_מ_שלב_2
NEXT_PUBLIC_FIREBASE_PROJECT_ID=ערך_מ_שלב_2
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=ערך_מ_שלב_2
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=ערך_מ_שלב_2
NEXT_PUBLIC_FIREBASE_APP_ID=ערך_מ_שלב_2
```

החלף כל `ערך_מ_שלב_2` בערך מהשלב 2.

---

# חלק ב': מיגרציית קטלוג רכיבים (אופציונלי)

אם יש קטלוג גלובלי במערכת הישנה (restaurant-pro-2026) ורוצים להעביר אותו לחדשה:

## 7. הורדת מפתחות Service Account

**פרויקט ישן (restaurant-pro-2026):**
1. Firebase Console → הפרויקט הישן → ⚙️ Project Settings → Service Accounts
2. **Generate new private key** → הורד
3. שמור כ־`scripts/old-sa.json`

**פרויקט חדש:**
1. Firebase Console → הפרויקט החדש → ⚙️ Project Settings → Service Accounts
2. **Generate new private key** → הורד
3. שמור כ־`scripts/new-sa.json`

## 8. הרצת מיגרציה

```bash
cd /path/to/cursor
npm install
npm run migrate:ingredients:admin
```

(החלף `/path/to/cursor` בנתיב לתיקיית הפרויקט)

**חשוב:** `old-sa.json` ו־`new-sa.json` לא יעלו ל-Git (נמצאים ב-.gitignore).

---

# סיכום – רשימת משימות

| # | משימה | סטטוס |
|---|--------|-------|
| 1 | יצירת פרויקט Firebase | ☐ |
| 2 | הוספת Web app + העתקת קונפיגורציה | ☐ |
| 3 | הפעלת Authentication, Firestore, Storage | ☐ |
| 4 | config/admins + משתמש Admin | ☐ |
| 5 | Firestore Rules | ☐ |
| 6 | .env.local | ☐ |
| 7 | (אופציונלי) מיגרציית ingredients | ☐ |

---

# בדיקה סופית

1. `npm run dev` בפרויקט
2. התחברות עם האימייל והסיסמה מ־שלב 4.2
3. אמור להופיע תפריט בעלים: לוח בקרה, עץ מוצר, פאנל ניהול
4. אם בוצעה מיגרציה – הרכיבים יופיעו בעץ המוצר
