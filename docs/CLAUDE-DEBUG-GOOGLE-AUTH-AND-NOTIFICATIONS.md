# הנחיות ל-Claude — דיבוג כניסת Google (במיוחד Safari) + הפעלת התראות

מסמך זה מיועד להדבקה לעוזר AI (Claude וכו׳) כדי לבדוק **שיטתית** למה כניסה עם Google עדיין נכשלת, ואילו **הגדרות חובה** נדרשות כדי שהתראות (דחיפה + היסטוריה) יעבדו בפרויקט **Galis / Restaurant Pro**.

---

## חלק א׳ — כניסת Google נכשלת / חוזרים למסך התחברות

### הקשר בקוד (נקודות עיגון)

- `components/login-screen.tsx` — `handleGoogleSignIn` / `handleGoogleRegister`: ב־Safari/WebKit אמור לרוץ **`signInWithRedirect`**; אחרת **`signInWithPopup`**. לפני redirect נשמר intent ב־`sessionStorage`/`localStorage` (`saveGoogleAuthDraft`).
- `lib/google-auth-redirect.ts` — **`getGoogleRedirectResultOnce`**: קריאה **אחת** ל־`getRedirectResult` לכל טעינת דף (מניעת כפילות ב־Strict Mode).
- `app/page.tsx` — ב־`useEffect` נקרא מיד `getGoogleRedirectResultOnce(auth)`; **במקביל** `onAuthStateChanged` טוען פרופיל מ־`users/{uid}`.
- אם אין מסמך `users/{uid}` (ולא מייל ב־`config/admins` לפי הלוגיקה שם) — האפליקציה עושה **`signOut`** ומחזירה למסך כניסה — **נראה בדיוק כמו „לא נכנס” אחרי OAuth מוצלח**.

### רשימת בדיקות (לפי סדר עדיפות)

1. **Firebase Console → Authentication → Settings → Authorized domains**  
   ודא שרשומים כל הדומיינים שבהם המשתמש נכנס בפועל, למשל:  
   `localhost`, דומיין **Vercel**, דומיין **`*.web.app` / Custom domain** של Hosting, וכו׳.  
   חוסר דומיין = OAuth יכול להיכשל או לא להשלים session.

2. **Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID (סוג Web)**  
   - **Authorized JavaScript origins**: אותם מקורות (`https://...`, ללא path).  
   - **Authorized redirect URIs**: חייבים לכלול את מסלולי ה־redirect של Firebase Auth, בדרך כלל:  
     `https://<PROJECT_ID>.firebaseapp.com/__/auth/handler`  
     ואם משתמשים ב־authDomain מותאם — גם `https://<AUTH_DOMAIN>/__/auth/handler`.  
   אי־התאמה כאן גורמת לבעיות אחרי Google, במיוחד ב־redirect.

3. **`authDomain` ב־`firebaseConfig`** (משתנה `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`)  
   חייב להתאים למה שמוגדר בפרויקט Firebase (לרוב `xxx.firebaseapp.com` או custom domain מאושר).

4. **מסמך Firestore `users/{uid}`**  
   אחרי התחברות Google ראשונה: האם המשתמש **קיים** במערכת?  
   אם המשתמש לא נרשם עם קוד הזמנה / לא נוצר לו מסמך — הקוד ב־`app/page.tsx` יבצע sign out.  
   לבדוק ב־Console → Firestore אם יש `users/<אותו uid>`.

5. **מצב דפדפן**  
   - חלון פרטי / חסימת אחסון / „מניעת מעקב חוצה־אתרים” ב־Safari — עלולים לשבור session אחרי redirect.  
   - לנסות חלון רגיל, אותו דומיין יציב.

6. **App Check (אם הופעל Enforcement על Auth)**  
   ב־Firebase → App Check: אם יש **Enforce** על Authentication לפני שהאפליקציה מוגדרת נכון עם `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, כניסה עלולה להיכשל בדפדפנים מסוימים. לבדוק מצב Monitor/Enforce ולוגים.

7. **ריצה כפולה של `getRedirectResult`**  
   הקוד אמור למנוע זאת דרך `getGoogleRedirectResultOnce`. אם שוכפל מודול או יובא פעמיים בבנדלים שונים — תיאורטית יכול להישבר; לבדוק שיש **ייבוא יחיד** מהקובץ `lib/google-auth-redirect.ts`.

8. **שגיאות בקונסולת הדפדפן / Network**  
   לחפש `auth/` (קודי Firebase Auth), חסימת popup/redirect, או CORS.

9. **גרסת Firebase JS ב־`firebase-messaging-sw.js` (לא ישירות ל־Google login, אבל לאותו דומיין)**  
   אם יש Service Worker ישן שתופס ניווט — נדיר, אבל אפשר לבדוק „Unregister” ב־DevTools → Application.

### מה לבקש מהמשתמש כדי לצמצם

- הדומיין המדויק בשורת הכתובת בעת הכניסה (Vercel מול `web.app`).  
- האם מדובר במשתמש **חדש** בלי `users/{uid}` או משתמש ותיק.  
- צילום/העתקת שגיאה מקונסולת Safari (Console) מיד אחרי החזרה מהדף של Google.

---

## חלק ב׳ — הגדרות כדי שההתראות יעבדו

המערכת משתמשת ב־**שלושה מסלולים** שונים (לא להחליף ביניהם בבלבול):

| מסלול | מה זה | דורש |
|--------|--------|------|
| **התראות בתוך האפליקציה (פעמון)** | מסמכים תחת `users/{uid}/notifications` | פריסת **Firestore rules** + **Cloud Function** `lowStockPushDigest` (כותבת גם לשם) |
| **Web Push (FCM בדפדפן)** | טוקן ב־`users/{uid}/pushTokens/{tokenId}`; שליחה מ־Admin SDK בפונקציה | **VAPID**, **HTTPS**, הרשאת דפדפן, קובץ **`/firebase-messaging-sw.js`** |
| **מייל (מלאי נמוך ידני)** | Route `/api/notifications/low-stock-email` | **Vercel** (או סביבה עם Node) + `FIREBASE_SERVICE_ACCOUNT_JSON` + Resend — לא עובד על Hosting סטטי בלבד |

### 1. משתני סביבה (חובה לדחיפה בדפדפן)

- **`NEXT_PUBLIC_FIREBASE_VAPID_KEY`** — מפתח ה־Web Push מ־Firebase Console → Project settings → **Cloud Messaging** → **Web Push certificates** (Key pair).  
- חייב להיות מוגדר ב־**Vercel Environment Variables**, ב־**GitHub Secrets** (ל־CI/Deploy אם הבילד צריך אותו), וב־**`.env.local`** מקומית.  
- בלי זה הכפתור „הפעל התראות דחיפה” מציג הודעה על חוסר VAPID (`components/web-push-settings.tsx`).

### 2. שאר משתני Firebase הציבוריים

כמו ב־`.env.example`: `NEXT_PUBLIC_FIREBASE_API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID` — אחרת `getToken` / אתחול לא יעבדו.

### 3. Service Worker

- הקובץ **`public/firebase-messaging-sw.js`** נבנה/מתעדכן בסקריפט **`scripts/inject-fcm-sw.mjs`** ב־`prebuild` (משתמש ב־`.env.local` / env בזמן build).  
- הגרסה ב־`importScripts` חייבת להתאים לגרסת Firebase בפרויקט (למשל `12.10.0`).  
- הדפדפן חייב לשרת את ה־SW מאותו **origin** כמו האפליקציה, בדרך כלל **HTTPS**.

### 4. הרשאות ומסעדה

- המשתמש לוחץ על הפעלת דחיפה ב־**הגדרות** (`WebPushSettings` בתוך מסך ההגדרות).  
- בקוד נשמר `restaurantId` על מסמך הטוקן.  
- הפונקציה **`lowStockPushDigest`** (`functions/src/low-stock-push.ts`) שולחת רק לטוקנים שבהם **`restaurantId` תואם למסעדה** עם מלאי נמוך.  
- לכן: לבחור מסעדה בהקשר הנכון לפני הפעלת דחיפה; בעלי מערכת — לפי ההנחיות בטקסטי ה־UI (התחזה / בחירת מסעדה).

### 5. הגדרות מסעדה — `notifyLowStock`

- מסמך: `restaurants/{restaurantId}/appState/notificationSettings` — שדה `notificationSettings.notifyLowStock` אם **`false`** — הפונקציה **מדלגת** על המסעדה.

### 6. Firebase Blaze + פריסת Functions

- **`lowStockPushDigest`** — מתוזמנת (יומית), דורשת תוכנית **Blaze** ופריסה ל־**`europe-west1`** (כפי שבקוד).  
- אחרי `firebase deploy --only functions` לוודא שהפונקציה קיימת ואין שגיאות ב־Logs.

### 7. חוקי Firestore

- `users/{uid}/pushTokens/{tokenId}` — כתיבה למשתמש מחובר בלבד.  
- `users/{uid}/notifications/{id}` — יצירה רק מהשרת; הלקוח קורא ומעדכן `read`.

### 8. iOS / Safari

- Web Push ב־iOS מוגבל; המלצת המוצר בטקסטים: **הוספה למסך הבית (PWA)** לשיפור אמינות.

---

## סיכום קצר למפתח / ל-Claude

- **„נכנס ל־Google ואז נזרק החוצה”** — לבדוק קודם **`users/{uid}`** + **Authorized domains** + **OAuth redirect URIs**.  
- **„התראות לא עובדות”** — להפריד: **מייל** (API + Vercel), **פעמון באפליקציה** (rules + function שכותבת ל־`notifications`), **דחיפה לדפדפן** (VAPID + SW + הרשאה + טוקן ב־`pushTokens` + התאמת `restaurantId`).
