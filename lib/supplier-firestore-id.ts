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
