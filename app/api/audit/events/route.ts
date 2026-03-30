import { NextRequest, NextResponse } from "next/server"
import { requireFirebaseUser } from "@/lib/api-verify-firebase"
import { getFirebaseAdminFirestore } from "@/lib/firebase-admin-server"
import { callerIsSystemOwner } from "@/lib/caller-is-system-owner"

export const dynamic = "force-static"

const COL = "auditEvents"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireFirebaseUser(req)
    if (!auth.ok) return auth.response

    const db = getFirebaseAdminFirestore()
    if (!db) {
      return NextResponse.json({ error: "שרת לא מוגדר" }, { status: 503 })
    }

    const ok = await callerIsSystemOwner(db, auth.decoded)
    if (!ok) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 })
    }

    const limitRaw = req.nextUrl.searchParams.get("limit")
    const lim = Math.min(100, Math.max(1, parseInt(limitRaw || "40", 10) || 40))

    const snap = await db.collection(COL).orderBy("createdAt", "desc").limit(lim).get()
    const items = snap.docs.map((d) => {
      const x = d.data()
      const ts = x.createdAt?.toDate?.() ?? x.createdAt
      return {
        id: d.id,
        action: x.action,
        target: x.target ?? null,
        restaurantId: x.restaurantId ?? null,
        actorEmail: x.actorEmail ?? null,
        actorUid: x.actorUid ?? null,
        meta: x.meta ?? {},
        createdAt: ts instanceof Date ? ts.toISOString() : null,
      }
    })

    return NextResponse.json({ items })
  } catch (e) {
    console.error("[audit/events]", e)
    return NextResponse.json({ error: "שגיאה" }, { status: 500 })
  }
}
