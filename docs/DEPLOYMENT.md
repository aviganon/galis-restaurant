# פריסה — Vercel מול Firebase Hosting

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
