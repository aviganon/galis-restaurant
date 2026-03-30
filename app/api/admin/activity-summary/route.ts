import { NextRequest, NextResponse } from "next/server"
import { requireFirebaseUser } from "@/lib/api-verify-firebase"
import { getFirebaseAdminFirestore } from "@/lib/firebase-admin-server"
import { callerIsSystemOwner } from "@/lib/caller-is-system-owner"

export const dynamic = "force-static"

const AUDIT = "auditEvents"

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

    const limitRaw = req.nextUrl.searchParams.get("auditLimit")
    const auditLim = Math.min(50, Math.max(5, parseInt(limitRaw || "15", 10) || 15))

    const [restsSnap, usersSnap, auditSnap] = await Promise.all([
      db.collection("restaurants").count().get(),
      db.collection("users").count().get(),
      db.collection(AUDIT).orderBy("createdAt", "desc").limit(auditLim).get().catch(() => null),
    ])

    const recentAudit =
      auditSnap?.docs.map((d) => {
        const x = d.data()
        const ts = x.createdAt?.toDate?.() ?? x.createdAt
        return {
          id: d.id,
          action: x.action,
          target: x.target ?? null,
          actorEmail: x.actorEmail ?? null,
          createdAt: ts instanceof Date ? ts.toISOString() : null,
        }
      }) ?? []

    return NextResponse.json({
      restaurantCount: restsSnap.data().count,
      userCount: usersSnap.data().count,
      recentAudit,
    })
  } catch (e) {
    console.error("[admin/activity-summary]", e)
    return NextResponse.json({ error: "שגיאה" }, { status: 500 })
  }
}
