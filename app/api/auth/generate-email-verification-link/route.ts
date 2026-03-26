import { NextRequest, NextResponse } from "next/server"
import { requireFirebaseUser } from "@/lib/api-verify-firebase"
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "@/lib/firebase-admin-server"
import { loadAdminEmailSet } from "@/lib/firebase-admin-permissions"

/**
 * מחזיר "קישור אימות כתובת מייל" שניתן לשים במייל (Resend) במקום להסתמך על sendEmailVerification.
 * הרשאה: רק בעל מערכת או אימייל שמופיע ב-config/admins.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireFirebaseUser(req)
    if (!auth.ok) return auth.response

    const db = getFirebaseAdminFirestore()
    const adminAuth = getFirebaseAdminAuth()
    if (!db || !adminAuth) {
      return NextResponse.json(
        { error: "השרת לא מוגדר לאדמין (הוסף FIREBASE_SERVICE_ACCOUNT_JSON)" },
        { status: 503 },
      )
    }

    const body = await req.json()
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "אימייל לא תקין" }, { status: 400 })
    }

    const adminEmailSet = await loadAdminEmailSet(db)
    const callerSnap = await db.collection("users").doc(auth.decoded.uid).get()
    const callerData = callerSnap.exists ? callerSnap.data() : undefined
    const callerEmailLower = auth.decoded.email?.toLowerCase()

    const callerIsSystemOwner =
      callerData?.isSystemOwner === true || (!!callerEmailLower && adminEmailSet.has(callerEmailLower))

    if (!callerIsSystemOwner) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://galis-6ebbc.web.app"
    const link = await adminAuth.generateEmailVerificationLink(email, { url: appUrl })
    return NextResponse.json({ link })
  } catch (e) {
    console.error("[generate-email-verification-link] error:", e)
    return NextResponse.json({ error: "שגיאה לא צפויה" }, { status: 500 })
  }
}

