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

## 5. מה לא השתנה (קוד האפליקציה)

- **`contexts/app-context.tsx`** — רק הגדרת טיפוסים ו־Provider; אין טעינת נתונים שם.

### 5.1 תיקון נפרד: `firestore.rules` — רק **מסמכי `users`**, לא `restaurants`

**מה השתנה בכללים (קומיט `6e86aaf`):**

- ב־`match /users/{userId}` נוסף ל־**`allow list`** ול־**`allow get`** התנאי **`isSystemOwnerUser()`**.
- **מטרה:** משתמש עם `users/{uid}.isSystemOwner == true` **בלי** `restaurantId` (או עם `restaurantId` שלא תואם לאף משתמש אחר) — קודם לכן **`getDocs(collection(db, "users"))`** נכשל בשקט / החזיר ריק, כי החוק היה: רק `isConfigAdmin()` או משתמשים עם **אותו** `restaurantId` כמו המשתמש המחובר.
- **לא שינינו** את החוקים של **`restaurants`** — שם כבר היה (ועדיין):  
  `allow list, create, update, delete: if request.auth != null;`  
  כלומר **רשימת מסעדות מ־Firestore לא תלויה בשיוך למסעדה**.

---

## 5.2 למה בפאנל ניהול רואים מסעדות ובהגדרות לפעמים לא?

**זה לא אותו מקור נתונים באותה צורה:**

| מקום | מאיפה הרשימה |
|------|----------------|
| **הגדרות** (`SystemOwnerDirectory`) | רק מ־**`restaurants` ב־React context** — נטען ב־**`app/page.tsx`** (מאזין `onSnapshot` על `restaurants` כש־`effectiveSystemOwner`). |
| **פאנל ניהול** (`admin-panel.tsx`) | בנוסף ל־context, יש **`loadSystemOwnerData`** וכו' שקוראים ישירות **`getDocs(collection(db, "restaurants"))`** ל־state **מקומי** של הפאנל. |

לכן אפשר לראות מסעדות בפאנל (שאילתה ישירה + חוק `restaurants` מאפשר `list` לכל מחובר), בעוד שבהגדרות עדיין **ריק** אם משהו ב־**context** ב־`page.tsx` לא התמלא (מאזין, תזמון, שגיאה בקונסול) — **זה לא בגלל חוק `users` על רשימת המסעדות**.

**שיוך למסעדה למשתמש:** התיקון ב־rules ל־**`users`** עוזר ל־**טעינת רשימת המשתמשים** (`loadU` בהגדרות) ול־פעולות שמבוססות על `getDocs(users)`, **לא** אמור להיות התנאי שמציג או מסתיר את **רשימת המסעדות** מ־Firestore (אלא אם יש באג נוסף בקוד שמקשר בין השניים).

---

## 6. אם הבעיה נשארת — רשימת בדיקות

1. **Vercel:** שהדיפלוי האחרון (לפחות `3b0a389`) **הושלם בהצלחה**.
2. **דפדפן:** ניקוי מטמון / חלון פרטי, או בדיקה במכשיר אחר.
3. **שדה החיפוש** מעל הרשימה: האם יש טקסט? לרוקן — אם הרשימה מופיעה, זו אותה בעיית autofill.
4. **קונסול:** האם יש שגיאות אדומות (Firestore / הרשאות)?
5. **`NEXT_PUBLIC_FIREBASE_*`** ב־Vercel — תואם לפרויקט הנכון.

---

## ניקוי אחרי ייצוב (אופציונלי)

- הוסר `useEffect` ב־`page.tsx` שקרא `refreshRestaurants()` בכניסה להגדרות כשהרשימה ריקה — כפילות מול `onSnapshot`.
- הוסר `key` דינמי על פאנל «לפי מסעדה» — מפחית רימאונטים מיותרים כשמשנים רשימת מסעדות.

---

## קומיטים רלוונטיים ב־`main`

| קומיט   | תיאור קצר |
|---------|-----------|
| `22111b2` | מאזין Firestore למסעדות (בעל מערכת) |
| `d50f5c9` | לוג דיבוג ב־settings (הוסר אחר כך) |
| `3b0a389` | חיפוש: autofill + פילטר בטוח + לוג ב־SystemOwnerDirectory |
| `6e86aaf` | Firestore: `users` list/get — `isSystemOwnerUser()` |
