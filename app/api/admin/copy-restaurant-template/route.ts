import { NextRequest, NextResponse } from "next/server"
import { requireFirebaseUser } from "@/lib/api-verify-firebase"
import { getFirebaseAdminFirestore } from "@/lib/firebase-admin-server"
import { callerIsSystemOwner } from "@/lib/caller-is-system-owner"

export const dynamic = "force-static"

/**
 * מעתיק הגדרות «תבנית» בין מסעדות: assignedSuppliers + notificationSettings (תחת appState).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireFirebaseUser(req)
    if (!auth.ok) return auth.response

    const db = getFirebaseAdminFirestore()
    if (!db) {
      return NextResponse.json({ error: "שרת לא מוגדר" }, { status: 503 })
    }

    const owner = await callerIsSystemOwner(db, auth.decoded)
    if (!owner) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const sourceId = typeof body.sourceRestaurantId === "string" ? body.sourceRestaurantId.trim() : ""
    const targetId = typeof body.targetRestaurantId === "string" ? body.targetRestaurantId.trim() : ""
    if (!sourceId || !targetId || sourceId === targetId) {
      return NextResponse.json({ error: "מזהי מסעדה לא תקינים" }, { status: 400 })
    }

    const [src, tgt] = await Promise.all([
      db.collection("restaurants").doc(sourceId).get(),
      db.collection("restaurants").doc(targetId).get(),
    ])
    if (!src.exists || !tgt.exists) {
      return NextResponse.json({ error: "מסעדה לא נמצאה" }, { status: 404 })
    }

    const [asSnap, nsSnap] = await Promise.all([
      db.doc(`restaurants/${sourceId}/appState/assignedSuppliers`).get(),
      db.doc(`restaurants/${sourceId}/appState/notificationSettings`).get(),
    ])

    const batch = db.batch()
    if (asSnap.exists) {
      batch.set(db.doc(`restaurants/${targetId}/appState/assignedSuppliers`), asSnap.data() ?? {}, { merge: true })
    }
    if (nsSnap.exists) {
      batch.set(db.doc(`restaurants/${targetId}/appState/notificationSettings`), nsSnap.data() ?? {}, { merge: true })
    }
    await batch.commit()

    return NextResponse.json({
      ok: true,
      copied: {
        assignedSuppliers: asSnap.exists,
        notificationSettings: nsSnap.exists,
      },
    })
  } catch (e) {
    console.error("[admin/copy-restaurant-template]", e)
    return NextResponse.json({ error: "שגיאה" }, { status: 500 })
  }
}
