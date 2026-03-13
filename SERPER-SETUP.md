# הגדרת Serper (חיפוש מחירים באינטרנט)

## 1. קבלת מפתח API

1. היכנס ל־https://serper.dev
2. הירשם / התחבר
3. עבור ל־Dashboard → API Keys
4. העתק את המפתח (מתחיל ב־...)

## 2. היכן להוסיף את המפתח

**חשוב:** Serper רץ בשרת בלבד. הפריסה הנוכחית (Firebase Hosting) היא סטטית — אין שרת. כדי להשתמש ב-Serper צריך לפרוס ל־**Vercel** (או שרת אחר).

### אופציה א׳: פריסה ל-Vercel — הוראות מפורטות

#### שלב 1: הכנת הפרויקט
1. ודא שהפרויקט ב-Git (GitHub / GitLab / Bitbucket)
2. אם עדיין לא: `git init` → `git add .` → `git commit -m "init"` → דחיפה ל-GitHub

#### שלב 2: חיבור ל-Vercel
1. היכנס ל־https://vercel.com והתחבר (עם GitHub)
2. לחץ **Add New** → **Project**
3. ייבא את הפרויקט מהמאגר שלך
4. **Framework Preset:** Next.js (יזוהה אוטומטית)
5. **Root Directory:** השאר ריק
6. **Build Command:** `npm run build` (ברירת מחדל)
7. **Output Directory:** השאר ריק

#### שלב 3: משתני סביבה
לפני ה-Deploy, לחץ **Environment Variables** והוסף. **חובה** — בלי משתני Firebase ה-build ייכשל:

**Firebase (חובה — העתק מ־`.env.local` או מ־Firebase Console):**

| שם | ערך | איפה למצוא |
|----|-----|------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | המפתח | Firebase Console → Project Settings → Your apps |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `galis-6ebbc.firebaseapp.com` | או מהפרויקט שלך |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `galis-6ebbc` | מזהה הפרויקט |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `galis-6ebbc.firebasestorage.app` | |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | מספר | Firebase Console |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | מזהה האפליקציה | Firebase Console |

**Serper + AI (לבדוק באינטרנט):**

| שם | ערך | סביבה |
|----|-----|-------|
| `SERPER_API_KEY` | המפתח מ-serper.dev | Production, Preview, Development |
| `ANTHROPIC_API_KEY` | המפתח מ-console.anthropic.com | Production, Preview, Development |

**אופציונלי:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_APP_URL`

לחץ **Add** לכל משתנה. סמן Production, Preview, Development.

#### שלב 4: Deploy
לחץ **Deploy**. Vercel יבנה ויפרוס. תקבל כתובת כמו `your-project.vercel.app`.

**הערה:** הקוד כבר מוגדר כך שב-Vercel ה-API routes יעבדו אוטומטית (ללא static export).

#### שלב 5: Firebase (אופציונלי)
אם תרצה להמשיך להשתמש ב-Firebase Hosting — תוכל להשאיר גם אותו.  
במקרה כזה יהיו לך שני כתובות: אחת ב-Vercel (עם Serper) ואחת ב-Firebase.

### אופציה ב׳: הרצה מקומית

הוסף ל־`.env.local`:

```
SERPER_API_KEY=המפתח_שלך
ANTHROPIC_API_KEY=sk-ant-...
```

הרץ `npm run dev` והרץ `npm run build && npm run start` — ה-API יעבוד עם Serper.

### אופציה ג׳: המשך בלי Serper

אם הפריסה נשארת ב-Firebase Hosting — המערכת תשתמש ב-AI מהלקוח (מפתח Claude מההגדרות) בלי חיפוש באינטרנט. זה עובד.
