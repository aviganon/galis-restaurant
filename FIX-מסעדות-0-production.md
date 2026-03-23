# תיעוד תיקונים: "מסעדות (0)" / רשימת מסעדות ריקה (בעל מערכת)

**הערה:** אם הבעיה **עדיין** מופיעה אחרי הפריסה האחרונה — יש לבדוק בנפרד: deploy ב-Vercel, מטמון דפדפן, ושדה החיפוש ברשימת המסעדות (לנקות טקסט אם יש).

---

## 1. הבעיה המקורית

- ב־**production** (galis.app), בטאב **הגדרות → לפי מסעדה**, הוצג **"מסעדות (0)"** בעוד שב־localhost הכול עבד.
- המקור ל־`restaurants` הוא **לא** `app-context.tsx` בלבד — הקונטקסט רק מעביר props; הטעינה ב־**`app/page.tsx`**.

---

## 2. תיקון ב־`app/page.tsx` (קומיט `22111b2`)

**מה נעשה:**

- **לפני:** טעינת כל המסעדות לבעל מערכת (`effectiveSystemOwner`) בוצעה **פעם אחת** ב־`onAuthStateChanged` עם `getDocsFromServer` / `getDocs`.
- **אחרי:** לבעל מערכת מוגדר **`onSnapshot`** על `collection(db, restaurantsCollection)` — מאזין בזמן אמת, פחות תלוי במרוצים או במטמון ריק בפרודקשן.
- **גיבוי:** אם המאזין נכשל — ניסיון `getDocsFromServer` ואז `getDocs`.
- **ניקוי:** עצירת המאזין ב־logout, במסלול משתמש שאינו בעל מערכת, וב־cleanup של ה־effect; באותו logout גם איפוס `restaurants` / `currentRestaurantId` / `isSystemOwner` לפי הצורך.
- **בחירת מסעדה:** עדכון `currentRestaurantId` כשהרשימה מתעדכנת — שמירה על מזהה קיים אם עדיין קיים ברשימה; אחרת מעבר לראשונה ברשימה; עדכון שם תצוגה (כולל `queueMicrotask` כדי לא לעדכן state בתוך updater של state אחר).

**קבצים:** `app/page.tsx` (ייבוא `onSnapshot`).

---

## 3. תיקון ב־`components/settings.tsx` (קומיט `d50f5c9`, הוסר ב־`3b0a389`)

**מה נעשה:**

- נוסף **זמנית** `console.log` ב־`useEffect` עם `restaurants` ו־`isSystemOwner` לדיבוג בפרודקשן.
- **הוסר** בקומיט התיקון של `SystemOwnerDirectory` כדי לצמצם רעש בקונסול.

---

## 4. תיקון ב־`components/system-owner-directory.tsx` (קומיט `3b0a389`)

**תצפית מהלוגים:** ב־Settings הופיע `restaurants` עם מספר מסעדות ו־`isSystemOwner=true`, אבל ב־UI עדיין **"מסעדות (0)"**.

**הסבר טכני:**

- הכותרת מציגה **`filteredRestaurants.length`**, לא `restaurants.length`.
- `filteredRestaurants` מסנן לפי **`search`** (שדה החיפוש).
- שדה החיפוש הוא ה־`Input` הראשון בפאנל — **דפדפנים עלולים למלא אותו אוטומטית** (למשל אימייל), ואז הפילטר מחזיר **אפס** תוצאות למרות שיש מסעדות.

**מה נעשה:**

1. **`Input` של החיפוש:**  
   `id` / `name` ייחודיים (`system-owner-directory-search`),  
   `autoComplete="off"`,  
   `autoCorrect="off"` — כדי להפחית מילוי אוטומטי שמסנן את כל הרשימה.

2. **`filteredRestaurants` (useMemo):**  
   שימוש ב־`String(...)` ל־`name`, `branch`, `id` — מניעת קריסה אם ב־Firestore יש ערך לא־מחרוזת; `Array.isArray(restaurants)` לפני שימוש.

3. **`console.log` זמני:**  
   `SystemOwnerDirectory props restaurants: <length>` ב־`useEffect` תלוי ב־`restaurants` — **להסיר** אחרי אימות בפרודקשן.

---

## 5. מה לא השתנה

- **`contexts/app-context.tsx`** — רק הגדרת טיפוסים ו־Provider; אין טעינת נתונים שם.
- **`firestore.rules`** — לא שונו בהקשר התיקונים האלה; `list` על `restaurants` מותר למשתמש מחובר.

---

## 6. אם הבעיה נשארת — רשימת בדיקות

1. **Vercel:** שהדיפלוי האחרון (לפחות `3b0a389`) **הושלם בהצלחה**.
2. **דפדפן:** ניקוי מטמון / חלון פרטי, או בדיקה במכשיר אחר.
3. **שדה החיפוש** מעל הרשימה: האם יש טקסט? לרוקן — אם הרשימה מופיעה, זו אותה בעיית autofill.
4. **קונסול:** האם יש שגיאות אדומות (Firestore / הרשאות)?
5. **`NEXT_PUBLIC_FIREBASE_*`** ב־Vercel — תואם לפרויקט הנכון.

---

## קומיטים רלוונטיים ב־`main`

| קומיט   | תיאור קצר |
|---------|-----------|
| `22111b2` | מאזין Firestore למסעדות (בעל מערכת) |
| `d50f5c9` | לוג דיבוג ב־settings (הוסר אחר כך) |
| `3b0a389` | חיפוש: autofill + פילטר בטוח + לוג ב־SystemOwnerDirectory |
