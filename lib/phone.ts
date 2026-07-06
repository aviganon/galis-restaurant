/**
 * נרמול מספר טלפון לפורמט בינלאומי לצורך קישור wa.me (ללא + מוביל).
 * מטפל בפורמטים ישראליים נפוצים:
 *   "050-1234567"  → "972501234567"
 *   "+972 50-1234567" → "972501234567"
 *   "00972501234567"  → "972501234567"
 *   "0501234567"   → "972501234567"
 * מחזיר מחרוזת ריקה אם אין ספרות.
 */
export function toWhatsappNumber(raw: string): string {
  let d = String(raw || "").replace(/[^0-9]/g, "")
  if (!d) return ""
  if (d.startsWith("00")) d = d.slice(2) // קידומת חיוג בינלאומי 00<CC>
  if (d.startsWith("972")) return d
  if (d.startsWith("0")) return "972" + d.slice(1) // מספר ישראלי מקומי עם 0 מוביל
  return "972" + d // מספר מקומי ללא 0 מוביל
}

/** בונה הודעת הזמנה קריאה לשליחה ב-WhatsApp / מייל */
export function buildOrderMessage(params: {
  orderNumber: string
  supplierName: string
  items: { name: string; quantity: number; unit: string }[]
  total: number
}): string {
  const lines = params.items.map((i) => `• ${i.name}: ${i.quantity} ${i.unit}`)
  return [
    `הזמנה ${params.orderNumber}`,
    `ספק: ${params.supplierName}`,
    "",
    ...lines,
    "",
    `סה״כ: ₪${params.total.toFixed(2)}`,
  ].join("\n")
}
