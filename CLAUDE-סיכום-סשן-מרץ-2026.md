# סיכום סשן — Claude (מרץ 2026)

תיעוד של מה שבוצע ב-Firebase, Vercel, Namecheap ו-Resend לאתר **galis.app** ולמערכת איפוס הסיסמה.

---

## 1. Firestore — אינדקס `inboundChangeRequests`

נוצר אינדקס ב-Firebase Console:

| | |
|--|--|
| **Collection** | `inboundChangeRequests` |
| **שדות** | `createdAt` — Descending · `__name__` — Ascending |
| **סטטוס** | Building → Enabled |

---

## 2. DNS — חיבור `galis.app` ל-Vercel (Namecheap)

**בוצע ב-Advanced DNS:**

- הוסר **URL Redirect** של `@` (אם היה).
- **CNAME** — `www` → `13ec1139acca13b0.vercel-dns-017.com.`
- **A Record** — `@` → `216.198.79.1`

**ב-Vercel:**

- דומיינים `galis.app` ו-`www.galis.app` — **Valid Configuration**
- משתנה סביבה: `NEXT_PUBLIC_APP_URL=https://galis.app`

---

## 3. איפוס סיסמה — Resend + Firebase Admin

### Firebase Service Account

- Private Key מהקונסולה: **Project settings → Service accounts → Generate new private key**
- ב-Vercel: `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON **בשורה אחת**)

### Resend

- חשבון (למשל עם Google — `ganonavi@gmail.com`)
- **API Key** → `RESEND_API_KEY` ב-Vercel
- דומיין **galis.app** ב-Resend (אזור: Tokyo `ap-northeast-1`)

### רשומות DNS ב-Namecheap (עבור Resend)

יש להשוות לרשימה המדויקת ב-Resend Dashboard → Domains → **DNS records** (הערכים משתנים לפי הפרויקט). בדרך כלל כוללות:

| סוג | Host | תיאור |
|-----|------|--------|
| TXT | `resend._domainkey` | DKIM (מפתח ארוך) |
| TXT | `send` | SPF (למשל `v=spf1 include:amazonses.com ~all`) |
| TXT | `_dmarc` | DMARC (למשל `v=DMARC1; p=none;`) |
| MX | (לפי Resend) | שליחה/משוב — לפי ההוראות ב-Resend |

**ב-Vercel נוסף גם:**

- `RESEND_FROM_EMAIL=noreply@galis.app`

**Redeploy** — בוצע לאחר עדכון משתנים.

---

## 4. סטטוס (נקודת זמן בסשן)

| רכיב | סטטוס |
|------|--------|
| אתר **galis.app** | פעיל |
| Firebase Service Account | מוגדר |
| Resend API Key | מוגדר |
| אימות דומיין Resend | Pending (המתנה לפיזור DNS, ~עד 30 דק׳) |
| איפוס סיסמה **במייל** | אמור לעבוד לאחר **Verified** ב-Resend |
| **הגדרת סיסמה ישירה** (בעל מערכת למשתמש) | עובד בלי תלות במייל |

---

## 5. מה אמור לעבוד אחרי אימות DNS

- **שכחתי סיסמה** — מייל מ-`noreply@galis.app` (דרך Resend + API באפליקציה)
- **שינוי סיסמה** בהגדרות — אותה זרימת מייל
- **בעלים מגדיר סיסמה למשתמש** — דיאלוג במערכת, ללא מייל (כבר עובד לפני אימות Resend)

---

## 6. בדיקה אחרי אימות

1. [resend.com/domains](https://resend.com/domains) — כשהדומיין **Verified** (ירוק).
2. בדיקה מהאפליקציה: «שכחתי סיסמה» עם אימייל קיים ב-Firebase Auth.
3. בדוק גם תיקיית **ספאם**.

---

## קישור למדריך טכני באפליקציה

פרטים על משתני סביבה, API routes ו-Firebase — ראה: **`CLAUDE-איפוס-סיסמה-ומיילים.md`**.
