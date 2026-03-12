# הגדרת Firestore — התאמה למבנה הקיים

## מבנה ה-Database שלך (לפי המסכים)

- `appState` — supplierPhones וכו'
- `config` — anthropic (API key), **admins** (רשימת מנהלים)
- `ingredients` — רכיבים
- `inviteCodes` — קודי הזמנה
- `invoiceLog` — לוג חשבוניות
- `restaurants` — מסעדות

## מה חסר — צריך ליצור

### 1. מסמך `config/admins` (חובה למנהלים)

אין אצלך collection בשם `users`, אז המערכת משתמשת ב-`config/admins` כדי לזהות מנהלים.

**ב-Firebase Console → Firestore Database:**

1. לחץ על `config` (או צור collection בשם `config` אם אין)
2. לחץ **Add document**
3. **Document ID:** `admins`
4. הוסף שדה:
   - **Field:** `emails`
   - **Type:** array
   - **Value:** `["ganonavi@gmail.com"]` (הכנס את המייל שלך)

### 2. מסמכי `restaurants` (אם אין)

אם `restaurants` ריק, הוסף מסמכים עם השדות:
- `name` (string)
- `branch` (string, אופציונלי)
- `emoji` (string, אופציונלי)

### 3. פרויקט Firebase — `restaurant-pro` vs `restaurant-pro-2026`

המסכים שלך מראים פרויקט **restaurant-pro**, והקוד מחובר ל-**restaurant-pro-2026**.

אם הנתונים נמצאים ב-`restaurant-pro`:

1. Firebase Console → **restaurant-pro** → Project Settings (⚙️) → General
2. גלול ל-**Your apps** → הוסף Web app או העתק את הקונפיג
3. העתק את `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`
4. עדכן ב-`lib/firebase.ts` את הערכים האלה

## סיכום

| מה | איפה |
|----|------|
| רשימת מנהלים | `config/admins` → שדה `emails` (מערך) |
| מסעדות | `restaurants` |
| משתמשים (אופציונלי) | `users/{uid}` עם `role`, `restaurantId` |
