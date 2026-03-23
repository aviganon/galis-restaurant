import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { getFirebaseAdminAuth } from "@/lib/firebase-admin-server"

const fromEmail = process.env.RESEND_FROM_EMAIL || "Restaurant Pro <onboarding@resend.dev>"

function getPublicAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/$/, "")
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`
  return "http://127.0.0.1:3000"
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/**
 * איפוס סיסמה ב-Firebase + שליחת המייל דרך Resend (אמין יותר ממייל ברירת המחדל של Firebase).
 * אם אין Admin או Resend — מחזירים 503 + fallback כדי שהלקוח ינסה sendPasswordResetEmail.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const emailRaw = typeof body.email === "string" ? body.email.trim() : ""
    if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      return NextResponse.json({ error: "אימייל לא תקין" }, { status: 400 })
    }
    const email = emailRaw.toLowerCase()

    const adminAuth = getFirebaseAdminAuth()
    const resendKey = process.env.RESEND_API_KEY

    if (!adminAuth || !resendKey) {
      return NextResponse.json(
        {
          error: "שליחת אימייל לא מוגדרת בשרת",
          fallback: true,
        },
        { status: 503 },
      )
    }

    let link: string
    try {
      const continueUrl = `${getPublicAppUrl()}/`
      link = await adminAuth.generatePasswordResetLink(email, {
        url: continueUrl,
        handleCodeInApp: false,
      })
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : ""
      if (code === "auth/user-not-found") {
        return NextResponse.json(
          { error: "לא נמצא משתמש עם אימייל זה במערכת. ודא שנרשמת עם אותו אימייל." },
          { status: 404 },
        )
      }
      console.error("[password-reset] generatePasswordResetLink failed:", e)
      return NextResponse.json({ error: "שגיאה ביצירת קישור איפוס" }, { status: 500 })
    }

    const resend = new Resend(resendKey)
    const html = `
<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 500px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">איפוס סיסמה — Restaurant Pro</h2>
  <p>שלום,</p>
  <p>נשלחה בקשה לאיפוס הסיסמה לחשבון <strong dir="ltr">${escapeHtml(email)}</strong>.</p>
  <p style="margin: 0 0 12px 0;">לחץ על הכפתור כדי לבחור סיסמה חדשה:</p>
  <p style="margin: 0 0 12px 0;">
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">איפוס סיסמה</a>
  </p>
  <p style="font-size: 13px; color: #666;">הקישור תקף לזמן מוגבל. אם לא ביקשת איפוס — התעלם מהמייל.</p>
  <p style="margin-top: 24px; color: #666; font-size: 14px;">Restaurant Pro</p>
</body>
</html>
`

    const { error } = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: "איפוס סיסמה — Restaurant Pro",
      html,
    })

    if (error) {
      console.error("[password-reset] Resend error:", error)
      return NextResponse.json({ error: error.message || "שגיאה בשליחת אימייל" }, { status: 500 })
    }

    return NextResponse.json({ ok: true, via: "resend" as const })
  } catch (e) {
    console.error("[password-reset] route error:", e)
    return NextResponse.json({ error: "שגיאה לא צפויה" }, { status: 500 })
  }
}
