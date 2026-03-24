/**
 * מנה רגילה (לא מתכון מורכב) שנספרת בתפריט / עלויות תפריט / לוח בקרה.
 * ברירת מחדל: בתפריט. רק `onMenu: false` מוציא למאגר.
 */
export function recipeCountsAsMenuDish(data: { isCompound?: boolean; onMenu?: boolean }): boolean {
  if (data.isCompound) return false
  return data.onMenu !== false
}
