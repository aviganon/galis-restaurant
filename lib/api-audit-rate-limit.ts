/**
 * הגבלת קצב ל־POST /api/audit/log לפי uid.
 * In-memory — מתאים למופע Node בודד; במספר replicas ללא sticky ההגבלה אינה מדויקת.
 */
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 80

const timestampsByUid = new Map<string, number[]>()

export function isAuditLogRateLimited(uid: string): boolean {
  const now = Date.now()
  const prev = timestampsByUid.get(uid) ?? []
  const recent = prev.filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) {
    timestampsByUid.set(uid, recent)
    return true
  }
  recent.push(now)
  timestampsByUid.set(uid, recent)
  if (timestampsByUid.size > 20_000) timestampsByUid.clear()
  return false
}
