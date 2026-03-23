# איפוס סיסמה, מיילים ו-Firebase — מדריך להקמה ולדיבוג

מסמך זה מרכז **מה צריך להגדיר ב-Firebase, בשרת (Vercel/Node) וב-Resend** כדי ש:

1. **בעל מערכת** יוכל להגדיר סיסמה חדשה לכל משתמש (מסך «לפי משתמש» → «הגדרת סיסמה»).
2. **כל משתמש** יוכל לאפס לעצמו דרך **«שכחתי סיסמה»** במסך הכניסה — **ויקבל מייל** עם קישור איפוס.
3. **משתמש רגיל** (לא בעל מערכת) יוכל גם **«שינוי סיסמה»** בהגדרות — שם נשלח מייל איפוס (אותה לוגיקה כמו שכחתי סיסמה).

הקוד באפליקציה כבר ממומש; הבעיה «לא מגיע מייל» כמעט תמיד נובעת מ**חוסר משתני סביבה** או **דומיין לא מאומת ב-Resend**.

---

## סיכום זרימות (איך זה עובד בקוד)

| תרחיש | איפה ב-UI | מה קורה בפועל |
|--------|-----------|----------------|
| בעל מערכת מגדיר סיסמה למשתמש | הגדרות → «לפי משתמש» → בחירת משתמש → **הגדרת סיסמה** | דיאלוג סיסמה → `POST /api/auth/set-user-password` עם Bearer token. **Firebase Admin** מעדכן סיסמה. **אין מייל** (מכוון). |
| שכחתי סיסמה / שינוי סיסמה במסך כניסה או בהגדרות | כפתור **שכחתי סיסמה** / **שינוי סיסמה** | `sendPasswordResetReliable` קורא ל-`POST /api/auth/password-reset`. אם השרת מוגדר: **נוצר קישור איפוס ב-Admin** + **מייל נשלח דרך Resend**. אם לא — **fallback** ל-`sendPasswordResetEmail` מהדפדפן (מייל מ-Firebase, פחות שליטה). |

---

## חובה בשרת (פרודקשן) — משתני סביבה

העתק ל-`.env.local` (מקומי) / הגדרות Vercel (פרודקשן):

### 1. `FIREBASE_SERVICE_ACCOUNT_JSON`

- **למה:** אתחול **Firebase Admin** בשרת — נדרש ל:
  - `generatePasswordResetLink` (קישור איפוס במייל),
  - `updateUser` (הגדרת סיסמה לבעל מערכת),
  - אימות הרשאות מול Firestore.
- **איך להשיג:** Firebase Console → **Project settings** (גלגל שיניים) → **Service accounts** → **Generate new private key** → קובץ JSON.
- **איך להדביק ב-Vercel:** את כולו **בשורה אחת** (מיניפי JSON): הסר שורות חדשות או השתמש ב-base64 אם אתה מעדיף — בפרויקט הזה מצופה **מחרוזת JSON מלאה** במשתנה (כמו ב-`.env.example`).
- **בלי זה:** איפוס במייל ייפול ל-fallback מהדפדפן; הגדרת סיסמה לבעל מערכת תחזיר **503**.

### 2. `RESEND_API_KEY`

- **למה:** שליחת **מייל איפוס סיסמה** מהשרת (אמין יותר ממייל ברירת המחדל של Firebase).
- **איך:** חשבון ב-[resend.com](https://resend.com) → API Keys → Create.
- **בלי זה:** ה-API `/api/auth/password-reset` מחזיר **503** + `fallback: true` והלקוח ינסה Firebase מהדפדפן.

### 3. `RESEND_FROM_EMAIL`

- דוגמה: `Restaurant Pro <onboarding@resend.dev>` — מתאים לבדיקות בלבד.
- לפרודקשן: **דומיין משלך מאומת ב-Resend**, למשל: `איפוס <noreply@yourdomain.com>`.
- אם ה-From לא תקין / לא מאומת — Resend ייכשל והלקוח יראה שגיאה.

### 4. `NEXT_PUBLIC_APP_URL`

- **למה:** נבנה ממנו `continueUrl` לקישור האיפוס (`…/`) כדי שלאחר לחיצה במייל המשתמש יחזור לאתר הנכון.
- דוגמה: `https://your-app.vercel.app` או כתובת Firebase Hosting.
- ב-Vercel לעיתים מספיק `VERCEL_URL` — הקוד משתמש בו אם `NEXT_PUBLIC_APP_URL` ריק.

### 5. משתני Firebase ללקוח (כבר קיימים)

`NEXT_PUBLIC_FIREBASE_*` — חייבים להתאים לפרויקט Firebase שבו המשתמשים נרשמו (Auth + Email/Password).

---

## Firebase Console — צ’ק-ליסט

### Authentication

1. **Sign-in method:** הפעל **Email/Password** (סיסמה).
2. **Authorized domains:** הוסף את דומיין הפרודקשן (למשל `your-app.vercel.app`) ו-`localhost` לפיתוח.
3. משתמש שמבקש איפוס חייב להיות קיים ב-**Authentication → Users** עם **אותו אימייל** שהזין במסך. אם אין רשומה — תקבל שגיאה «לא נמצא משתמש».

### אימיילים ממערכת Firebase (רק fallback)

אם אין Resend/Admin, האפליקציה קוראת ל-`sendPasswordResetEmail` — אז מייל יוצא מ**תבניות Firebase** (ברירת מחדל). כדי שיפורט:

- אפשר להתאים תבניות ב-**Authentication → Templates** (אופציונלי).
- אם מיילים לא נשלחים כלל — בדוק בספאם, ובדוק שהפרויקט לא בקוואטה של שליחה.

### Firestore (הרשאות להגדרת סיסמה ע״י בעל מערכת/מנהל)

- נתיב `users/{uid}` — תפקיד, `restaurantId`, `isSystemOwner`.
- נתיב `config/admins` — שדה `emails` (או `adminEmails`) לרשימת אימיילים של בעלי מערכת, לפי הלוגיקה הקיימת באפליקציה.

ה-API של **set-user-password** קורא את המסמכים האלה ומאשר פעולה לפי תפקיד.

---

## Resend — מה להקים

1. חשבון + **API Key** → `RESEND_API_KEY`.
2. **Domains:** הוסף דומיין, אמת DNS (SPF/DKIM לפי ההוראות של Resend).
3. הגדר `RESEND_FROM_EMAIL` עם כתובת מהדומיין המאומת.
4. לבדיקה ראשונית אפשר `onboarding@resend.dev` (מוגבל).

---

## בדיקה מהירה (דיבוג)

| תסמין | פעולה |
|--------|--------|
| «שליחת אימייל לא מוגדרת בשרת» / 503 + fallback | בדוק `FIREBASE_SERVICE_ACCOUNT_JSON` + `RESEND_API_KEY` ב-Vercel. |
| איפוס מצליח ב-UI אבל אין מייל | בדוק Resend Dashboard → Logs; בדוק ספאם; בדוק `RESEND_FROM_EMAIL`. |
| «לא נמצא משתמש עם אימייל זה» | האימייל לא קיים ב-**Firebase Authentication**. |
| בעל מערכת לא מצליח «הגדרת סיסמה» | חובה `FIREBASE_SERVICE_ACCOUNT_JSON`; בדוק לוג שרת ל-500. |

---

## מסלולי API (למפתחים / ל-Claude)

- `POST /api/auth/password-reset` — גוף: `{ "email": "..." }`. דורש Admin + Resend; אחרת 503 + fallback.
- `POST /api/auth/set-user-password` — כותרת: `Authorization: Bearer <Firebase ID token>`, גוף: `{ "targetUid", "newPassword" }`. דורש Admin + Firestore.

---

## מה להעביר ל-Claude (פרומפט קצר)

> הקפד בפרודקשן על: `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON מלא בשורה אחת), `RESEND_API_KEY`, `RESEND_FROM_EMAIL` מדומיין מאומת, ו-`NEXT_PUBLIC_APP_URL`. ב-Firebase: Email/Password מופעל, דומיין הייצור מורשה ב-Authorized domains. איפוס למשתמש עצמו עובר דרך `/api/auth/password-reset` + Resend; בעל מערכת מגדיר סיסמה ישירות ב-`/api/auth/set-user-password` בלי מייל.

---

*עודכן לפי מימוש המערכת: `app/api/auth/password-reset`, `app/api/auth/set-user-password`, `lib/password-reset-client.ts`, `lib/set-user-password-client.ts`.*
