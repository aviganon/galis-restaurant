import { NextRequest, NextResponse } from "next/server"
import { requireFirebaseUser } from "@/lib/api-verify-firebase"
import { getFirebaseAdminFirestore, getFirebaseAdminStorageBucket } from "@/lib/firebase-admin-server"
import { loadAdminEmailSet } from "@/lib/firebase-admin-permissions"

export async function POST(req: NextRequest) {
  try {
    const auth = await requireFirebaseUser(req)
    if (!auth.ok) return auth.response

    const db = getFirebaseAdminFirestore()
    const bucket = getFirebaseAdminStorageBucket()
    if (!db || !bucket) {
      return NextResponse.json(
        { error: "השרת לא מוגדר לאדמין/Storage (FIREBASE_SERVICE_ACCOUNT_JSON + NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)" },
        { status: 503 },
      )
    }

    const body = await req.json().catch(() => ({} as { restaurantId?: string; jobId?: string; attachmentPath?: string }))
    const restaurantId = body.restaurantId?.trim()
    const jobId = body.jobId?.trim()
    const attachmentPath = body.attachmentPath?.trim()
    if (!restaurantId || !jobId || !attachmentPath) {
      return NextResponse.json({ error: "חסר restaurantId/jobId/attachmentPath" }, { status: 400 })
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
    const job = jobSnap.data() as { restaurantId?: string; attachmentPaths?: string[] } | undefined
    if (job?.restaurantId !== restaurantId) {
      return NextResponse.json({ error: "job לא שייך למסעדה" }, { status: 403 })
    }
    if (!Array.isArray(job?.attachmentPaths) || !job.attachmentPaths.includes(attachmentPath)) {
      return NextResponse.json({ error: "קובץ לא שייך ל-job" }, { status: 403 })
    }

    const f = bucket.file(attachmentPath)
    const [exists] = await f.exists()
    if (!exists) return NextResponse.json({ error: "קובץ לא נמצא ב-storage" }, { status: 404 })
    const [buf] = await f.download()
    const [meta] = await f.getMetadata()
    const filename = attachmentPath.split("/").pop() || "inbound-file"
    const contentType = meta.contentType || "application/octet-stream"
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (e) {
    console.error("[inbound-jobs/file] POST failed:", e)
    return NextResponse.json({ error: (e as Error)?.message || "שגיאה לא צפויה" }, { status: 500 })
  }
}

