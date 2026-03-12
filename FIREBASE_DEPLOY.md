# העלאת המערכת ל-Firebase Hosting

## שלב 1: יצירת אתר נוסף (פעם אחת)

אם עדיין לא יצרת אתר ל-Next.js, הרץ:

```bash
firebase hosting:sites:create restaurant-pro-next
```

או ב-Firebase Console: **Hosting** → **Add another site** → `restaurant-pro-next`

## שלב 2: חיבור ה-target (פעם אחת)

```bash
firebase target:apply hosting nextapp restaurant-pro-next
```

## שלב 3: התחברות ו-deploy

```bash
firebase login
npm run deploy
```

## כתובות

- **האתר הקיים (HTML):** `https://restaurant-pro-2026.web.app`
- **האתר החדש (Next.js):** `https://restaurant-pro-next.web.app`

שני האתרים משתמשים באותו פרויקט Firebase (Firestore, Auth).
