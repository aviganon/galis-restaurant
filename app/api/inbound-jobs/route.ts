import { NextRequest, NextResponse } from "next/server"
import { requireFirebaseUser } from "@/lib/api-verify-firebase"
import { getFirebaseAdminFirestore } from "@/lib/firebase-admin-server"
import { loadAdminEmailSet } from "@/lib/firebase-admin-permissions"

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

    const body = await req.json().catch(() => ({} as { restaurantId?: string }))
    const restaurantId = body.restaurantId?.trim()
    if (!restaurantId) {
      return NextResponse.json({ error: "חסר restaurantId" }, { status: 400 })
    }

    const [callerSnap, adminEmailSet] = await Promise.all([
      db.collection("users").doc(auth.decoded.uid).get(),
      loadAdminEmailSet(db),
    ])
    if (!callerSnap.exists) {
      return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 403 })
    }
    const caller = callerSnap.data() as { isSystemOwner?: boolean; restaurantId?: string | null }
    const callerEmail = auth.decoded.email?.toLowerCase()
    const isSystemOwner = caller.isSystemOwner === true || (!!callerEmail && adminEmailSet.has(callerEmail))
    if (!isSystemOwner && caller.restaurantId !== restaurantId) {
      return NextResponse.json({ error: "אין הרשאה למסעדה זו" }, { status: 403 })
    }

    const snap = await db
      .collection("inboundJobs")
      .where("restaurantId", "==", restaurantId)
      .orderBy("receivedAt", "desc")
      .limit(200)
      .get()

    const jobs = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>
      return {
        id: d.id,
        restaurantId: data.restaurantId ?? null,
        fromEmail: data.fromEmail ?? "",
        subject: data.subject ?? "",
        status: data.status ?? "pending",
        receivedAt: data.receivedAt ?? "",
        attachmentPaths: Array.isArray(data.attachmentPaths) ? data.attachmentPaths : [],
      }
    })
    return NextResponse.json({ jobs })
  } catch (e) {
    console.error("[inbound-jobs] GET failed:", e)
    return NextResponse.json({ error: "שגיאה לא צפויה" }, { status: 500 })
  }
}

