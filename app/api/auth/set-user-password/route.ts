import { NextRequest, NextResponse } from "next/server"
import type { Firestore } from "firebase-admin/firestore"
import { loadAdminEmailSet } from "@/lib/firebase-admin-permissions"
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "@/lib/firebase-admin-server"

/**
 * בודק אם המחובר רשאי להגדיר סיסמה למשתמש היעד (בעל מערכת / מנהל+באותה מסעדה).
 */
async function canSetPasswordForUser(
  db: Firestore,
  adminEmailSet: Set<string>,
  callerUid: string,
  callerEmail: string | undefined,
  targetUid: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [callerSnap, targetSnap] = await Promise.all([
    db.collection("users").doc(callerUid).get(),
    db.collection("users").doc(targetUid).get(),
  ])
  if (!targetSnap.exists) {
    return { ok: false, error: "משתמש יעד לא נמצא במערכת" }
  }
  if (!callerSnap.exists) {
    return { ok: false, error: "לא נמצאו פרטי משתמש מחובר" }
  }
  const caller = callerSnap.data()!
  const target = targetSnap.data()!

  const callerEmailLower = callerEmail?.toLowerCase()
  const inAdminsList = !!(callerEmailLower && adminEmailSet.has(callerEmailLower))
  const callerIsSystemOwner = caller.isSystemOwner === true || inAdminsList

  if (callerIsSystemOwner) {
    return { ok: true }
  }

  const callerRole = String(caller.role || "user")
  const canManage = callerRole === "manager" || callerRole === "admin" || callerRole === "owner"
  if (!canManage) {
    return { ok: false, error: "אין הרשאה לעדכון סיסמה" }
  }

  if (target.isSystemOwner === true) {
    return { ok: false, error: "לא ניתן לעדכן סיסמה לבעל מערכת" }
  }

  const cr = caller.restaurantId as string | null | undefined
  const tr = target.restaurantId as string | null | undefined
  if (!cr || !tr || cr !== tr) {
    return { ok: false, error: "ניתן לעדכן רק משתמשים באותה מסעדה" }
  }

  return { ok: true }
}

/**
 * POST — Authorization: Bearer &lt;Firebase ID token&gt;
 * Body: { targetUid: string, newPassword: string } (סיסמה מינימום 6 תווים — דרישת Firebase)
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 })
    }
    const idToken = authHeader.slice(7).trim()
    if (!idToken) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 })
    }

    const adminAuth = getFirebaseAdminAuth()
    const db = getFirebaseAdminFirestore()
    if (!adminAuth || !db) {
      return NextResponse.json(
        { error: "השרת לא מוגדר לאדמין (הוסף FIREBASE_SERVICE_ACCOUNT_JSON)" },
        { status: 503 },
      )
    }

    let decoded: { uid: string; email?: string }
    try {
      decoded = await adminAuth.verifyIdToken(idToken)
    } catch {
      return NextResponse.json({ error: "אסימון לא תקף — התחבר מחדש" }, { status: 401 })
    }

    const body = await req.json()
    const targetUid = typeof body.targetUid === "string" ? body.targetUid.trim() : ""
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : ""
    if (!targetUid) {
      return NextResponse.json({ error: "חסר מזהה משתמש" }, { status: 400 })
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "הסיסמה חייבת להכיל לפחות 6 תווים" }, { status: 400 })
    }

    const adminEmailSet = await loadAdminEmailSet(db)
    const allowed = await canSetPasswordForUser(db, adminEmailSet, decoded.uid, decoded.email, targetUid)
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.error }, { status: 403 })
    }

    try {
      await adminAuth.updateUser(targetUid, { password: newPassword })
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : ""
      console.error("[set-user-password] updateUser failed:", e)
      if (code === "auth/user-not-found") {
        return NextResponse.json({ error: "לא נמצא חשבון התחברות למשתמש זה" }, { status: 404 })
      }
      return NextResponse.json({ error: "שגיאה בעדכון הסיסמה" }, { status: 500 })
    }

    return NextResponse.json({ ok: true as const })
  } catch (e) {
    console.error("[set-user-password] route error:", e)
    return NextResponse.json({ error: "שגיאה לא צפויה" }, { status: 500 })
  }
}
