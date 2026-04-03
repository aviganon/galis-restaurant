# פריסה — Vercel מול Firebase Hosting

## פריסה אוטומטית מ-GitHub

בדחיפה ל־**`main`**:

- **Firebase:** GitHub Actions — קובץ [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml): build של האפליקציה, פריסת **Firebase Hosting**, ואז `firestore:rules`, `firestore:indexes`, **Cloud Functions**.
- **Vercel:** בדרך כלל אותו `push` מפעיל build+deploy דרך חיבור ה-Git של Vercel לריפו.

אין חובה להריץ `firebase deploy` או `npm run deploy` מקומית לעדכון שגרתי — רק אם צריך פריסה ידנית / דיבוג.

## שני מצבי בילד (Next.js)

ב־[`next.config.mjs`](../next.config.mjs):

| סביבה | `output: "export"` | Route Handlers (`/api/*`) |
|--------|---------------------|---------------------------|
| **Vercel** (`VERCEL=1` מוגדר אוטומטית בפלטפורמה) | לא | **כן** — שרת Node מריץ את ה־API |
| **מקומי / Firebase Hosting** (בלי `VERCEL`) | כן — יצוא סטטי ל־`out/` | **לא** על Hosting בלבד — אין שרת Next |

## איפה «האמת» לפרודקשן?

- אם המשתמשים נכנסים דרך **דומיין ב־Vercel** — מיילים, audit, סיכום בעלים וכו' **עובדים** כל עוד מוגדרים `FIREBASE_SERVICE_ACCOUNT_JSON` ו־Resend בסביבת Vercel.
- אם הכניסה היא רק ל־**`*.web.app` / Firebase Hosting** (סטטי בלבד) — קריאות `fetch("/api/...")` **לא** מגיעות ל־Route Handlers. נדרש אחד מהבאים: **אירוח מלא של Next ב־Vercel/Cloud Run**, **Cloud Functions** עם נתיבים מקבילים, או **rewrite** לשרת API.

## FCM — טוקן בקליינט מול שליחה מהשרת

- שמירת טוקן תחת `users/{uid}/pushTokens` מאפשרת **לשלוח** התראות דרך **Firebase Admin SDK** (Cloud Function או סביבת Node עם Service Account).
- שליחה אמיתית דורשת מימוש נפרד (Function מתוזמנת / טריגר Firestore) — ראו הערה ב־`docs/SECURITY-OPERATIONS.md`.

## CI

- Workflow **CI** מריץ גם בילד עם `VERCEL=1` (כמו Vercel) כדי לתפוס שגיאות build לפני merge.

## התראות Push אוטומטיות (מלאי נמוך)

- Cloud Function **`lowStockPushDigest`** (v2 scheduler) רצה **כל יום ב־08:00** (Asia/Jerusalem), שולחת FCM למכשירים שמופעלים בהגדרות, כש־`notifyLowStock` לא כבוי ויש פריטים אזלים או מתחת לסף.
- נדרש **Blaze** ב־Firebase (תזמון + FCM). אחרי `firebase deploy --only functions` הפונקציה מופיעה ב־Console תחת Functions.
- **היסטוריה באפליקציה:** אותה פונקציה כותבת גם ל־`users/{uid}/notifications` (שדות `title`, `body`, `type: low_stock`, `read`, `createdAt`, `restaurantId`, `restaurantName`). הלקוח רק קורא ומעדכן `read` — הכללים ב־`firestore.rules`. אחרי פריסת rules + functions, רענון מסך יציג התראות בפעמון בסרגל.

## App Check (אופציונלי)

- בקוד: `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` + `initAppCheckIfConfigured()` ב־`lib/firebase.ts` (אתחול ב־`AppCheckInit`).
- ב־Firebase Console: **App Check** → רישום אפליקציית Web עם reCAPTCHA v3 → מומלץ **Enforcement: Monitor** לפני **Enforce** על Firestore/Functions.
- הוספת המפתח ב־Vercel / `.env.local` (לא ב־Git).

## בדיקה ידנית (אחרי פריסה)

| מה | איך |
|----|-----|
| Rules + Functions | `firebase deploy --only functions,firestore:rules` (או `npm run deploy`) |
| פעמון + רשימה | התחברות → מסעדה אחת לפחות; פתיחת פעמון (אין התראות = ריק זה תקין) |
| מלאי נמוך E2E | אחרי ריצה עם מלאי מתחת לסף — לוודא מסמך ב־`notifications` ואו FCM (תלוי בדפדפן) |
| ניטור שגיאות | ראו `docs/OPERATIONS-MONITORING.md` |
