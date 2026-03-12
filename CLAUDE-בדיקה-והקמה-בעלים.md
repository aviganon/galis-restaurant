# הוראות לקלוד: בדיקה והקמת בעלים

## המשימה

כאשר משתמש לא רואה את **פאנל הניהול** או **התחזה כמסעדה** — בדוק אם הוא מוגדר כבעלים, ואם לא — הקם.

---

## שלב 1: בדיקה

הרץ:
```bash
npm run check:admin
```

או עם אימייל ספציפי:
```bash
EMAIL=user@example.com npm run check:admin
```

הסקריפט מדווח: האם המסמך קיים, האם האימייל ברשימה. **לא משנה כלום.**

דרוש: `scripts/service-account.json` (מפתח מ-Firebase Console). אם אין — הסקריפט מנחה לבדיקה ידנית.

---

## שלב 2: הקמה (אם לא קיים)

### אפשרות א: הרצת סקריפט

1. ודא שקיים `scripts/service-account.json` (מפתח מ-Firebase Console → Service Accounts → Generate new private key)
2. הרץ: `npm run add:admin`
3. הסקריפט:
   - בודק אם האימייל כבר ברשימה
   - אם כן — מדפיס "האימייל כבר ברשימה" ויוצא
   - אם לא — מוסיף את האימייל

### אפשרות ב: ידנית ב-Firebase Console

אם אין קובץ Service Account:

1. גלוש ל־https://console.firebase.google.com/project/galis-6ebbc/firestore
2. צור/ערוך: Collection `config` → Document `admins`
3. הוסף שדה `emails` (מערך) עם האימייל: `["ganonavi@gmail.com"]`

---

## סיכום

| שלב | פקודה | תיאור |
|-----|-------|-------|
| בדיקה | `npm run check:admin` | בודק אם האימייל ברשימה — לא משנה כלום |
| הקמה | `npm run add:admin` | מוסיף אם חסר — לא יכפיל אם כבר קיים |
| אין Service Account | — | הנחה למשתמש לעשות ידנית ב-Firebase Console |
