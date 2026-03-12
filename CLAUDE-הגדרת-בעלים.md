# איך להגדיר משתמש כבעלים (System Owner)

כדי לראות את **פאנל הניהול**, **התחזה כמסעדה** וכל המסעדות במערכת — המשתמש חייב להיות **בעלים** (ברשימת האדמינים).

---

## אפשרות 1: שדה isSystemOwner ב-users (למשתמש admin קיים)

אם יש לך משתמש עם `users.role = "admin"` שרואה רק מסעדה אחת — הוסף לו:

**א. ידנית ב-Firestore:**
- מסמך: `users/{userId}`
- שדה: `isSystemOwner` = `true` (boolean)

**ב. סקריפט:**
```bash
EMAIL=your-admin@email.com npm run set:system-owner
```
(דרוש `scripts/service-account.json`)

אחרי זה המשתמש יראה את כל המסעדות ותפריט בעלים.

---

## אפשרות 2: סקריפט אוטומטי (מומלץ)

1. Firebase Console → Project Settings → Service Accounts → **Generate new private key**
2. שמור את הקובץ JSON בשם: `scripts/service-account.json`
3. הרץ: `npm run add:admin`

הסקריפט מוסיף את ganonavi@gmail.com אוטומטית. לעריכת האימייל — ערוך את `scripts/add-admin.ts`.

---

## אפשרות 3: ידנית ב-Firebase Console

### איפה מוגדר?

Firebase Firestore → **Collection:** `config` → **Document:** `admins`

**נתיב מלא:** `config/admins`

---

## מה צריך להיות במסמך?

המסמך `config/admins` חייב להכיל שדה עם **מערך של כתובות אימייל**.

### אפשרות 1: שדה `emails`
```json
{
  "emails": ["your-email@gmail.com", "another-admin@example.com"]
}
```

### אפשרות 2: שדה `adminEmails`
```json
{
  "adminEmails": ["your-email@gmail.com"]
}
```

---

## שלבים ב-Firebase Console

1. גלוש ל־https://console.firebase.google.com/project/galis-6ebbc/firestore
2. בדוק אם קיימת **Collection** בשם `config`
   - אם לא — צור אותה (לחץ "Start collection", שם: `config`)
3. בדוק אם קיים **Document** בשם `admins` בתוך `config`
   - אם לא — צור אותו (לחץ "Add document", ID: `admins`)
4. הוסף שדה:
   - **Field:** `emails`
   - **Type:** `array`
   - **Value:** הוסף פריטים (strings) — כל פריט = כתובת אימייל אחת
5. הזן את **האימייל שבו אתה נכנס** למערכת (בדיוק כמו ב-Firebase Authentication)
6. שמור

---

## חלופה: מסמך `config/adminEmails`

אם המסמך `config/admins` לא קיים, המערכת בודקת גם `config/adminEmails`.

אותו מבנה: שדה `emails` או `adminEmails` עם מערך של כתובות.

---

## איך לוודא שזה עובד?

1. הוצא מהמערכת (יציאה)
2. היכנס שוב
3. אם האימייל ברשימה — תראה:
   - 🛡️ פאנל ניהול
   - התחזה כמסעדה (בפאנל)
   - גישה לכל המסעדות

---

## טיפ

האימייל חייב להיות **זהה** לזה שב-Firebase Authentication (כולל רישיות — המערכת משווה באותיות קטנות).
