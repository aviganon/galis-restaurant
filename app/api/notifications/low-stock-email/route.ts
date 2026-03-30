import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { requireFirebaseUser } from "@/lib/api-verify-firebase"
import { getFirebaseAdminFirestore } from "@/lib/firebase-admin-server"
import { assertCallerRestaurantAccess } from "@/lib/assert-restaurant-access"

export const dynamic = "force-static"

const fromEmail = process.env.RESEND_FROM_EMAIL || "Restaurant Pro <onboarding@resend.dev>"

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireFirebaseUser(req)
    if (!auth.ok) return auth.response

    const db = getFirebaseAdminFirestore()
    if (!db) {
      return NextResponse.json({ error: "שרת לא מוגדר" }, { status: 503 })
    }

    const body = await req.json().catch(() => ({}))
    const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId.trim() : ""
    if (!restaurantId) {
      return NextResponse.json({ error: "חסר מזהה מסעדה" }, { status: 400 })
    }

    const access = await assertCallerRestaurantAccess(db, auth.decoded, restaurantId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    const toEmail =
      typeof body.toEmail === "string" && body.toEmail.includes("@")
        ? body.toEmail.trim().toLowerCase()
        : auth.decoded.email?.trim().toLowerCase() || ""
    if (!toEmail) {
      return NextResponse.json({ error: "אין כתובת מייל לשליחה" }, { status: 400 })
    }

    const notifSnap = await db.doc(`restaurants/${restaurantId}/appState/notificationSettings`).get()
    const ns = notifSnap.data()?.notificationSettings as Record<string, boolean> | undefined
    if (ns && ns.notifyLowStock === false) {
      return NextResponse.json({ error: "התראות מלאי נמוך כבויות בהגדרות המסעדה" }, { status: 400 })
    }

    const restSnap = await db.collection("restaurants").doc(restaurantId).get()
    const restaurantName = (restSnap.data()?.name as string)?.trim() || "מסעדה"

    const ingSnap = await db.collection("restaurants").doc(restaurantId).collection("ingredients").get()
    const low: { name: string; stock: number; minStock: number }[] = []
    const outList: { name: string }[] = []
    for (const d of ingSnap.docs) {
      const x = d.data() as { stock?: unknown; minStock?: unknown; isCompound?: boolean }
      if (x.isCompound) continue
      const stock = typeof x.stock === "number" ? x.stock : 0
      const minStock = typeof x.minStock === "number" ? x.minStock : 0
      const name = d.id
      if (stock === 0) outList.push({ name })
      else if (minStock > 0 && stock < minStock) low.push({ name, stock, minStock })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "שליחת מייל לא מוגדרת (RESEND_API_KEY)" }, { status: 503 })
    }

    const resend = new Resend(apiKey)
    const rowsLow =
      low.length === 0
        ? "<p>אין רכיבים במצב «נמוך» (מעל אפס ומתחת למינימום).</p>"
        : `<ul>${low.map((r) => `<li><strong>${escapeHtml(r.name)}</strong> — מלאי ${r.stock}, מינימום ${r.minStock}</li>`).join("")}</ul>`
    const rowsOut =
      outList.length === 0
        ? ""
        : `<h3 style="margin-top:1rem">אזל מהמלאי</h3><ul>${outList.map((r) => `<li><strong>${escapeHtml(r.name)}</strong></li>`).join("")}</ul>`

    const html = `
<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 560px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #1d4ed8;">דוח מלאי — ${escapeHtml(restaurantName)}</h2>
  <p>סיכום מהמערכת (לא בזמן אמת לשנייה).</p>
  <h3 style="margin-top:1rem">מתחת למינימום (ועדיין במלאי)</h3>
  ${rowsLow}
  ${rowsOut}
  <p style="font-size: 12px; color: #64748b; margin-top: 2rem;">Restaurant Pro</p>
</body>
</html>
`

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject: `מלאי נמוך — ${restaurantName}`,
      html,
    })

    if (error) {
      console.error("[low-stock-email]", error)
      return NextResponse.json({ error: error.message || "שגיאה בשליחה" }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      id: data?.id,
      counts: { low: low.length, out: outList.length },
    })
  } catch (e) {
    console.error("[notifications/low-stock-email]", e)
    return NextResponse.json({ error: "שגיאה" }, { status: 500 })
  }
}
