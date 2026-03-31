import { NextRequest, NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import { requireFirebaseUser } from "@/lib/api-verify-firebase"
import { getFirebaseAdminFirestore } from "@/lib/firebase-admin-server"
import { isAuditLogRateLimited } from "@/lib/api-audit-rate-limit"

export const dynamic = "force-static"

const COL = "auditEvents"

/**
 * רישום אירוע ביקורת — המשתמש מזוהה מהאסימון בלבד.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireFirebaseUser(req)
    if (!auth.ok) return auth.response

    if (isAuditLogRateLimited(auth.decoded.uid)) {
      return NextResponse.json({ error: "יותר מדי בקשות — נסה שוב בעוד רגע" }, { status: 429 })
    }

    const db = getFirebaseAdminFirestore()
    if (!db) {
      return NextResponse.json({ error: "שרת לא מוגדר" }, { status: 503 })
    }

    const body = await req.json().catch(() => ({}))
    const action = typeof body.action === "string" ? body.action.trim().slice(0, 120) : ""
    if (!action) {
      return NextResponse.json({ error: "חסר action" }, { status: 400 })
    }
    const target = typeof body.target === "string" ? body.target.trim().slice(0, 500) : null
    const restaurantId =
      typeof body.restaurantId === "string" && body.restaurantId.trim() ? body.restaurantId.trim() : null
    const meta = body.meta && typeof body.meta === "object" && !Array.isArray(body.meta) ? body.meta : {}

    await db.collection(COL).add({
      actorUid: auth.decoded.uid,
      actorEmail: auth.decoded.email ?? null,
      action,
      target,
      restaurantId,
      meta,
      createdAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[audit/log]", e)
    return NextResponse.json({ error: "שגיאה" }, { status: 500 })
  }
}
