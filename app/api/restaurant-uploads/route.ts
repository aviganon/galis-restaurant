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
      .collection("restaurants")
      .doc(restaurantId)
      .collection("uploads")
      .limit(500)
      .get()

    const uploads = snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>
        return {
          id: d.id,
          fileName: data.fileName ?? d.id,
          supplier: data.supplier ?? "",
          uploadedAt: data.uploadedAt ?? data.createdAt ?? "",
          documentType: data.documentType ?? "other",
          ingredientCount: typeof data.ingredientCount === "number" ? data.ingredientCount : 0,
        }
      })
      .sort((a, b) => String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")))

    return NextResponse.json({ uploads })
  } catch (e) {
    console.error("[restaurant-uploads] POST failed:", e)
    return NextResponse.json({ error: (e as Error)?.message || "שגיאה לא צפויה" }, { status: 500 })
  }
}

