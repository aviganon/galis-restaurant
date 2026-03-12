# בדיקת עומק — נתונים לפי משתמש

## סיכום

בוצעה בדיקה עמוקה למערכת. כל משתמש מושך את הנתונים שלו מ-Firebase לפי תפקידו ומסעדתו. עודכנו כללי האבטחה ב-Firestore.

---

## זרימת נתונים לפי תפקיד

| תפקיד | מקור מסעדות | נתונים שמוצגים |
|-------|-------------|----------------|
| **בעלים (config/admins)** | כל המסעדות מ-`restaurants` | כל הנתונים של המסעדה הנבחרת (או בהתחזה) |
| **מנהל** | `users.restaurantId` → מסעדה אחת | רק המסעדה שלו |
| **משתמש** | `users.restaurantId` או `invitedEmails` | רק המסעדה שלו, לפי הרשאות |

---

## נתונים לפי מסעדה (currentRestaurantId)

כל הקומפוננטות משתמשות ב-`currentRestaurantId` מ-AppContext:

| קומפוננטה | נתונים | נתיב Firestore |
|-----------|--------|----------------|
| Dashboard | מנות, רכיבים, מכירות | `restaurants/{id}/recipes`, `ingredients`, `appState/salesReport_*` |
| עץ מוצר | מנות, רכיבים | `restaurants/{id}/recipes`, `ingredients` |
| רכיבים | רכיבים | `restaurants/{id}/ingredients` |
| מלאי | רכיבים | `restaurants/{id}/ingredients` |
| ספקים | רכיבים (לפי ספק) | `restaurants/{id}/ingredients` |
| הזמנות ספקים | הזמנות | `purchaseOrders` (where restaurantId) |
| העלאה | רכיבים, salesReport | `restaurants/{id}/ingredients`, `appState/salesReport_*` |
| דוחות | מנות, מכירות | `restaurants/{id}/recipes`, `appState/salesReport_*` |
| עלויות תפריט | מנות, רכיבים | `restaurants/{id}/recipes`, `ingredients` |
| הגדרות | מנות, רכיבים | `restaurants/{id}/recipes`, `ingredients` |

---

## שינויים שבוצעו

### 1. Firestore Rules — `firestore.rules`

**users:**
- **list** — מנהל רואה רק משתמשים באותה מסעדה (לפי `restaurantId`)
- **update** — מנהל יכול לעדכן הרשאות של משתמשים באותה מסעדה

**restaurants (תת-אוספים):**
- **appState** — קריאה/כתיבה רק לבעלים/מנהל של המסעדה; משתמש מוזמן יכול לקרוא `invitedEmails` רק אם האימייל שלו ברשימה
- **recipes, ingredients** — קריאה/כתיבה רק לבעלים/מנהל/משתמש של המסעדה

**purchaseOrders:**
- קריאה/כתיבה רק למסמכים שבהם `restaurantId` תואם את `restaurantId` של המשתמש

### 2. page.tsx — משתמשים מוזמנים

- הוספת `try/catch` בלולאת בדיקת `invitedEmails` — אם אין הרשאה לקרוא (המשתמש לא מוזמן), ממשיכים למסעדה הבאה

---

## פריסת הכללים

להפעלת הכללים המעודכנים:

```bash
firebase deploy --only firestore:rules
```

---

## הערות

- **config/admins** — שמור את האימיילים ב־`emails` באותיות קטנות (lowercase) כדי שההתאמה תעבוד
- **משתמש מוזמן** — האימייל ברשימת `invitedEmails` חייב להתאים בדיוק לאימייל ההתחברות

## בדיקות מומלצות

1. **בעלים** — התחברות, בחירת מסעדה, התחזה כמסעדה, יצירת מסעדה
2. **מנהל** — התחברות, רשימת משתמשים, עדכון הרשאות, הוספת משתמש
3. **משתמש** — התחברות (אחרי הזמנה), צפייה רק בדפים המורשים
4. **משתמש מוזמן** — התחברות ראשונה עם אימייל ברשימת ההזמנות
