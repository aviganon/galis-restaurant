import { NextRequest, NextResponse } from "next/server"
import { requireFirebaseUser } from "@/lib/api-verify-firebase"
import { getFirebaseAdminFirestore } from "@/lib/firebase-admin-server"

const MAX_TOKEN_LEN = 80

/**
 * בדיקת זמינות מזהה ייבוא מייל בלי חשיפת restaurantId של מסעדות אחרות.
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
    const token = typeof body.token === "string" ? body.token.trim().toLowerCase() : ""

    if (!restaurantId) {
      return NextResponse.json({ error: "חסר restaurantId" }, { status: 400 })
    }
    if (!token || token.length > MAX_TOKEN_LEN) {
      return NextResponse.json({ error: "מזהה לא תקין" }, { status: 400 })
    }

    const callerSnap = await db.collection("users").doc(auth.decoded.uid).get()
    if (!callerSnap.exists) {
      return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 403 })
    }
    const caller = callerSnap.data() as { isSystemOwner?: boolean; restaurantId?: string | null }
    if (!caller.isSystemOwner && caller.restaurantId !== restaurantId) {
      return NextResponse.json({ error: "אין גישה למסעדה" }, { status: 403 })
    }

    const snap = await db.doc(`inboundEmailLookup/${token}`).get()
    if (!snap.exists) {
      return NextResponse.json({ status: "available" as const })
    }
    const owner = String((snap.data() as { restaurantId?: string })?.restaurantId ?? "").trim()
    if (owner === restaurantId) {
      return NextResponse.json({ status: "same-restaurant" as const })
    }
    return NextResponse.json({ status: "taken" as const })
  } catch (e) {
    console.error("[inbound-lookup-status]", e)
    return NextResponse.json({ error: "שגיאה לא צפויה" }, { status: 500 })
  }
}
