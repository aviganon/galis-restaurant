# ניטור Cloud Functions והתראות ב-Google Cloud

מטרה: לקבל התראה כשפונקציה מתוזמנת (למשל `lowStockPushDigest`) נכשלת או כששיעור השגיאות עולה.

## Google Cloud Monitoring — התראה על שגיאות ב-Functions

1. פתחו [Google Cloud Console](https://console.cloud.google.com/) ובחרו את פרויקט Firebase (אותו `projectId` כמו באפליקציה).
2. **Monitoring** → **Alerting** → **Create policy**.
3. תנאי (condition): לדוגמה **Log-based metric** או **Error rate** על משאב מסוג Cloud Function.
4. לחלופין: **Logging** → סינון לוגים עם `resource.type="cloud_function"` ו-`severity>=ERROR`, ויצירת metric + alert מהלוגים.
5. בחרו ערוץ התראה (אימייל, PagerDuty וכו').

## Firebase Console

- **Functions**: לוגים ומטריקות בסיסיות לכל פונקציה.
- **App Check**: אחרי הוספת `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, הפעילו מצב **Monitor** לפני **Enforce** כדי לא לחסום תעבורה לגיטימית.

## הפניה

- פונקציית המלאי הנמוך: `functions/src/low-stock-push.ts` — `lowStockPushDigest` (אזור `europe-west1`).
