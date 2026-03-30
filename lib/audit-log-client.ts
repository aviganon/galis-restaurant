import { firebaseBearerHeaders } from "@/lib/api-auth-client"

/** רישום פעולה ליומן ביקורת (שרת — לא ניתן לזייף uid). */
export async function logAuditAction(payload: {
  action: string
  target?: string
  restaurantId?: string | null
  meta?: Record<string, unknown>
}): Promise<void> {
  try {
    const res = await fetch("/api/audit/log", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await firebaseBearerHeaders()) },
      body: JSON.stringify(payload),
    })
    if (!res.ok) await res.json().catch(() => ({}))
  } catch {
    /* לא חוסם זרימת UI */
  }
}
