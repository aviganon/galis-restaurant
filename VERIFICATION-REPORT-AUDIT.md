# דוח בדיקה עמוקה — אימות נתונים ושמירה

**תאריך:** מרץ 2025

## 1. מבנה Firestore — מאומת ✓

| נתיב | שימוש |
|------|-------|
| `restaurants/{id}` | מסעדות |
| `restaurants/{id}/ingredients` | רכיבים של המסעדה |
| `restaurants/{id}/recipes` | מנות ומתכונים |
| `restaurants/{id}/appState/assignedSuppliers` | ספקים משויכים |
| `restaurants/{id}/appState/salesReport_*` | דוח מכירות |
| `ingredients` | קטלוג גלובלי (בעלים) |
| `suppliers` | מטא-דאטה ספקים |
| `users` | פרופילי משתמשים |
| `config/admins` | רשימת אדמינים |

## 2. זרימות CRUD — מאומתות ✓

### רכיבים
- **הוספה/עריכה/מחיקה (מסעדה):** `restaurants/{id}/ingredients` — עקבי
- **הוספה/עריכה (גלובלי):** `ingredients` — עקבי
- **העלאה:** שומר ל־ingredients או restaurants לפי בחירה

### ספקים
- **ספק חדש למסעדה:** שומר ל־`restaurants/{id}/ingredients` עם שם ספק
- **הקצאת ספק:** מעדכן `assignedSuppliers` ומעתיק רכיבים
- **מחיקת ספק:** מנקה ספק מרכיבים

### עץ מוצר
- **טעינה:** recipes + ingredients + assignedSuppliers
- **שמירה:** `restaurants/{id}/recipes/{name}` עם merge
- **מתכונים מורכבים:** באותה תת-אוסף עם `isCompound: true`

### התחזות כמסעדה
- `effectiveRestaurantId` מועבר לכל הרכיבים — נתונים נשמרים למסעדה הנכונה

## 3. תיקונים שבוצעו

### 🔴 קריטי: מתכון מתמונה — לא נשמר
**בעיה:** העלאת תמונת מתכון והאישור לא שמר מנות ל-Firestore.

**תיקון:** `upload.tsx` — `handleConfirmDishes` שומר כעת ל־`restaurants/{id}/recipes` (כמו בעץ מוצר) וקורא ל־`refreshIngredients`.

### 🟡 בינוני: ייבוא הגדרות — ללא רענון
**בעיה:** אחרי ייבוא גיבוי, מסכים אחרים הציגו נתונים ישנים.

**תיקון:** `settings.tsx` — קריאה ל־`refreshIngredients()` אחרי ייבוא מוצלח.

### 🟡 בינוני: מגבלת Batch ב-Firestore
**בעיה:** Firestore מוגבל ל־500 פעולות ל-batch. ייבוא גדול היה עלול להיכשל.

**תיקון:** `settings.tsx` — פיצול הייבוא ל-batches של 500.

## 4. המלצות נוספות

- **מלאי:** עמוד המלאי קורא נתונים בלבד. עדכון מלאי מתבצע דרך רכיבים או העלאה — התנהגות מתועדת.
- **sync-supplier-ingredients:** אם יש הרבה רכיבים למסעדה, לשקול פיצול ל-batches של 500.

## 5. סיכום

| קטגוריה | סטטוס |
|---------|-------|
| נתיבי Firestore | עקביים, ללא אי-התאמות |
| רכיבים CRUD | עקבי |
| ספקים CRUD | עקבי |
| עץ מוצר | עקבי |
| התחזות | משתמש ב־effectiveRestaurantId נכון |
| רענון אחרי שמירה | קיים; נוסף בייבוא הגדרות ובמתכון מתמונה |
| מגבלת Batch | טופל בייבוא הגדרות |
