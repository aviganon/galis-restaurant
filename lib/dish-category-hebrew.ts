/**
 * קטגוריות מנות קנוניות בעברית (כמו בעץ מוצר) — נשמרות ב-Firestore.
 * AI לפעמים מחזיר באנגלית; מנרמלים לפני שמירה ולטעינה.
 */
export const HEBREW_DISH_CATEGORIES = [
  "עיקריות",
  "ראשונות",
  "סלטים",
  "קינוחים",
  "משקאות",
  "משקאות אלכוהוליים",
  "תוספות",
  "אחר",
] as const

const HEBREW_SET = new Set<string>(HEBREW_DISH_CATEGORIES)

/** מיפוי אנגלית (לא רגיש לרישיות) → עברית */
const EN_TO_HEBREW: Record<string, string> = {
  "main dishes": "עיקריות",
  "main dish": "עיקריות",
  "mains": "עיקריות",
  "main": "עיקריות",
  "entrees": "עיקריות",
  "entrées": "עיקריות",
  "starters": "ראשונות",
  "starter": "ראשונות",
  "appetizers": "ראשונות",
  "appetizer": "ראשונות",
  "first courses": "ראשונות",
  "salads": "סלטים",
  "salad": "סלטים",
  "desserts": "קינוחים",
  "dessert": "קינוחים",
  "drinks": "משקאות",
  "drink": "משקאות",
  "beverages": "משקאות",
  "non-alcoholic": "משקאות",
  "alcoholic drinks": "משקאות אלכוהוליים",
  "alcoholic": "משקאות אלכוהוליים",
  "alcohol": "משקאות אלכוהוליים",
  cocktails: "משקאות אלכוהוליים",
  cocktail: "משקאות אלכוהוליים",
  wine: "משקאות אלכוהוליים",
  beer: "משקאות אלכוהוליים",
  sides: "תוספות",
  side: "תוספות",
  "side dishes": "תוספות",
  other: "אחר",
  others: "אחר",
  soups: "ראשונות",
  soup: "ראשונות",
  pasta: "עיקריות",
  pizza: "עיקריות",
  pizzas: "עיקריות",
}

export function normalizeDishCategoryToHebrew(raw: string | undefined | null): string {
  const d = (raw ?? "").trim()
  if (!d) return "עיקריות"
  if (HEBREW_SET.has(d)) return d
  const lower = d.toLowerCase().replace(/\s+/g, " ").trim()
  if (EN_TO_HEBREW[lower]) return EN_TO_HEBREW[lower]
  // וריאציות נפוצות בעברית
  if (/עיקר|מנה עיקרית|מנות עיקריות|בשרים|דגים|פסטות/i.test(d)) return "עיקריות"
  if (/ראשונ|אנטי|לפני/i.test(d)) return "ראשונות"
  if (/סלט/i.test(d)) return "סלטים"
  if (/קינוח/i.test(d)) return "קינוחים"
  if (/משקה|שתייה|מיץ|קפה|תה/i.test(d) && !/אלכוהול|יין|בירה|קוקטייל|וודקה|וויסקי/i.test(d))
    return "משקאות"
  if (/אלכוהול|יין|בירה|קוקטייל|בר|וויסקי|וודקה|רום|ג'ין/i.test(d)) return "משקאות אלכוהוליים"
  if (/תוספת/i.test(d)) return "תוספות"
  return "עיקריות"
}
