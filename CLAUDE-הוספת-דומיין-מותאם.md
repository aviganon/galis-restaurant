# הוראות ל-Claude: הוספת דומיין מותאם ל-Firebase Hosting (Gallis)

**פרויקט:** galis-6ebbc  
**כתובת נוכחית:** https://galis-6ebbc.web.app

---

## המשימה

להוסיף דומיין מותאם אישית (Custom Domain) לאתר Gallis, כדי שהכתובת תהיה למשל `https://gallis.co.il` במקום `https://galis-6ebbc.web.app`.

**דרישה:** המשתמש חייב להיות בעלים של הדומיין (למשל gallis.co.il, gallis.com וכו').

---

## שלב 1: Firebase Console

1. גלוש ל־https://console.firebase.google.com/project/galis-6ebbc/hosting
2. בקטע **Hosting** לחץ על **"Add custom domain"** / **"הוסף דומיין מותאם"**

---

## שלב 2: הזנת הדומיין

1. הזן את הדומיין הרצוי, למשל:
   - `gallis.co.il` (דומיין ראשי)
   - או `www.gallis.co.il` (תת-דומיין)
2. לחץ **"Continue"** / **"המשך"**

---

## שלב 3: אימות הדומיין

Firebase יציג רשומות DNS שצריך להוסיף אצל ספק הדומיין (למשל GoDaddy, Namecheap, Cloudflare, או ספק ישראלי כמו ארץ, בזק וכו').

### סוגי רשומות נפוצים:

**אם Firebase מבקש רשומת A:**
- **Type:** A
- **Name:** @ (או ריק – עבור הדומיין הראשי)
- **Value:** כתובת ה-IP ש-Firebase מציג (למשל 151.101.1.195)

**אם Firebase מבקש רשומת CNAME:**
- **Type:** CNAME
- **Name:** www (או את התת-דומיין שבחרת)
- **Value:** `galis-6ebbc.web.app`

---

## שלב 4: הוספת הרשומות אצל ספק הדומיין

1. היכנס לחשבון ספק הדומיין (למשל GoDaddy, Namecheap, ארץ)
2. עבור ל־**DNS Settings** / **ניהול DNS** / **רשומות DNS**
3. הוסף את הרשומות ש-Firebase הציג
4. שמור והמתן 5–60 דקות (תלוי בספק)

---

## שלב 5: סיום ב-Firebase

1. חזור ל-Firebase Console
2. לחץ **"Verify"** / **"אמת"**
3. אם הרשומות הוגדרו נכון – Firebase יסיים את ההגדרה
4. הדומיין יופעל (יכול לקחת עד 24 שעות, בדרך כלל פחות)

---

## סיכום

| שלב | פעולה |
|-----|--------|
| 1 | Firebase Console → Hosting → Add custom domain |
| 2 | הזנת הדומיין (למשל gallis.co.il) |
| 3 | העתקת רשומות ה-DNS ש-Firebase מציג |
| 4 | הוספת הרשומות אצל ספק הדומיין |
| 5 | Verify ב-Firebase |

---

## הערות

- **SSL:** Firebase מספק תעודת SSL אוטומטית (HTTPS) לדומיין המותאם
- **כתובת ישנה:** `https://galis-6ebbc.web.app` תמשיך לעבוד גם אחרי הוספת הדומיין
- **דומיין לא קיים:** אם אין לך דומיין, צריך לרכוש אחד קודם (למשל מ-GoDaddy, Namecheap, ארץ)
