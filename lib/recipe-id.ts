/** מזהה מסמך מתכון ב-Firestore — ללא / \\ (אסורים), לא ריק */
export function safeFirestoreRecipeId(raw: string): string {
  let s = raw.trim().replace(/[/\\]/g, "-").replace(/\s+/g, " ")
  if (!s) return `dish_${Date.now()}`
  if (s === "." || s === "..") return `dish_${Date.now()}`
  return s.slice(0, 700)
}
