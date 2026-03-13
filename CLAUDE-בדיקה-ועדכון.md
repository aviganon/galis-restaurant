# הוראות לבדיקה ועדכון — Claude

מסמך זה מסכם את כל מה שבוצע בפרויקט `galis-restaurant` ומנחה מה לבדוק ומה להוסיף אם חסר.

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

**לא בוצע (דורש פעולה ידנית):** הוספת משתני Firebase ב-Vercel Dashboard — בלי זה ה-build ב-Vercel נכשל.

---

## 1. סיכום שינויים שבוצעו

### פריסה (Deploy)
- **Firebase Hosting:** האתר פרוס ב־https://galis-6ebbc.web.app
- **Vercel:** הפרויקט מחובר ל־GitHub; ה-build נכשל בלי משתני סביבה (ראה סעיף 3)

### תלויות (Dependencies)
- הוסר `pnpm-lock.yaml` — הפרויקט משתמש ב־npm
- נוסף `vercel.json` עם `installCommand: "npm install"`
- נוסף `packageManager: "npm@10.0.0"` ב־package.json
- עודכנו: firebase-admin, dotenv, framer-motion, lucide-react, react-day-picker, tw-animate-css, typescript

### תכונות
- מחיר שוק, הכי זול, "בדוק באינטרנט" (Serper + Claude)
- API routes: `/api/claude`, `/api/ingredient-web-price`, `/api/invite`
- Firestore: subcollection `ingredients/{id}/prices/{priceId}`

---

## 2. מה לבדוק

### קוד
- [ ] `lib/firebase.ts` — זורק שגיאה אם חסרים משתני Firebase (מכוון)
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

## 3. משתני סביבה — Vercel (חובה)

**בלי אלה ה-build ב־Vercel ייכשל.** הוסף ב־Vercel → Settings → Environment Variables:

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
- **Vercel:** (בדוק ב־vercel.com את כתובת הפרויקט)
- **Firebase Console:** https://console.firebase.google.com/project/galis-6ebbc
- **GitHub:** aviganon/galis-restaurant
