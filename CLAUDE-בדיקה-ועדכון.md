# הוראות לבדיקה ועדכון — Claude

מסמך זה מסכם את כל מה שבוצע בפרויקט `galis-restaurant` ומנחה מה לבדוק ומה להוסיף אם חסר.

---

## הוראות מדויקות — מה לעשות עכשיו

### 1. בסוף כל שיחה
הרץ deploy אוטומטית:
```bash
cd "/Users/aviganonm5/Library/Mobile Documents/com~apple~CloudDocs/cursor" && npm run deploy
```

### 2. אם המשתמש מבקש שינויים בקוד
- בצע את השינויים
- הרץ `npm run build` לוודא שאין שגיאות
- Commit + push + deploy

### 3. אם יש שגיאת התחברות
- **אל תשתמש ב-`<a href>`** — השתמש ב-`Button` + `onClick` + `window.open()` לקישורים חיצוניים
- **אל תשנה ל-`flex flex-col`** בעמודת מחירים — השתמש ב-`space-y-2` בלבד

### 4. אם Vercel מדווח על שגיאה
- **Firebase env vars:** ה-build יצליח גם בלי (יש placeholder ב־`lib/firebase.ts`)
- **כדי שההתחברות תעבוד ב-Vercel:** המשתמש חייב להוסיף משתני Firebase ב-Vercel Dashboard (סעיף 3 למטה)

### 5. מבנה מחיר הכי זול
- **בשורה:** רק מחיר לחיץ (₪X/יחידה ▼)
- **בלחיצה:** Popover עם מהמערכת + מהאינטרנט + "לקנייה באינטרנט →"
- **קישור לקנייה:** `Button` עם `onClick={() => window.open(url, "_blank")}` — לא `<a>`

### 6. קבצים מרכזיים
| קובץ | תפקיד |
|------|-------|
| `components/ingredients.tsx` | CheapestPricePopover, שורת מחיר מתחת לרכיב |
| `components/admin-panel.tsx` | AdminCheapestPopover, WebPriceCell |
| `lib/firebase.ts` | placeholder כשאין env vars (מאפשר build) |

---

## סיכום דברים ש-Claude עשה

| פעולה | פרטים |
|-------|--------|
| **הסרת pnpm** | מחק `pnpm-lock.yaml`, הפרויקט עבר ל-npm |
| **הגדרת Vercel** | יצר `vercel.json` עם `installCommand: "npm install"` |
| **package.json** | הוסיף `packageManager: "npm@10.0.0"` |
| **עדכון תלויות** | firebase-admin, dotenv, framer-motion, lucide-react, react-day-picker, tw-animate-css, typescript |
| **עדכון SERPER-SETUP.md** | הוסיף רשימת משתני Firebase ל-Vercel |
| **יצירת מסמך הוראות** | `CLAUDE-בדיקה-ועדכון.md` — בדיקות ומשתני סביבה |
| **Deploy ל-Firebase** | הרצת `npm run deploy` — האתר ב־galis-6ebbc.web.app |
| **Push ל-GitHub** | כל השינויים נדחפו ל־aviganon/galis-restaurant |

**בוצע (Claude בדפדפן):** 6 משתני Firebase נוספו ל-Vercel ✅ — ההתחברות ו"בדוק באינטרנט" עובדים ב־galis-restaurant.vercel.app

---

## עדכון: GitHub Actions + Secrets (13.3)

**בוצע (Claude בדפדפן):**
- נוסף `SERPER_API_KEY` ל־GitHub Secrets
- ה-deploy ב־GitHub Actions הצליח ✅

**GitHub Secrets קיימים:**
| Secret | שימוש |
|--------|-------|
| `ANTHROPIC_API_KEY` | API Claude |
| `FIREBASE_SERVICE_ACCOUNT_GALIS_6EBBC` | פריסה ל-Firebase |
| `SERPER_API_KEY` | חיפוש מחירים באינטרנט |

**המערכת מוכנה** — תכונת "בדוק באינטרנט" אמורה לעבוד.

---

## 1. סיכום שינויים שבוצעו

### פריסה (Deploy)
- **Firebase Hosting:** האתר פרוס ב־https://galis-6ebbc.web.app
- **GitHub Actions:** deploy.yml — build + Firebase Hosting על כל push ל-main ✅
- **Vercel:** הפרויקט מחובר ל־GitHub; דורש משתני Firebase (ראה סעיף 3)

### תלויות (Dependencies)
- הוסר `pnpm-lock.yaml` — הפרויקט משתמש ב־npm
- נוסף `vercel.json` עם `installCommand: "npm install"`
- נוסף `packageManager: "npm@10.0.0"` ב־package.json
- עודכנו: firebase-admin, dotenv, framer-motion, lucide-react, react-day-picker, tw-animate-css, typescript

### תכונות
- מחיר שוק, הכי זול, "בדוק באינטרנט" (Serper + Claude)
- מחיר לחיץ מתחת לרכיב — Popover עם מהמערכת + מהאינטרנט + "לקנייה באינטרנט"
- API routes: `/api/claude`, `/api/ingredient-web-price`, `/api/invite`
- Firestore: subcollection `ingredients/{id}/prices/{priceId}`

---

## 2. מה לבדוק

### קוד
- [ ] `lib/firebase.ts` — משתמש ב-placeholder כשאין env vars (מאפשר build ב-Vercel)
- [ ] `components/ingredients.tsx` — priceSource, globalCheapest, "בדוק באינטרנט"
- [ ] `app/api/ingredient-web-price/route.ts` — Serper + Claude
- [ ] `next.config.mjs` — ב־Vercel (VERCEL=1) אין static export, API routes עובדים
- [ ] `vercel.json` — installCommand: "npm install"

### קבצי הגדרה
- [ ] `.env.example` — רשימת משתני Firebase + Resend
- [ ] `SERPER-SETUP.md` — הוראות Vercel + Serper + משתני Firebase

### Git
- [ ] אין `pnpm-lock.yaml` במאגר
- [ ] יש `package-lock.json`
- [ ] יש `vercel.json`

---

## 3. משתני סביבה — Vercel

**כבר הוגדרו** ✅ (6 משתני Firebase + ANTHROPIC_API_KEY + SERPER_API_KEY). אם צריך להוסיף — Vercel → Settings → Environment Variables:

| משתנה | מקור |
|-------|------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Console או .env.local |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `galis-6ebbc.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `galis-6ebbc` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `galis-6ebbc.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Console |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase Console |

**לבדוק באינטרנט (Serper):**

| משתנה | מקור |
|-------|------|
| `SERPER_API_KEY` | serper.dev |
| `ANTHROPIC_API_KEY` | console.anthropic.com |

---

## 4. מה להוסיף אם חסר

### אם ה-build ב־Vercel נכשל
1. ודא שכל משתני Firebase מוגדרים (סעיף 3)
2. ב־Vercel: Build & Development Settings → Override → Install Command: `npm install`
3. Redeploy עם "Clear cache"

### אם "בדוק באינטרנט" לא עובד
- ב־Firebase Hosting: לא יעבוד (אין API)
- ב־Vercel: ודא `SERPER_API_KEY` ו־`ANTHROPIC_API_KEY` מוגדרים

### אם יש deprecation warnings (node-domexception, glob)
- מגיע מ־firebase-admin (תלויות עקיפות)
- לא משפיע על ה-build — אפשר להתעלם

### אם חסר קובץ
- `.env.example` — העתק מ־SERPER-SETUP.md או צור לפי הרשימה בסעיף 3
- `vercel.json` — חייב להכיל `{"installCommand": "npm install"}`

### אם GitHub Actions נכשל
- ודא ש־`deploy.yml` מקבל את משתני Firebase ב-build (או הוסף אותם כ־Repository Variables)
- ודא ש־`SERPER_API_KEY` ב־Secrets (לשימוש ב־ingredient-web-price)

---

## 5. פקודות שימושיות

```bash
npm run build      # בדיקת build מקומית
npm run deploy     # build + Firebase Hosting
git push           # דחיפה ל־GitHub (מפעיל build ב־Vercel)
```

---

## 6. כתובות

- **Firebase:** https://galis-6ebbc.web.app
- **Vercel:** https://galis-restaurant.vercel.app (כולל התחברות + בדוק באינטרנט)
- **Firebase Console:** https://console.firebase.google.com/project/galis-6ebbc
- **GitHub:** aviganon/galis-restaurant
- **GitHub Actions:** aviganon/galis-restaurant/actions
