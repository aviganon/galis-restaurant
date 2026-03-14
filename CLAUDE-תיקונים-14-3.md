# תיקונים שבוצעו — 14.3.2026
## ⚠️ הוראות לCursor: הרץ `git pull` כדי לסנכרן את המחשב עם GitHub

---

## 1. תיקון קריטי — deploy.yml (שבר את ההתחברות)

**הבעיה:** cursor שינה את `.github/workflows/deploy.yml` וכתב `undefined` בכל משתני Firebase:
```yaml
NEXT_PUBLIC_FIREBASE_API_KEY: undefined  # ← שבר הכל!
```

**התיקון:** העברת כל משתני Firebase ל-GitHub Secrets + עדכון deploy.yml:
```yaml
NEXT_PUBLIC_FIREBASE_API_KEY: ${{ secrets.NEXT_PUBLIC_FIREBASE_API_KEY }}
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: ${{ secrets.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN }}
NEXT_PUBLIC_FIREBASE_PROJECT_ID: ${{ secrets.NEXT_PUBLIC_FIREBASE_PROJECT_ID }}
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: ${{ secrets.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET }}
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID }}
NEXT_PUBLIC_FIREBASE_APP_ID: ${{ secrets.NEXT_PUBLIC_FIREBASE_APP_ID }}
ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

**קובץ שעודכן:** `.github/workflows/deploy.yml`

**⚠️ חשוב לCursor:** אל תשנה את הערכים בdeploy.yml — הם מגיעים מ-GitHub Secrets בלבד!

---

## 2. תיקון קריטי — suppliers.tsx (crash בהתחזה)

**הבעיה:** `handleConfirmSupplier` הפנתה ל-`loadSuppliers` שהוגדרה **אחריה** בקוד.
זה גרם לשגיאת `Cannot access before initialization` שהתגלתה בדיוק בזמן התחזה.

**התיקון:** הזזת `loadSuppliers` לפני `handleConfirmSupplier` בקובץ.

**קובץ שעודכן:** `components/suppliers.tsx`

**הסדר הנכון בקוד:**
```
1. const loadSuppliers = useCallback(...)      ← חייב להיות ראשון
2. const handleConfirmSupplier = useCallback(...)  ← מפנה ל-loadSuppliers
```

---

## 3. GitHub Secrets שנוספו

נוספו ל-GitHub Secrets (Settings → Secrets → Actions):
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `SERPER_API_KEY`
- `ANTHROPIC_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_GALIS_6EBBC`

---

## 4. Vercel — משתני סביבה שנוספו

נוספו ל-Vercel Dashboard (ganonavi-2652s-projects/galis-restaurant):
- כל 6 משתני `NEXT_PUBLIC_FIREBASE_*`
- `ANTHROPIC_API_KEY` (תוקן מ-`NTHROPIC_API_KEY` שהיה עם שגיאת כתיב)
- `SERPER_API_KEY`

---

## 5. סיכום — מה לא לשנות

| קובץ | הגבלה |
|------|--------|
| `.github/workflows/deploy.yml` | אל תשנה ערכי Firebase — הם ${{ secrets.* }} |
| `components/suppliers.tsx` | `loadSuppliers` חייבת להיות לפני `handleConfirmSupplier` |
| `lib/firebase.ts` | placeholder מכוון — מאפשר build בלי env vars |

---

## 6. כתובות

- Firebase: https://galis-6ebbc.web.app
- Vercel: https://galis-restaurant.vercel.app
- GitHub: https://github.com/aviganon/galis-restaurant
