import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"

const fromEmail = process.env.RESEND_FROM_EMAIL || "Restaurant Pro <onboarding@resend.dev>"
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://restaurant-pro.web.app"

export async function POST(req: NextRequest) {
  try {
    const { email, restaurantName } = await req.json()
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

    const subject = restaurantName
      ? `הזמנה ל-Restaurant Pro — ${restaurantName}`
      : "הזמנה ל-Restaurant Pro"

    const html = `
<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 500px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">הזמנה למערכת Restaurant Pro</h2>
  <p>שלום,</p>
  <p>${restaurantName ? `הוזמנת להצטרף למסעדה <strong>${restaurantName}</strong> במערכת Restaurant Pro.` : "הוזמנת להצטרף למערכת Restaurant Pro."}</p>
  <p>כדי להתחיל:</p>
  <ol>
    <li>גלוש לכתובת: <a href="${appUrl}">${appUrl}</a></li>
    <li>לחץ על "הרשמה" והזן את האימייל והסיסמה שלך</li>
    <li>אחרי ההרשמה תקבל גישה אוטומטית</li>
  </ol>
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
