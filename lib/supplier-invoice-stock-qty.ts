/**
 * חישוב כמות לעדכון מלאי בייבוא חשבונית כשבקובץ אין עמודת "כמות"
 * (נפוץ במחירוני משקאות) — בלי להמציא כמות למוצרי משקל.
 */

function isWeightOnlyUnit(unit: string): boolean {
  const u = unit.replace(/\s+/g, " ").trim()
  if (!u) return false
  return /^(קג|ק"|ק״ג|גרם|g|kg)\b/i.test(u) || /^גרם$|^קג$/i.test(u)
}

/** מספר יחידות מארז מהשם — x24, חבילה 6, (12 יח') */
export function parsePackCountFromProductName(name: string): number {
  const n = name.trim()
  if (!n) return 0
  const cap = (x: number) => (Number.isFinite(x) && x > 0 && x < 100_000 ? Math.floor(x) : 0)

  let m = n.match(/(?:^|\s)(\d+)\s*[x×X]\s*\d/)
  if (m) return cap(parseInt(m[1], 10))

  m = n.match(/(?:חבילה|מארז|קרטון|שק)\s*[:\s]*(\d+)/i)
  if (m) return cap(parseInt(m[1], 10))

  m = n.match(/\((\d+)\s*(?:יח|יח')\)/)
  if (m) return cap(parseInt(m[1], 10))

  m = n.match(/\b(\d+)\s*(?:יחידות|בקבוקים|פחיות)\b/i)
  if (m) return cap(parseInt(m[1], 10))

  return 0
}

const ALCOHOL_OR_BOTTLE_NAME_RE =
  /ויסקי|וויסקי|גין|ג'ין|רום|וודקה|טקילה|ברנדי|קוניאק|ליקר|יין|שמפניה|בירה|אפרול|קמפרי|אמארו|ברמוט|פורט|שארי|מזקקה|נפוליאון|משקה\s*חריף|אלכוהול|מסטיק|סידר|פרוזק|קאווה|קאוואה|קלואה|מוגז|סודה|תוסס|whiskey|whisky|vodka|gin|rum|tequila|brandy|cognac|liqueur|wine|beer|champagne|prosecco|cider|spritz|aperitif/i

function isLikelyBottleOrDiscreteBeverage(name: string, unit: string): boolean {
  if (/יחידה|יח'|בקבוק|מארז|חבילה|קרטון|קופסה|שקית|pack|bottle|unit|can\b|פחית/i.test(unit))
    return true
  const uCompact = unit.replace(/\s/g, "")
  if (/^(ליטר|מ"|מ״ל|ml)\b/i.test(uCompact)) return ALCOHOL_OR_BOTTLE_NAME_RE.test(name)

  return ALCOHOL_OR_BOTTLE_NAME_RE.test(name)
}

/**
 * כמות לשימוש במלאי (חיבור ל־prevStock בייבוא מסעדה).
 * אם יש qty מפורש בקובץ — משתמשים בו.
 * אחרת: רמז מהשם, או 1 למשקאות/יחידות — לא לק״ג/גרם בלי כמות.
 */
export function resolveInvoiceStockQty(item: {
  qty?: number
  price: number
  unit?: string
  name?: string
}): number {
  const explicit = typeof item.qty === "number" && !Number.isNaN(item.qty) ? item.qty : 0
  if (explicit > 0) return explicit
  if (item.price <= 0) return 0

  const name = (item.name || "").trim()
  const unit = (item.unit || "").trim()

  const fromName = parsePackCountFromProductName(name)
  if (fromName > 0) return fromName

  if (isWeightOnlyUnit(unit)) return 0

  if (isLikelyBottleOrDiscreteBeverage(name, unit)) return 1

  return 0
}
