/**
 * הגבלת קצב פשוטה ל־/api/claude (זיכרון תהליך — ב־serverless כל instance בנפרד).
 */
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 40
const timestampsByUid = new Map<string, number[]>()

export function claudeRateLimitAllow(uid: string): boolean {
  const now = Date.now()
  const arr = timestampsByUid.get(uid) ?? []
  const recent = arr.filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) {
    timestampsByUid.set(uid, recent)
    return false
  }
  recent.push(now)
  timestampsByUid.set(uid, recent)
  if (timestampsByUid.size > 5000) {
    for (const [k, v] of timestampsByUid) {
      if (v.every((t) => now - t >= WINDOW_MS)) timestampsByUid.delete(k)
    }
  }
  return true
}
