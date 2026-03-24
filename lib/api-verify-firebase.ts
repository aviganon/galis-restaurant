import { NextRequest, NextResponse } from "next/server"
import type { DecodedIdToken } from "firebase-admin/auth"
import { getFirebaseAdminAuth } from "@/lib/firebase-admin-server"

export async function requireFirebaseUser(req: NextRequest): Promise<
  { ok: true; decoded: DecodedIdToken } | { ok: false; response: NextResponse }
> {
  const adminAuth = getFirebaseAdminAuth()
  if (!adminAuth) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "השרת לא מוגדר לאדמין (הוסף FIREBASE_SERVICE_ACCOUNT_JSON)" },
        { status: 503 },
      ),
    }
  }
  const authHeader = req.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, response: NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 }) }
  }
  const idToken = authHeader.slice(7).trim()
  if (!idToken) {
    return { ok: false, response: NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 }) }
  }
  try {
    const decoded = await adminAuth.verifyIdToken(idToken)
    return { ok: true, decoded }
  } catch {
    return { ok: false, response: NextResponse.json({ error: "אסימון לא תקף — התחבר מחדש" }, { status: 401 }) }
  }
}
