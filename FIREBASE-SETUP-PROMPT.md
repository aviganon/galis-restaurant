# הנחיות להגדרת Firebase עבור Restaurant Pro

**מטרה:** התחבר לפרויקט Firebase "restaurant-pro" (או "restaurant-pro-2026") והגדר את כל מה שצריך כדי שהמערכת תעבוד.

---

## 1. Authentication (אימות)

**Firebase Console → Build → Authentication → Sign-in method**

- הפעל **Email/Password** (אימייל/סיסמה)
- אין צורך ב-Email link או שיטות נוספות כרגע

---

## 2. Firestore Database – מבנה הנתונים

**Firebase Console → Build → Firestore Database**

### 2.1 קובץ `config/admins` (בעלי המערכת)

**נתיב:** `config` (collection) → `admins` (document)

| שדה | סוג | דוגמה | הערה |
|-----|-----|-------|------|
| `emails` | **array** | `["ganonavi@gmail.com"]` | **חשוב:** חייב להיות מערך, לא מחרוזת בודדת |

**איך ליצור/לתקן:**
- אם `emails` קיים כמחרוזת – מחק אותו
- הוסף שדה חדש: שם `emails`, סוג `array`
- הוסף אימייל כאיבר במערך (למשל `ganonavi@gmail.com`)
- בעלים נוספים: הוסף עוד אימיילים לאותו מערך

---

### 2.2 קובץ `config/anthropic` (מפתח Claude API – אופציונלי)

**נתיב:** `config` (collection) → `anthropic` (document)

| שדה | סוג | הערה |
|-----|-----|------|
| `key` | string | מפתח API של Claude (ניתן להגדיר גם מהאפליקציה) |
| `updatedAt` | string | ISO timestamp |

---

### 2.3 Collection `users`

**נתיב:** `users` (collection) → `{uid}` (document – מזהה המשתמש מ-Firebase Auth)

| שדה | סוג | הערה |
|-----|-----|------|
| `restaurantId` | string | מזהה המסעדה |
| `role` | string | `"manager"` או `"user"` |
| `email` | string | אימייל המשתמש |
| `permissions` | map | אופציונלי – למשתמשים עם role=user |
| `permissions.canSeeReports` | boolean | |
| `permissions.canSeeCosts` | boolean | |
| `permissions.canSeeSettings` | boolean | |

**הערה:** מסמכים נוצרים אוטומטית בהרשמה/הזמנה – אין צורך ליצור ידנית.

---

### 2.4 Collection `restaurants`

**נתיב:** `restaurants` (collection) → `{restaurantId}` (document)

| שדה | סוג | הערה |
|-----|-----|------|
| `name` | string | שם המסעדה |
| `branch` | string | סניף/כתובת |
| `emoji` | string | אימוג'י (אופציונלי) |
| `target` | number | יעד עלות מזון (למשל 30) |

**תת-מסמך:** `restaurants/{id}/appState/invitedEmails`

| שדה | סוג | הערה |
|-----|-----|------|
| `list` | array | מערך אימיילים מוזמנים, למשל `["user@example.com"]` |

---

### 2.5 Collection `inviteCodes`

**נתיב:** `inviteCodes` (collection) → `{CODE}` (document – קוד בפורמט XXXX-XXXX)

| שדה | סוג | הערה |
|-----|-----|------|
| `type` | string | `"manager"` |
| `restaurantId` | string | אופציונלי – אם הקוד למסעדה קיימת |
| `used` | boolean | `false` בהתחלה, `true` אחרי שימוש |
| `createdAt` | string | ISO timestamp |

**דוגמה:** `inviteCodes/ABCD-1234` עם `{ type: "manager", used: false, createdAt: "..." }`

---

## 3. Firestore Security Rules

**Firebase Console → Build → Firestore Database → Rules**

החלף את ה-Rules ב:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // משתמש מחובר בלבד
    function isSignedIn() {
      return request.auth != null;
    }
    
    // config - קריאה לכולם (admins, anthropic)
    match /config/{document=**} {
      allow read: if isSignedIn();
      allow write: if isSignedIn();
    }
    
    // users - קריאה/כתיבה רק למסמך של המשתמש המחובר
    match /users/{userId} {
      allow read, write: if isSignedIn() && request.auth.uid == userId;
    }
    
    // restaurants - קריאה/כתיבה למשתמשים מחוברים
    match /restaurants/{restaurantId} {
      allow read, write: if isSignedIn();
      match /appState/{doc} {
        allow read, write: if isSignedIn();
      }
    }
    
    // inviteCodes - קריאה וכתיבה למשתמשים מחוברים
    match /inviteCodes/{code} {
      allow read, write: if isSignedIn();
    }
    
    // ingredients, invoiceLog, appState - אם קיימים
    match /ingredients/{doc} {
      allow read, write: if isSignedIn();
    }
    match /invoiceLog/{doc} {
      allow read, write: if isSignedIn();
    }
    match /appState/{document=**} {
      allow read, write: if isSignedIn();
    }
  }
}
```

**הערה:** Rules אלה מאפשרים גישה לכל משתמש מחובר. אם תרצה הגבלות לפי תפקידים, אפשר להרחיב מאוחר יותר.

---

## 4. Firestore Indexes (אינדקסים)

**Firebase Console → Build → Firestore Database → Indexes**

ייתכן שתצטרך אינדקס לשאילתה:

- **Collection:** `users`
- **Fields:** `restaurantId` (Ascending)

אם תופיע שגיאה עם לינק ליצירת אינדקס – לחץ על הלינק ו-Firebase ייצור אותו אוטומטית.

---

## 5. סיכום – רשימת משימות

- [ ] הפעלת Email/Password ב-Authentication
- [ ] יצירה/תיקון של `config/admins` עם שדה `emails` מסוג **array**
- [ ] הוספת אימייל הבעלים למערך `emails`
- [ ] עדכון Firestore Security Rules
- [ ] יצירת אינדקס ל-`users` לפי `restaurantId` (אם נדרש)
- [ ] (אופציונלי) יצירת `config/anthropic` אם רוצים מפתח Claude גלובלי

---

## 6. Project ID

הפרויקט משתמש ב:
- **projectId:** `restaurant-pro-2026`
- **authDomain:** `restaurant-pro-2026.firebaseapp.com`

ודא שאתה עובד על הפרויקט הנכון.
