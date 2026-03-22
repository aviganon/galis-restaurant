# Inbound Email Setup — Galis Restaurant

## תיאור
כל מסעדה מקבלת כתובת ייחודית בפורמט:
```
inbound+{token}@mail.galis.app
```
ספקים שולחים חשבוניות ודוחות לכתובת זו → Mailgun → Cloud Function → Firebase Storage + Firestore job.

---

## צ'קליסט הקמה

### 1. רישום DNS (Mailgun)
- [ ] צור חשבון Mailgun על הדומיין `mail.galis.app`
- [ ] הוסף רשומות MX ל-DNS:
  ```
  MX  10  mxa.mailgun.org
  MX  10  mxb.mailgun.org
  ```
- [ ] הוסף רשומת SPF + DKIM לפי הנחיות Mailgun
- [ ] בדוק שהדומיין verified ב-Mailgun dashboard

### 2. הגדרת Inbound Route ב-Mailgun
- [ ] Routes → Create Route
  - Expression: `match_recipient("inbound\\+.*@mail\\.galis\\.app")`
  - Action: `forward("https://REGION-PROJECT.cloudfunctions.net/inboundWebhook?secret=YOUR_SECRET")`
  - Priority: 10

### 3. Cloud Functions
```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

### 4. Secrets ב-Firebase
```bash
firebase functions:secrets:set INBOUND_WEBHOOK_SECRET
# הכנס secret חזק (לפחות 32 תווים אקראיים)
```

### 5. משתני סביבה (Next.js)
הוסף ל-`.env.local` ול-Vercel:
```
NEXT_PUBLIC_INBOUND_DOMAIN=mail.galis.app
```

### 6. Firestore Rules
כלול כבר ב-`firestore.rules` — כלל ל-`inboundEmailLookup`.

### 7. Firebase Storage Rules
```
match /inbound/{restaurantId}/{allPaths=**} {
  allow read: if request.auth != null;
  allow write: if false; // Cloud Function only
}
```

---

## תרחיש שימוש
1. ספק שולח מייל עם PDF לכתובת המסעדה
2. Mailgun מקבל → שולח POST ל-Cloud Function
3. Function מזהה מסעדה, בודק שולח, שומר ב-Storage, יוצר job ב-Firestore
4. המשתמש רואה התראה באפליקציה → מאשר עיבוד

---

## מעבר ל-SendGrid
שנה ב-`functions/src/inbound-webhook.ts`:
```ts
const recipient = fields.to       // במקום fields.recipient
// קבצים: attachment1, attachment2 (ללא מקף)
```

---

## אבטחה
- טוקן 20 תווים אקראיים — לא ניחוש בכוח גס
- Webhook מוגן עם secret ב-query string
- Allowlist מונע spam אם מוגדר
- Admin SDK בלבד כותב ל-Storage
