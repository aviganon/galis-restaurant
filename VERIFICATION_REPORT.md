# דוח בדיקה — השוואה למערכת הישנה

## סיכום ביצועים

| זרימה | מערכת ישנה | מערכת חדשה | סטטוס |
|------|------------|------------|-------|
| מחירון ספקים → Firestore | ✅ | ✅ | תואם |
| חשבונית ספק → Firestore | ✅ | ✅ | תואם |
| ייבוא מנות → Firestore | ✅ | ✅ | תואם |
| דוח מכירות → Firestore | ✅ | ✅ | **תוקן** |
| טעינת מתכונים מ-Firestore | ✅ | ✅ | **תוקן** |
| טעינת רכיבים מ-Firestore | ✅ | ✅ | **תוקן** |
| שמירה בעריכה (add/edit/delete) | ✅ | ✅ | **תוקן** |

---

## הבדל בין מנהל לבעלים

| | **מנהל** | **בעלים** |
|---|----------|-----------|
| **קטלוג רכיבים** | רואה את כל הקטלוג הגלובלי | רואה קטלוג מסונן לפי `assignedSuppliers` + רכיבים של המסעדה |
| **העלאת מחירון** | שומר ל-`ingredients` (גלובלי) | שומר ל-`restaurants/{id}/ingredients` בלבד |
| **מחיקת רכיב** | יכול למחוק מכל מקום | יכול למחוק רק רכיבים ש-`createdBy === 'restaurant'` |
| **assignedSuppliers** | לא משפיע — רואה הכל | מסנן אילו רכיבים מהקטלוג הגלובלי מוצגים |

---

## מיקומי שמירה ב-Firestore (כמו במערכת הישנה)

### 1. מחירי ספקים (מחירון / חשבונית)

| תפקיד | קולקציה | דוגמה |
|-------|---------|-------|
| **מנהל** | `ingredients/{שם_רכיב}` | קטלוג גלובלי |
| **בעלים** | `restaurants/{מסעדה}/ingredients/{שם_רכיב}` | רכיבים למסעדה |

**שדות:** `price`, `unit`, `supplier`, `lastUpdated`, `createdBy`

### 2. מתכונים / מנות

| מיקום | דוגמה |
|-------|-------|
| `restaurants/{מסעדה}/recipes/{שם_מנה}` | מתכון לכל מנה |

**שדות:** `name`, `category`, `sellingPrice`, `ingredients[]`, `isCompound`

### 3. מפתח Claude API

| מיקום | דוגמה |
|-------|-------|
| `config/anthropic` | `{ key, updatedAt }` |

---

## תיקונים שבוצעו

1. **product-tree — ייבוא מנות:**
   - לפני: `setDishes` בלבד (state מקומי)
   - אחרי: שמירה ל-`restaurants/{id}/recipes/{dishName}` ב-Firestore

2. **upload — בעלים ללא מסעדה:**
   - הוספת בדיקה: אם אין `currentRestaurantId` ו-`userRole === "owner"` → toast שגיאה

3. **upload — batch ריק:**
   - קריאה ל-`batch.commit()` רק אם יש פריטים לשמירה

4. **product-tree — קטלוג גלובלי לבעלים:**
   - טעינת `assignedSuppliers` מ-`appState`
   - בעלים עם ספקים משויכים רואים קטלוג גלובלי מסונן + overlay של המסעדה

---

## מה עוד לא מחובר

4. **runSmartMatch:**
   - במערכת הישנה יש התאמה חכמה לספקים קיימים לפני שמירה — לא קיים במערכת החדשה

---

## עדכון — הושלם

1. **product-tree — טעינה מ-Firestore:** טעינת `recipes` ו-`ingredients` מ-Firestore
   - מנהל: קטלוג גלובלי (`ingredients`) + overlay של `restaurants/{id}/ingredients`
   - בעלים: אם יש `assignedSuppliers` — קטלוג גלובלי מסונן לפי הספקים + overlay; אחרת רק `restaurants/{id}/ingredients`
2. **product-tree — שמירה בעריכה:** הוספה / עריכה / מחיקה של מנה שומרת ל-Firestore
3. **דוח מכירות (type s):** שמירה ל-`appState/salesReport_{restId}` עם `dailySales`
