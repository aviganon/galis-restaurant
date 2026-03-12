# הוראות הקמת פרויקט Firebase חדש למערכת Restaurant Pro

**מטרה:** להקים פרויקט Firebase נפרד למערכת החדשה, עם הפרדה מלאה מהמערכת הישנה.

---

## שלב 1: יצירת פרויקט Firebase חדש

### 1.1 כניסה ל-Firebase Console
1. גלוש ל־[https://console.firebase.google.com](https://console.firebase.google.com)
2. התחבר עם חשבון Google

### 1.2 יצירת פרויקט
1. לחץ על **"הוסף פרויקט"** / **"Add project"**
2. הזן שם לפרויקט, למשל: **`restaurant-pro-new`** או **`restaurant-pro-2027`**
3. (אופציונלי) הפעל Google Analytics – לא חובה
4. לחץ **"צור פרויקט"** / **"Create project"**
5. לאחר היצירה, לחץ **"המשך"** / **"Continue"**

---

## שלב 2: הוספת אפליקציית Web

### 2.1 רישום האפליקציה
1. במסך הפרויקט, לחץ על **"</>"** (Web / Web app)
2. הזן כינוי לאפליקציה, למשל: **Restaurant Pro**
3. **אל תסמן** Firebase Hosting כרגע (ניתן להוסיף אחר כך)
4. לחץ **"רשום אפליקציה"** / **"Register app"**

### 2.2 העתקת קונפיגורציה
1. יוצג לך אובייקט `firebaseConfig` עם הערכים:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`
2. **העתק** את הערכים האלה – תשתמש בהם בשלב 4

---

## שלב 3: הפעלת שירותים

### 3.1 Authentication
1. בתפריט השמאלי: **Build** → **Authentication**
2. לחץ **"התחל"** / **"Get started"**
3. עבור אל **Sign-in method**
4. לחץ על **Email/Password**
5. הפעל את המתג **"הפעל"** / **"Enable"**
6. לחץ **"שמור"** / **"Save"**

### 3.2 Firestore Database
1. בתפריט השמאלי: **Build** → **Firestore Database**
2. לחץ **"צור מסד נתונים"** / **"Create database"**
3. בחר **"התחל במצב בדיקה"** (לפיתוח) או **"מצב ייצור"** (לפרודקשן)
4. בחר מיקום (למשל `europe-west1`)
5. לחץ **"הפעל"** / **"Enable"**

### 3.3 Storage (אופציונלי)
1. בתפריט השמאלי: **Build** → **Storage**
2. לחץ **"התחל"** / **"Get started"**
3. אשר את כללי האבטחה המוצעים
4. לחץ **"הפעל"** / **"Done"**

---

## שלב 4: הגדרת משתני סביבה בפרויקט

### 4.1 יצירת קובץ .env.local
1. בתיקיית הפרויקט (cursor), צור קובץ בשם **`.env.local`**
2. העתק את התוכן מ־`.env.example`:

```
NEXT_PUBLIC_FIREBASE_API_KEY=הערך_שלך
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=הערך_שלך
NEXT_PUBLIC_FIREBASE_PROJECT_ID=הערך_שלך
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=הערך_שלך
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=הערך_שלך
NEXT_PUBLIC_FIREBASE_APP_ID=הערך_שלך
```

3. **החלף** כל `הערך_שלך` בערך המתאים מ־Firebase Console (שלב 2.2)

### 4.2 דוגמה מלאה
```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=restaurant-pro-new.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=restaurant-pro-new
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=restaurant-pro-new.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
```

---

## שלב 5: יצירת נתוני Firestore ראשוניים

### 5.1 config/admins (בעלי המערכת)
1. **Firestore Database** → **"התחל אוסף"** / **"Start collection"**
2. **מזהה אוסף:** `config`
3. **מזהה מסמך:** `admins`
4. הוסף שדה:
   - **שם:** `emails`
   - **סוג:** `array`
   - **ערך:** הוסף איבר עם האימייל שלך, למשל `ganonavi@gmail.com`
5. לחץ **"שמור"** / **"Save"**

**חשוב:** `emails` חייב להיות **מערך (array)**, לא מחרוזת.

### 5.2 config/anthropic (אופציונלי – מפתח Claude)
1. באוסף `config`, צור מסמך חדש
2. **מזהה מסמך:** `anthropic`
3. שדות:
   - `key` (string) – מפתח API של Claude
   - `updatedAt` (string) – ISO timestamp

---

## שלב 6: העלאת Firestore Rules

### 6.1 חיבור Firebase CLI לפרויקט
1. התקן Firebase CLI (אם עדיין לא):
   ```bash
   npm install -g firebase-tools
   ```
2. התחבר:
   ```bash
   firebase login
   ```
3. חבר את הפרויקט:
   ```bash
   firebase use --add
   ```
4. בחר את הפרויקט החדש שיצרת מהרשימה
5. תן לו alias (למשל `default`)

### 6.2 עדכון firebase.json
ודא ש־`firebase.json` מצביע על הפרויקט הנכון. אם יש `projects` בהגדרות, עדכן ל־projectId החדש.

### 6.3 העלאת Rules
```bash
firebase deploy --only firestore:rules
```

---

## שלב 7: הרצת האפליקציה

1. הפעל מחדש את שרת הפיתוח:
   ```bash
   npm run dev
   ```
2. היכנס עם האימייל שהוספת ל־`config/admins.emails`
3. ודא שאתה רואה תפריט בעלים (לוח בקרה, עץ מוצר, פאנל ניהול)

---

## סיכום – רשימת משימות לביצוע

| # | משימה | סטטוס |
|---|--------|-------|
| 1 | יצירת פרויקט Firebase חדש | ☐ |
| 2 | הוספת אפליקציית Web והעתקת קונפיגורציה | ☐ |
| 3 | הפעלת Authentication (Email/Password) | ☐ |
| 4 | הפעלת Firestore Database | ☐ |
| 5 | הפעלת Storage (אופציונלי) | ☐ |
| 6 | יצירת `.env.local` עם ערכי Firebase | ☐ |
| 7 | יצירת `config/admins` עם `emails` (array) | ☐ |
| 8 | `firebase use` לפרויקט החדש | ☐ |
| 9 | `firebase deploy --only firestore:rules` | ☐ |
| 10 | הרצת `npm run dev` ובדיקה | ☐ |

---

## הערות

- **המערכת הישנה** (`restaurant-pro`) ממשיכה לעבוד עם הפרויקט `restaurant-pro-2026`.
- **המערכת החדשה** עובדת עם הפרויקט החדש בלבד – אין שיתוף נתונים ביניהן.
- משתמשים שנרשמו בפרויקט הישן **לא** יופיעו בפרויקט החדש – יש להירשם מחדש או ליצור משתמשים חדשים.
