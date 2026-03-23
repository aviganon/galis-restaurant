/**
 * תווית תפקיד לרשימת משתמשים (בעל מערכת) — לא מסתמך רק על users.role
 * כי בעל מערכת יכול להישאר עם role=manager אחרי שיוך/הסרת מסעדה.
 */
export function directoryUserRoleLabel(u: {
  role: string
  isSystemOwner?: boolean
  restaurantId?: string | null
}): string {
  if (u.isSystemOwner) {
    const r = (u.role || "").toLowerCase()
    const inRest = !!(u.restaurantId && String(u.restaurantId).trim())
    if (inRest && (r === "manager" || r === "admin")) {
      return "בעל מערכת · מנהל במסעדה"
    }
    return "בעל מערכת"
  }
  const r = (u.role || "user").toLowerCase()
  if (r === "manager" || r === "admin") return "מנהל"
  if (r === "owner") return "בעלים"
  return "משתמש"
}

/** לחיפוש — מחרוזות שמופיעות בתווית */
export function directoryUserRoleSearchText(u: {
  role: string
  isSystemOwner?: boolean
  restaurantId?: string | null
}): string {
  const label = directoryUserRoleLabel(u)
  return `${label} ${u.role || ""}`.toLowerCase()
}
