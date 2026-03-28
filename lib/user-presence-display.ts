/** ערך lastSeenAt מ-Firestore (Timestamp או ISO) */
export type PresenceLastSeenAt = string | number | { toDate?: () => Date } | null | undefined

/** אחרי פרק זה בלי heartbeat — נחשב כלא מחובר גם אם isOnline=true ב-Firestore */
export const PRESENCE_STALE_MS = 3 * 60 * 1000

export function lastSeenAtToMs(v: PresenceLastSeenAt): number | null {
  if (v == null) return null
  if (typeof v === "object" && typeof v.toDate === "function") {
    const d = v.toDate()
    const t = d.getTime()
    return Number.isNaN(t) ? null : t
  }
  const d = new Date(v as string | number)
  const t = d.getTime()
  return Number.isNaN(t) ? null : t
}

/**
 * מציגים «מחובר עכשיו» רק אם השרת אומר online ויש פעילות אחרונה בתוך החלון.
 * פותר מצב שבו isOnline נשאר true אחרי סגירת דפדפן / התנתקות שלא עדכנה את המסמך.
 */
export function shouldShowUserOnline(isOnline: boolean | undefined, lastSeenAt: PresenceLastSeenAt): boolean {
  if (!isOnline) return false
  const t = lastSeenAtToMs(lastSeenAt)
  if (t == null) return false
  return Date.now() - t < PRESENCE_STALE_MS
}
