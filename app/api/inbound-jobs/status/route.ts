import { NextRequest, NextResponse } from "next/server"
import { requireFirebaseUser } from "@/lib/api-verify-firebase"
import { getFirebaseAdminFirestore } from "@/lib/firebase-admin-server"
import { loadAdminEmailSet } from "@/lib/firebase-admin-permissions"

type InboundStatus = "pending" | "processing" | "done" | "error"
type InboundDetectedType = "invoice" | "sales" | "other"

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

    const body = await req.json().catch(() => ({} as {
      restaurantId?: string
      jobId?: string
      status?: InboundStatus
      detectedType?: InboundDetectedType
      needsSupplierReview?: boolean
    }))
    const restaurantId = body.restaurantId?.trim()
    const jobId = body.jobId?.trim()
    const status = body.status
    const detectedType = body.detectedType
    const needsSupplierReview = body.needsSupplierReview
    if (!restaurantId || !jobId || !status) {
      return NextResponse.json({ error: "חסר restaurantId/jobId/status" }, { status: 400 })
    }
    if (!["pending", "processing", "done", "error"].includes(status)) {
      return NextResponse.json({ error: "status לא תקין" }, { status: 400 })
    }

    const [callerSnap, adminEmailSet] = await Promise.all([
      db.collection("users").doc(auth.decoded.uid).get(),
      loadAdminEmailSet(db),
    ])
    if (!callerSnap.exists) return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 403 })
    const caller = callerSnap.data() as { isSystemOwner?: boolean; restaurantId?: string | null }
    const callerEmail = auth.decoded.email?.toLowerCase()
    const isSystemOwner = caller.isSystemOwner === true || (!!callerEmail && adminEmailSet.has(callerEmail))
    if (!isSystemOwner && caller.restaurantId !== restaurantId) {
      return NextResponse.json({ error: "אין הרשאה למסעדה זו" }, { status: 403 })
    }

    const jobRef = db.collection("inboundJobs").doc(jobId)
    const jobSnap = await jobRef.get()
    if (!jobSnap.exists) return NextResponse.json({ error: "job לא נמצא" }, { status: 404 })
    const rid = (jobSnap.data() as { restaurantId?: string } | undefined)?.restaurantId
    if (rid !== restaurantId) return NextResponse.json({ error: "job לא שייך למסעדה" }, { status: 403 })

    const payload: {
      status: InboundStatus
      detectedType?: InboundDetectedType
      needsSupplierReview?: boolean
    } = { status }
    if (detectedType && ["invoice", "sales", "other"].includes(detectedType)) {
      payload.detectedType = detectedType
    }
    if (typeof needsSupplierReview === "boolean") {
      payload.needsSupplierReview = needsSupplierReview
    }
    await jobRef.set(payload, { merge: true })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[inbound-jobs/status] POST failed:", e)
    return NextResponse.json({ error: (e as Error)?.message || "שגיאה לא צפויה" }, { status: 500 })
  }
}

