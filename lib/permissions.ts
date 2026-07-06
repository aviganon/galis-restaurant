import type { UserPermissions } from "@/contexts/app-context"

/** בעל תפריט מלא: בעל־מערכת / owner / admin / manager */
export const hasFullMenu = (role: string, isSystemOwner?: boolean) =>
  isSystemOwner || role === "owner" || role === "admin" || role === "manager"

/** גלוי אלא אם סומן במפורש false (ברירת מחדל: גלוי) */
export const userCanSee = (perms: UserPermissions | undefined, key: keyof UserPermissions) =>
  perms?.[key] !== false

/** גלוי רק אם סומן במפורש true (opt-in — למידע רגיש) */
export const userCanSeeOptIn = (perms: UserPermissions | undefined, key: keyof UserPermissions) =>
  !!perms?.[key]

/** שער הרשאה לאריח בתפריט הכפתורים */
export type TileGate =
  | { kind: "always" }
  | { kind: "full" }
  | { kind: "canSee"; key: keyof UserPermissions }
  | { kind: "optIn"; key: keyof UserPermissions }

export function tileVisible(
  gate: TileGate,
  role: string,
  perms: UserPermissions | undefined,
  isSystemOwner?: boolean,
): boolean {
  const full = hasFullMenu(role, isSystemOwner)
  switch (gate.kind) {
    case "always":
      return true
    case "full":
      return full
    case "canSee":
      return full || userCanSee(perms, gate.key)
    case "optIn":
      return full || userCanSeeOptIn(perms, gate.key)
  }
}
