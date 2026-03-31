import { firebaseBearerHeaders } from "@/lib/api-auth-client"
import { reportError } from "@/lib/error-report"

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
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      const msg =
        typeof (j as { error?: string }).error === "string"
          ? (j as { error: string }).error
          : `audit/log ${res.status}`
      reportError("logAuditAction failed", new Error(msg))
      if (process.env.NODE_ENV === "development") {
        console.warn("[logAuditAction]", payload.action, res.status, j)
      }
    }
  } catch (e) {
    reportError("logAuditAction network", e)
    if (process.env.NODE_ENV === "development") console.warn("[logAuditAction]", e)
  }
}
