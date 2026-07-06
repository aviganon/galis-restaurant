/**
 * המרת יחידות לחישוב עלות רכיב: כמה עולה כמות ביחידת המתכון, יחסית למחיר הנתון ביחידת הספק.
 * חסין לוריאנטים של כתיב (ק"ג / ק״ג / קג / kg / קילו; גרם / g; ליטר / מל וכו').
 */

/** משפחת יחידה + גודלה ביחידת בסיס (גרם / מ"ל). מנקה גרשיים ורווחים לזיהוי וריאנטים. */
export function unitBase(u: string | undefined): { fam: "mass" | "vol"; base: number } | null {
  const s = String(u || "").replace(/["'״׳. ]/g, "").replace(/\s+/g, "").toLowerCase()
  if (!s) return null
  if (["גרם", "גר", "גרמים", "g", "gr", "gram", "grams"].includes(s)) return { fam: "mass", base: 1 }
  if (["קג", "קילו", "קילוגרם", "kg", "kgs", "kilo", "kilogram"].includes(s)) return { fam: "mass", base: 1000 }
  if (["מל", "מיל", "ml", "cc", "סמק"].includes(s)) return { fam: "vol", base: 1 }
  if (["ליטר", "ליט", "ליטרים", "l", "lt", "liter", "litre"].includes(s)) return { fam: "vol", base: 1000 }
  return null
}

/** מקדם המרה בין יחידת המתכון ליחידת המחיר של הספק. 1 אם אי-אפשר להמיר (משפחות שונות/לא ידוע). */
export function unitConversionFactor(recipeUnit: string | undefined, priceUnit: string | undefined): number {
  const r = unitBase(recipeUnit)
  const p = unitBase(priceUnit)
  if (r && p && r.fam === p.fam) return r.base / p.base
  return 1
}
