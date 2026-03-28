import { NextRequest, NextResponse } from "next/server"
import { requireFirebaseUser } from "@/lib/api-verify-firebase"
import { getFirebaseAdminFirestore } from "@/lib/firebase-admin-server"
import { assertClaudeProxyAllowed } from "@/lib/firebase-admin-claude-guard"
import { claudeRateLimitAllow } from "@/lib/claude-api-rate-limit"

const MAX_BODY_BYTES = 280_000

export async function POST(req: NextRequest) {
  try {
    const gate = await requireFirebaseUser(req)
    if (!gate.ok) return gate.response

    const db = getFirebaseAdminFirestore()
    if (!db) {
      return NextResponse.json(
        { error: "השרת לא מוגדר לאדמין (הוסף FIREBASE_SERVICE_ACCOUNT_JSON)" },
        { status: 503 },
      )
    }

    const allowed = await assertClaudeProxyAllowed(db, gate.decoded.uid)
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.message }, { status: allowed.status })
    }

    if (!claudeRateLimitAllow(gate.decoded.uid)) {
      return NextResponse.json(
        { error: "יותר מדי בקשות ל־AI — נסה שוב בעוד דקה" },
        { status: 429 },
      )
    }

    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "גוף הבקשה גדול מדי" }, { status: 413 })
    }

    let body: unknown
    try {
      body = JSON.parse(raw) as unknown
    } catch {
      return NextResponse.json({ error: "JSON לא תקין" }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      )
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    })

    const data = await resp.json()
    return NextResponse.json(data, { status: resp.status })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? "Unknown error" },
      { status: 500 }
    )
  }
}
