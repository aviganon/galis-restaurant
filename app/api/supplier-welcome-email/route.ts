import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { requireFirebaseUser } from "@/lib/api-verify-firebase"
import { getFirebaseAdminFirestore } from "@/lib/firebase-admin-server"

const fromEmail = process.env.RESEND_FROM_EMAIL || "Restaurant Pro <onboarding@resend.dev>"

const INBOUND_DOMAIN = process.env.NEXT_PUBLIC_INBOUND_DOMAIN || "mail.galis.app"

function buildInboundAddress(token: string): string {
  return `inbound+${token}@${INBOUND_DOMAIN}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * שליחת מייל לספק חדש: הצטרפות + כתובת לשליחת חשבוניות (ייבוא מייל).
 * רק משתמש המשויך לאותה מסעדה (או בעל מערכת).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireFirebaseUser(req)
    if (!auth.ok) return auth.response

    const db = getFirebaseAdminFirestore()
    if (!db) {
      return NextResponse.json(
        { error: "השרת לא מוגדר לאדמין (הוסף FIREBASE_SERVICE_ACCOUNT_JSON)" },
        { status: 503 },
      )
    }

    const body = await req.json().catch(() => ({}))
    const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId.trim() : ""
    const supplierEmail = typeof body.supplierEmail === "string" ? body.supplierEmail.trim().toLowerCase() : ""
    const supplierName =
      typeof body.supplierName === "string" && body.supplierName.trim() ? body.supplierName.trim() : "ספק"

    if (!restaurantId) {
      return NextResponse.json({ error: "חסר מזהה מסעדה" }, { status: 400 })
    }
    if (!supplierEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplierEmail)) {
      return NextResponse.json({ error: "אימייל ספק לא תקין" }, { status: 400 })
    }

    const callerSnap = await db.collection("users").doc(auth.decoded.uid).get()
    if (!callerSnap.exists) {
      return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 403 })
    }
    const caller = callerSnap.data() as {
      isSystemOwner?: boolean
      restaurantId?: string | null
    }
    if (!caller.isSystemOwner && caller.restaurantId !== restaurantId) {
      return NextResponse.json({ error: "אין גישה למסעדה" }, { status: 403 })
    }

    const restSnap = await db.collection("restaurants").doc(restaurantId).get()
    const restaurantDisplayName =
      (restSnap.exists && (restSnap.data()?.name as string)?.trim()) || "המסעדה שלנו"

    const inboundSnap = await db.doc(`restaurants/${restaurantId}/appState/inboundSettings`).get()
    const inboundData = inboundSnap.exists ? (inboundSnap.data() as { inboundEmailToken?: string; inboundAllowedSenderEmails?: string[] }) : {}
    const token = typeof inboundData.inboundEmailToken === "string" ? inboundData.inboundEmailToken.trim() : ""
    const inboundAddress = token ? buildInboundAddress(token) : null

    const allowedList = Array.isArray(inboundData.inboundAllowedSenderEmails) ? inboundData.inboundAllowedSenderEmails : []
    if (allowedList.length > 0) {
      const normalized = allowedList.map((e) => String(e).toLowerCase().trim())
      if (!normalized.includes(supplierEmail)) {
        await db.doc(`restaurants/${restaurantId}/appState/inboundSettings`).set(
          { inboundAllowedSenderEmails: [...normalized, supplierEmail] },
          { merge: true },
        )
      }
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "שליחת אימייל לא מוגדרת. הוסף RESEND_API_KEY" }, { status: 503 })
    }

    const resend = new Resend(apiKey)
    const subject = `הצטרפות כספק — ${restaurantDisplayName}`

    const addressBlock = inboundAddress
      ? `
  <div style="margin: 1rem 0; padding: 14px 18px; background: #eff6ff; border-radius: 10px; border: 1px solid #93c5fd;">
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #1e3a5f;"><strong>כתובת לשליחת חשבוניות (PDF / Excel מצורף)</strong></p>
    <p style="margin: 0; font-size: 15px; font-family: ui-monospace, monospace; direction: ltr; text-align: left;" dir="ltr"><strong>${escapeHtml(inboundAddress)}</strong></p>
    <p style="margin: 10px 0 0 0; font-size: 12px; color: #475569;">שלחו מהכתובת <span dir="ltr">${escapeHtml(supplierEmail)}</span> או ודאו שהיא מורשית בהגדרות המסעדה.</p>
  </div>
`
      : `
  <p style="font-size: 14px; color: #92400e;">טרם הוגדרה כתובת ייבוא מייל למסעדה. ניתן לשלוח חשבוניות דרך ממשק המסעדה או לבקש מהמסעדה להפעיל «מייל נכנס» בהגדרות.</p>
`

    const html = `
<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.65; color: #1f2937; max-width: 520px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1d4ed8; margin-top: 0;">שלום${supplierName ? ` — ${escapeHtml(supplierName)}` : ""}</h2>
  <p>המסעדה <strong>${escapeHtml(restaurantDisplayName)}</strong> רשמה אתכם כספק במערכת ניהול הרכש והעלויות שלה.</p>
  <p>מעכשיו ניתן לתאם מחירים ומוצרים ישירות מול המסעדה דרך המערכת.</p>
  ${addressBlock}
  <p style="font-size: 13px; color: #64748b; margin-top: 1.5rem;">בברכה,<br/><strong>${escapeHtml(restaurantDisplayName)}</strong></p>
  <p style="margin-top: 2rem; font-size: 12px; color: #94a3b8;">Restaurant Pro — ניהול מסעדות</p>
</body>
</html>
`

    const replyTo = typeof auth.decoded.email === "string" && auth.decoded.email.includes("@") ? auth.decoded.email : undefined
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [supplierEmail],
      subject,
      ...(replyTo ? { replyTo } : {}),
      html,
    })

    if (error) {
      console.error("[supplier-welcome-email] Resend:", error)
      return NextResponse.json({ error: error.message || "שגיאה בשליחת אימייל" }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      id: data?.id,
      inboundAddress,
      addedToAllowedSenders: allowedList.length > 0,
    })
  } catch (e) {
    console.error("[supplier-welcome-email]", e)
    return NextResponse.json({ error: "שגיאה לא צפויה" }, { status: 500 })
  }
}
