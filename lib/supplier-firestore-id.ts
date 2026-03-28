/**
 * מזהה מסמך אחיד ל־`suppliers/{id}` בכל האפליקציה.
 * חייב להתאים לשם התצוגה ברכיבים (שדה supplier) — אבל בלי `/` ו־`.` ששוברים נתיבים / יוצרים מסמכים כפולים.
 */
export function supplierFirestoreDocId(supplierName: string): string {
  return String(supplierName || "")
    .replace(/\//g, "_")
    .replace(/\./g, "_")
    .trim() || "supplier"
}

/** מזהה מסמך ב־`ingredients/{id}` / `restaurants/.../ingredients/{id}` — ללא `/` או `\` ששוברים נתיב ב-Firestore */
export function ingredientFirestoreDocId(ingredientName: string): string {
  return String(ingredientName || "")
    .trim()
    .replace(/\//g, "_")
    .replace(/\\/g, "_")
    .trim() || "unnamed"
}
