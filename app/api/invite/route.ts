import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"

const fromEmail = process.env.RESEND_FROM_EMAIL || "Restaurant Pro <onboarding@resend.dev>"
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://restaurant-pro.web.app"

function roleLabelHe(role: string | undefined): string {
  if (role === "manager") return "מנהל"
  if (role === "user") return "משתמש"
  return role || ""
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = body.email as string | undefined
    const restaurantName =
      typeof body.restaurantName === "string" && body.restaurantName.trim() ? body.restaurantName.trim() : undefined
    const role = typeof body.role === "string" ? body.role : undefined
    const accountCreated = body.accountCreated === true
    const inviteCode =
      typeof body.inviteCode === "string" && body.inviteCode.trim() ? body.inviteCode.trim().toUpperCase() : undefined

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
      : restaurantName
        ? `הזמנה ל-Restaurant Pro — ${restaurantName}`
        : "הזמנה ל-Restaurant Pro"

    const codeBlockHtml =
      inviteCode && accountCreated
        ? `
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
  <p><strong>איך נכנסים:</strong></p>
  <ol>
    <li>גלוש לכתובת: <a href="${appUrl}">${appUrl}</a></li>
    <li>לחץ על &quot;התחברות&quot; (לא הרשמה)</li>
    <li>הזן את <strong>כתובת האימייל שלך</strong> ואת <strong>הסיסמה</strong> שהוגדרה עבורך על ידי מנהל המערכת</li>
  </ol>
  <p style="color:#666;font-size:14px;">אם לא קיבלת את הסיסמה — פנה למנהל שיצר את החשבון.</p>
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
`

    const html = `
<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 500px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">${accountCreated ? "חשבון נפתח עבורך" : "הזמנה למערכת Restaurant Pro"}</h2>
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
