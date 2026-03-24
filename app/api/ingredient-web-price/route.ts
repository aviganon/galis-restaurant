import { NextRequest, NextResponse } from "next/server"
import { requireFirebaseUser } from "@/lib/api-verify-firebase"

export interface WebPriceResult {
  price: number
  store: string
  unit: string
  source: "web" | "ai"
}

const CACHE_HOURS = 24

async function searchWithSerper(query: string, apiKey: string): Promise<string> {
  const resp = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, gl: "il", hl: "iw", num: 10 }),
  })
  if (!resp.ok) throw new Error("Serper search failed")
  const data = await resp.json()
  const snippets = (data.organic || []).slice(0, 8).map((o: { title?: string; snippet?: string }) => `${o.title || ""}: ${o.snippet || ""}`).join("\n\n")
  return snippets || ""
}

async function extractWithClaude(ingredientName: string, searchSnippets: string | null): Promise<WebPriceResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const systemPrompt = `אתה מומחה למחירי מוצרי מזון בישראל. חלץ מהמידע (אם יש) או מהבנתך:
- מחיר בשקלים (מספר)
- חנות/רשת (רמי לוי, שופרסל, ויקטורי, יוחננוף, מגה בעיר, סופרמרקט מקומי וכו')
- יחידה (קג, גרם, ליטר, יחידה וכו')

אם אין מידע עדכני — השתמש בידע כללי על מחירים טיפוסיים. החזר JSON בלבד: {"price":0,"store":"שם חנות","unit":"יחידה"}`

  const userContent = searchSnippets
    ? `חיפוש באינטרנט עבור "מחיר ${ingredientName} ישראל":\n\n${searchSnippets}\n\nחלץ את המחיר הכי זול והחנות. JSON בלבד.`
    : `מה המחיר הטיפוסי ל-${ingredientName} בסופרמרקטים בישראל? איפה הכי זול? החזר JSON: {"price":0,"store":"שם","unit":"יחידה"}`

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: "user", content: [{ type: "text", text: userContent }] }],
    }),
  })

  if (!resp.ok) return null
  const data = await resp.json()
  const text = data.content?.[0]?.text ?? ""
  const clean = text.replace(/```json|```/g, "").trim()
  try {
    const parsed = JSON.parse(clean) as { price?: number; store?: string; unit?: string }
    if (typeof parsed?.price !== "number" || parsed.price <= 0) return null
    return {
      price: parsed.price,
      store: (parsed.store as string) || "לא צוין",
      unit: (parsed.unit as string) || "קג",
      source: searchSnippets ? "web" : "ai",
    }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireFirebaseUser(req)
    if (!gate.ok) return gate.response

    const { name } = await req.json()
    const ingredientName = typeof name === "string" ? name.trim() : ""
    if (!ingredientName) {
      return NextResponse.json({ error: "Missing ingredient name" }, { status: 400 })
    }

    let searchSnippets: string | null = null
    const serperKey = process.env.SERPER_API_KEY
    if (serperKey) {
      try {
        searchSnippets = await searchWithSerper(`מחיר ${ingredientName} ישראל סופרמרקט`, serperKey)
      } catch {
        // continue without search
      }
    }

    const result = await extractWithClaude(ingredientName, searchSnippets)
    if (!result) {
      return NextResponse.json({ error: "Could not extract price" }, { status: 500 })
    }

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
