import { NextRequest, NextResponse } from "next/server"
import type { Firestore } from "firebase-admin/firestore"
import { Resend } from "resend"
import { requireFirebaseUser } from "@/lib/api-verify-firebase"
import { canSendInviteEmail, loadAdminEmailSet } from "@/lib/firebase-admin-permissions"
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "@/lib/firebase-admin-server"
import { firestoreConfig } from "@/lib/firestore-config"

const fromEmail = process.env.RESEND_FROM_EMAIL || "Restaurant Pro <onboarding@resend.dev>"
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://restaurant-pro.web.app"

function roleLabelHe(role: string | undefined): string {
  if (role === "manager") return "מנהל"
  if (role === "user") return "משתמש"
  return role || ""
}

/** קוד manager + allowedEmail + בלי מסעדה — לשחזור מייל אחרי מחיקה */
async function findOrCreateManagerPendingInviteCode(db: Firestore, emailLower: string): Promise<string | null> {
  const { inviteCodesCollection, inviteCodeFields } = firestoreConfig
  const snap = await db.collection(inviteCodesCollection).where(inviteCodeFields.allowedEmail, "==", emailLower).limit(40).get()
  for (const d of snap.docs) {
    const data = d.data()
    if (data[inviteCodeFields.used] === true) continue
    if (data[inviteCodeFields.type] !== "manager") continue
    const rid = data[inviteCodeFields.restaurantId]
    if (rid != null && rid !== "") continue
    return d.id
  }
  for (let i = 0; i < 14; i++) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    const ref = db.collection(inviteCodesCollection).doc(code)
    const s = await ref.get()
    if (s.exists) continue
    await ref.set({
      [inviteCodeFields.createdAt]: new Date().toISOString(),
      [inviteCodeFields.used]: false,
      [inviteCodeFields.restaurantId]: null,
      [inviteCodeFields.type]: "manager",
      [inviteCodeFields.allowedEmail]: emailLower,
    })
    return code
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireFirebaseUser(req)
    if (!auth.ok) return auth.response

    const db = getFirebaseAdminFirestore()
    const adminAuth = getFirebaseAdminAuth()
    if (!db) {
      return NextResponse.json(
        { error: "השרת לא מוגדר לאדמין (הוסף FIREBASE_SERVICE_ACCOUNT_JSON)" },
        { status: 503 },
      )
    }
    if (!adminAuth) {
      return NextResponse.json(
        { error: "השרת לא מוגדר לאדמין (הוסף FIREBASE_SERVICE_ACCOUNT_JSON)" },
        { status: 503 },
      )
    }

    const adminSet = await loadAdminEmailSet(db)
    const allowed = await canSendInviteEmail(db, auth.decoded.uid, auth.decoded.email, adminSet)
    if (!allowed) {
      return NextResponse.json({ error: "אין הרשאה לשליחת הזמנה" }, { status: 403 })
    }

    const body = await req.json()
    const email = body.email as string | undefined
    const restaurantName =
      typeof body.restaurantName === "string" && body.restaurantName.trim() ? body.restaurantName.trim() : undefined
    const role = typeof body.role === "string" ? body.role : undefined
    const accountCreated = body.accountCreated === true
    const inviteCode =
      typeof body.inviteCode === "string" && body.inviteCode.trim() ? body.inviteCode.trim().toUpperCase() : undefined
    const emailVerificationLink =
      typeof body.emailVerificationLink === "string" && body.emailVerificationLink.trim() ? body.emailVerificationLink.trim() : undefined
    const pendingRestaurantSetup = body.pendingRestaurantSetup === true
    /** כפתור «הזמנה» ברשימת משתמשים: אם כבר יש חשבון עם סיסמה והמייל לא מאומת — מצרפים קישור אימות */
    const attachVerificationIfPasswordUnverified = body.attachVerificationIfPasswordUnverified === true
    /** מנהל בלי מסעדה — שליחה חוזרת של קוד הקמה (אם מחקו את המייל המקורי) */
    const includeManagerRestaurantSetupIfEligible = body.includeManagerRestaurantSetupIfEligible === true

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "חסר אימייל" }, { status: 400 })
    }
    const to = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: "אימייל לא תקין" }, { status: 400 })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "שליחת אימייל לא מוגדרת. הוסף RESEND_API_KEY ל-.env.local" }, { status: 503 })
    }

    const resend = new Resend(apiKey)

    // לכל accountCreated (משתמש נוצר עם סיסמה), נצרף קישור אימות כתובת מייל לתוך אותו מייל.
    // אם הלקוח שלח emailVerificationLink נשתמש בו; אחרת ניצור כאן.
    let resolvedEmailVerificationLink = emailVerificationLink
    if (accountCreated && !resolvedEmailVerificationLink) {
      try {
        resolvedEmailVerificationLink = await adminAuth.generateEmailVerificationLink(to, { url: appUrl })
      } catch (e) {
        console.error("[invite] generateEmailVerificationLink failed:", e)
      }
    }

    let reminderVerificationLink: string | undefined
    if (attachVerificationIfPasswordUnverified && !resolvedEmailVerificationLink) {
      try {
        const authUser = await adminAuth.getUserByEmail(to)
        const hasPassword = authUser.providerData.some((p) => p.providerId === "password")
        if (hasPassword && !authUser.emailVerified) {
          reminderVerificationLink = await adminAuth.generateEmailVerificationLink(to, { url: appUrl })
        }
      } catch {
        /* אין משתמש ב-Auth — למשל הזמנה לפני הרשמה */
      }
    }

    const verificationLinkForEmail = resolvedEmailVerificationLink || reminderVerificationLink

    let resendManagerSetupCode: string | undefined
    let resendManagerSetup = false
    if (includeManagerRestaurantSetupIfEligible && !accountCreated) {
      try {
        const authUser = await adminAuth.getUserByEmail(to)
        const userSnap = await db.collection(firestoreConfig.usersCollection).doc(authUser.uid).get()
        const ud = userSnap.data()
        const pendingManager =
          ud?.[firestoreConfig.roleField] === "manager" &&
          (ud?.[firestoreConfig.restaurantIdField] == null || String(ud[firestoreConfig.restaurantIdField]).trim() === "")
        if (pendingManager) {
          const code = await findOrCreateManagerPendingInviteCode(db, to)
          if (code) {
            resendManagerSetupCode = code
            resendManagerSetup = true
          }
        }
      } catch {
        /* אין משתמש Auth או שגיאת קריאה */
      }
    }

    const roleLine =
      role && (role === "manager" || role === "user")
        ? `<p>הוגדר לך תפקיד: <strong>${roleLabelHe(role)}</strong>.</p>`
        : role
          ? `<p>תפקיד: <strong>${escapeHtml(role)}</strong>.</p>`
          : ""

    const subject = accountCreated
      ? restaurantName
        ? `חשבון Restaurant Pro — ${restaurantName}`
        : "חשבון חדש ב-Restaurant Pro"
      : resendManagerSetup
        ? "תזכורת: הקמת מסעדה ב-Restaurant Pro"
        : restaurantName
          ? `הזמנה ל-Restaurant Pro — ${restaurantName}`
          : "הזמנה ל-Restaurant Pro"

    const codeBlockHtml =
      inviteCode && accountCreated
        ? pendingRestaurantSetup
          ? `
  <div style="margin: 1rem 0; padding: 12px 16px; background: #f4f4f5; border-radius: 8px; border: 1px solid #e4e4e7;">
    <p style="margin: 0 0 6px 0; font-size: 13px; color: #52525b;"><strong>קוד הזמנה אישי</strong> (מקושר לאימייל שלך)</p>
    <p style="margin: 0; font-size: 22px; font-family: ui-monospace, monospace; letter-spacing: 0.08em; font-weight: 700;">${escapeHtml(inviteCode)}</p>
  </div>
  <p style="font-size: 13px; color: #666;"><strong>איך מקימים מסעדה:</strong> היכנסו לאתר עם <strong>התחברות</strong> (אימייל + הסיסמה שהוגדרה לכם). אחרי הכניסה תופיע מסך השלמה — הזינו שם את הקוד לעיל, שם מסעדה וסניף.</p>
`
          : `
  <div style="margin: 1rem 0; padding: 12px 16px; background: #f4f4f5; border-radius: 8px; border: 1px solid #e4e4e7;">
    <p style="margin: 0 0 6px 0; font-size: 13px; color: #52525b;"><strong>קוד הזמנה</strong> (מסומן במערכת)</p>
    <p style="margin: 0; font-size: 22px; font-family: ui-monospace, monospace; letter-spacing: 0.08em; font-weight: 700;">${escapeHtml(inviteCode)}</p>
  </div>
  <p style="font-size: 13px; color: #666;">התחברות עם <strong>אימייל + סיסמה</strong> שהוגדרו בעת יצירת החשבון. הקוד לעיל שייך לשיוך למסעדה במערכת ולשימושים נוספים לפי הגדרות.</p>
`
        : ""

    const bodyHtml = accountCreated
      ? `
  <p>שלום,</p>
  <p>נפתח עבורך חשבון במערכת <strong>Restaurant Pro</strong>${
    restaurantName ? ` עבור המסעדה <strong>${escapeHtml(restaurantName)}</strong>` : ""
  }.</p>
  ${roleLine}
  <p><strong>פרטי התחברות:</strong></p>
  <ul>
    <li><strong>אימייל:</strong> <span dir="ltr">${escapeHtml(to)}</span></li>
    <li><strong>סיסמה:</strong> זו שהגדיר עבורך מנהל המערכת בעת יצירת החשבון (לא נשלחת במייל מטעמי אבטחה)</li>
  </ul>
  ${codeBlockHtml}
  ${
    verificationLinkForEmail
      ? `<p style="margin-top: 14px; font-size: 13px; color: #666;">
אימות כתובת המייל: <a href="${escapeHtml(verificationLinkForEmail)}" target="_blank" rel="noopener noreferrer">לחץ כאן</a>.
</p>`
      : ""
  }
  <p><strong>איך נכנסים:</strong></p>
  <ol>
    <li>גלוש לכתובת: <a href="${appUrl}">${appUrl}</a></li>
    <li>לחץ על &quot;התחברות&quot; (לא הרשמה)</li>
    <li>הזן את <strong>כתובת האימייל שלך</strong> ואת <strong>הסיסמה</strong> שהוגדרה עבורך על ידי מנהל המערכת</li>
  </ol>
  <p style="color:#666;font-size:14px;">אם לא קיבלת את הסיסמה — פנה למנהל שיצר את החשבון.</p>
`
      : resendManagerSetup && resendManagerSetupCode
        ? `
  <p>שלום,</p>
  <p>מייל זה נשלח כ<strong>הזמנה / תזכורת</strong>: כבר נפתח עבורך חשבון <strong>מנהל</strong> ב־Restaurant Pro, ועדיין צריך <strong>להקים את המסעדה</strong> במערכת (למשל אם המייל הקודם נמחק או לא הגיע).</p>
  ${roleLine}
  <div style="margin: 1rem 0; padding: 12px 16px; background: #f4f4f5; border-radius: 8px; border: 1px solid #e4e4e7;">
    <p style="margin: 0 0 6px 0; font-size: 13px; color: #52525b;"><strong>קוד הזמנה אישי</strong> (מקושר לאימייל שלך)</p>
    <p style="margin: 0; font-size: 22px; font-family: ui-monospace, monospace; letter-spacing: 0.08em; font-weight: 700;">${escapeHtml(resendManagerSetupCode)}</p>
  </div>
  <p style="font-size: 13px; color: #666;"><strong>איך מקימים מסעדה:</strong> גלוש ל־<a href="${appUrl}">${appUrl}</a>, לחץ <strong>התחברות</strong> (לא הרשמה), והזן את <strong>האימייל והסיסמה</strong> שהוגדרו עבורך. אחרי הכניסה יופיע מסך השלמה — הזן את <strong>קוד ההזמנה לעיל</strong>, שם מסעדה וסניף.</p>
  ${
    verificationLinkForEmail
      ? `<p style="margin-top: 14px; font-size: 13px; color: #666;">
<strong>אימות כתובת מייל:</strong> <a href="${escapeHtml(verificationLinkForEmail)}" target="_blank" rel="noopener noreferrer">לחץ כאן</a> (נדרש לפני כניסה עם אימייל וסיסמה, אם טרם אימתת).
</p>`
      : ""
  }
  <p style="color:#666;font-size:14px;">אם לא זוכרים את הסיסמה — השתמש ב־«שכחתי סיסמה» במסך הכניסה או פנה לבעל המערכת.</p>
`
        : `
  <p>שלום,</p>
  <p>${
    restaurantName
      ? `הוזמנת להצטרף למסעדה <strong>${escapeHtml(restaurantName)}</strong> במערכת Restaurant Pro.`
      : "הוזמנת להצטרף למערכת Restaurant Pro."
  }</p>
  ${roleLine}
  <p>כדי להתחיל:</p>
  <ol>
    <li>גלוש לכתובת: <a href="${appUrl}">${appUrl}</a></li>
    <li>לחץ על &quot;הרשמה&quot; והזן את האימייל והסיסמה שלך</li>
    <li>אחרי ההרשמה תקבל גישה אוטומטית</li>
  </ol>
  ${
    verificationLinkForEmail
      ? `<p style="margin-top: 14px; font-size: 13px; color: #666;">
<strong>כבר נפתח לך חשבון עם סיסמה?</strong> אם עדיין לא אימתת את כתובת המייל — לחץ כאן: <a href="${escapeHtml(verificationLinkForEmail)}" target="_blank" rel="noopener noreferrer">אימות מייל</a> (נדרש לפני כניסה עם אימייל וסיסמה).
</p>`
      : ""
  }
`

    const html = `
<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 500px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">${
    accountCreated ? "חשבון נפתח עבורך" : resendManagerSetup ? "הזמנה: הקמת מסעדה" : "הזמנה למערכת Restaurant Pro"
  }</h2>
  ${bodyHtml}
  <p style="margin-top: 24px; color: #666; font-size: 14px;">Restaurant Pro — ניהול מסעדות חכם</p>
</body>
</html>
`

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [to],
      subject,
      html,
    })

    if (error) {
      console.error("Resend error:", error)
      return NextResponse.json({ error: error.message || "שגיאה בשליחת אימייל" }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: data?.id })
  } catch (e) {
    console.error("Invite API error:", e)
    return NextResponse.json({ error: "שגיאה לא צפויה" }, { status: 500 })
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
