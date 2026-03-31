# אבטחה ותפעול

מסמך קצר לבעלי מערכת ולמפעילי פרודקשן.

ראה גם **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Vercel מול Firebase Hosting ו־`/api/*`.

## גיבוי וייצוא

- ייצוא נתוני מסעדה זמין בהגדרות (מנהל/בעלים) תחת ניהול נתונים.
- גיבוי שוטף של Firestore מומלץ דרך Google Cloud (גיבוי מתוזמן לפרויקט Firebase).

## מפתחות וסודות

- **Firebase Client**: משתני `NEXT_PUBLIC_*` מוטמעים בקליינט — אין לשים בהם סודות.
- **Firebase Admin**: `FIREBASE_SERVICE_ACCOUNT_JSON` רק בשרת / CI / Functions — לעולם לא בקוד או ב-repo.
- **Resend**: `RESEND_API_KEY` לשליחת מיילים (הזמנות, מלאי נמוך, ספקים).
- **Sentry**: `NEXT_PUBLIC_SENTRY_DSN` — DSN ציבורי לדיווח שגיאות מהדפדפן.
- **FCM Web Push**: `NEXT_PUBLIC_FIREBASE_VAPID_KEY` מזהה Web Push בפרויקט (Firebase Console → Project settings → Cloud Messaging → Web Push certificates).

## יומן ביקורת (audit)

- אירועים נשמרים ב־Firestore בקולקציה `auditEvents` דרך API (`/api/audit/log`) עם אימות אסימון.
- צפייה ברשימה: `/api/audit/events` — רק בעל מערכת / רשימת admins.
- כללי Firestore לא חושפים את `auditEvents` לקליינט — גישה רק דרך Admin בשרת.

## דומיינים ומייל

- כתובות ייבוא מייל מוגדרות per מסעדה; רשימת שולחים מורשים מונעת ספאם.

## Deploy

- GitHub Actions בונה עם משתני הסודות מהמאגר; ודא שהסיקרטים מעודכנים אחרי הוספת משתנה חדש (למשל VAPID או Sentry).

## התראות Push מהשרת (אופציונלי)

- טוקני Web Push נשמרים ב־Firestore; **שליחת הודעה** ללקוחות דורשת שימוש ב־**Firebase Cloud Messaging** עם Admin SDK (למשל Cloud Function שקוראת ל־`admin.messaging().sendEachForMulticast` או שליחה לפי טוקן).
- זה לא חלק מהאפליקציה הסטטית בלבד — מתכננים Function נפרד לפי אירועים (מלאי נמוך, וכו').

## הגבלת קצב (audit)

- נתיב `POST /api/audit/log` מוגבל לפי משתמש (in-memory בפרוסת Node בודדת). בפריסה מרובת מופעים ללא sticky session, הגבלה היא **הערכה** בלבד; לייצור קשיח יותר שקלו Redis / Upstash או שכבת edge.
