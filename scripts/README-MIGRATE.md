# מיגרציית קטלוג רכיבים מהמערכת הישנה

## מה עושה הסקריפט

מושך את כל הרכיבים מהקולקציה `ingredients` בפרויקט **restaurant-pro-2026** (מערכת ישנה) ומעתיק אותם לפרויקט **החדש**.

---

## שיטה מומלצת: Firebase Admin SDK

עוקף את כללי האבטחה – עובד תמיד.

### שלב 1: הורדת מפתחות Service Account

**פרויקט ישן (restaurant-pro-2026):**
1. Firebase Console → הפרויקט הישן → ⚙️ Project Settings → Service Accounts
2. **Generate new private key** → הורד
3. שמור כ־`scripts/old-sa.json`

**פרויקט חדש:**
1. Firebase Console → הפרויקט החדש → ⚙️ Project Settings → Service Accounts
2. **Generate new private key** → הורד
3. שמור כ־`scripts/new-sa.json`

### שלב 2: הרצה

```bash
npm install
npm run migrate:ingredients:admin
```

**חשוב:** `old-sa.json` ו־`new-sa.json` נמצאים ב־.gitignore – אל תעלה אותם ל-Git.

---

## שיטה חלופית: Client SDK

אם הכללים בפרויקט הישן מאפשרים קריאה ללא auth (לא מומלץ בפרודקשן):

```bash
npm run migrate:ingredients
```

דורש ש־.env.local מכיל את ערכי הפרויקט החדש.
