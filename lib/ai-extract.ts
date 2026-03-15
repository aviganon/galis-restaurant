"use client"

import Papa from "papaparse"
import * as XLSX from "xlsx"
import { fileToBase64, callClaude } from "./claude"

export type ExtractType = "p" | "d" | "s"
// p = supplier prices/invoice, d = dishes/menu, s = sales report

export type DetectedDocType = "menu" | "sales" | "invoice" | "unknown"

const DETECT_SYSTEM = `אתה מנתח מסמכים. קבע את סוג המסמך בתמונה/קובץ:
- menu: תפריט מסעדה (מנות, מחירים, קטגוריות)
- sales: דוח מכירות (מכירות, כמויות שנמכרו, סטטיסטיקות)
- invoice: חשבונית ספק, תעודת משלוח, תעודת שליחה, אישור הזמנה (פריטים וכמויות — גם ללא מחירים)

החזר JSON בלבד: {"type":"menu"} או {"type":"sales"} או {"type":"invoice"} או {"type":"unknown"}`

export interface ExtractedSupplierItem {
  name: string
  price: number
  unit: string
  sku?: string
  /** כמות שהתקבלה — מעדכן מלאי אוטומטית */
  qty?: number
}

export interface ExtractedDishItem {
  name: string
  price: number
  category?: string
  ingredients?: Array<{ name: string; qty: number; unit: string }>
}

export interface ExtractedSalesItem {
  name: string
  qty: number
  price: number
}

export type ExtractedItem = ExtractedSupplierItem | ExtractedDishItem | ExtractedSalesItem

export interface ExtractResult {
  items: ExtractedItem[]
  supplier_name?: string
  invoice_date?: string | null
  no_prices?: boolean
}

const SUPPLIER_KNOWLEDGE = `
מבנה חשבונית/אישור הזמנה: שם פריט (תיאור בלבד), מק"ט (קוד נפרד), כמות שהתקבלה (qty), יחידה, מחיר ליחידה, הנחה, סה"כ. חלץ מחיר נטו ליחידה (אחרי הנחה) וכמות (qty) — הכמות מעדכנת מלאי.
סדר עמודות נפוץ בחשבוניות ישראליות: פריט | כמות | ברקוד | מחירון | הנחה% | נטו | סה"כ לשורה.
qty = עמודת "כמות" — המספר שמופיע ליד שם הפריט. אם כמות=1 — החזר qty:1. אל תחזיר qty:0 אלא אם כמות חסרה לגמרי.
אישור הזמנה = כמו חשבונית — חלץ אותו המבנה (פריטים, מחירים, מק"ט, כמות).
מחירים: זהה ₪ ש״ח שקלים NIS — המר למספר. דלג: מע"מ, סיכומים, פקדונות, הובלה, מחיר=0. אם יש עמודת הנחה — המחיר ליחידה הוא המחיר הסופי אחרי הנחה.
יחידות נפוצות: קג/ק"ג (משקל), גרם (משקל קטן), ליטר/מ"ל (נוזלים), יחידה (פריט בודד), חבילה, קרטון, קופסה, שקית, בקבוק. נרמל: קג→קג, ג→גרם, ליטר→ליטר.
רכיבים נפוצים: בשר (חזה עוף, שוק, אונטריב, אנטרקוט, כבש), ירקות (עגבניות, מלפפון, חסה, בצל, גזר, פלפל, חציל, ברוקולי), קמחים (קמח חיטה, קמח מלא, סולת), מוצרי חלב (גבינה, שמנת, יוגורט, חלב), דגים (סלמון, דניס, מוסר, טונה), תבלינים (מלח, פלפל, פפריקה, כורכום), שמנים (שמן קנולה, שמן זית), גרגרים (אורז, גרגרי חומוס, עדשים), מוצרים יבשים (פסטה, אטריות, קוסקוס).
משקאות: משקאות חריפים (ג'ין, וודקה, ויסקי, בורבון, רום, טקילה, ברנדי), יין, בירה, קולה, מים, מיצים, משקאות קלים. יחידות: בקבוק, ליטר, מ"ל.
קפה: פולי קפה, קפה טחון, קפה מסונן, קפה נמס, וסקובי, פולי קפה וסקובי.
שמות חלופיים: חזה עוף=חזה תרנגולת, אונטריב=בשר טחון שמן, אנטרקוט=צלע, טחינה=טחינה גולמית, גרגרי חומוס=חומוס יבש.
טבלאות: עמודות נפוצות — שורה, מק"ט, תיאור מוצר (=name), כמות (=qty), תאריך אספקה, מחיר ליחידה, הנחה, סה"כ מחיר.
דוגמה: שורה=1, מק"ט=6090, תאור מוצר=בנדקטין, כמות=6 → name:"בנדקטין", sku:"6090", qty:6, price:0, unit:"יחידה"
חשוב: name = תוכן עמודת "תאור מוצר" / "תיאור" / "פריט" — לא המק"ט ולא מספר השורה!
פורמט pipe: עמודות barcode-name-qty-price-discount-netprice. חלץ: price=netprice (מחיר אחרי הנחה), qty=כמות, sku=barcode. דוגמה: |7290005966354|ירדן בלאן|24|54.00|20.0|43.20|... → name:ירדן בלאן, sku:7290005966354, qty:24, price:43.20
`

const SUPPLIER_SYSTEM = `אתה מומחה לניתוח חשבוניות ומחירוני ספקי מזון ומשקאות בישראל.
${SUPPLIER_KNOWLEDGE}
חוקים:
name = תוכן עמודת "תאור מוצר" / "תיאור מוצר" / "שם פריט" / "תיאור" / "פירוט" / "מוצר" — זהו שם המוצר בלבד, לא המק"ט!
sku = תוכן עמודת "מק"ט" / "ברקוד" / "קוד" — קוד מספרי.
price = מחיר נטו ליחידה (אחרי הנחה). מחשב: מחיר ליחידה × (1 - הנחה%/100).
qty = תוכן עמודת "כמות" — מספר היחידות.
unit = יחידת מידה (יח', בקבוק, קג, ליטר...).
שם ספק = שם החברה בראש המסמך (לדוגמה: "הכרם - משקאות חריפים", "היכל היין", "תנובה").
דוגמה: שורה=1, מק"ט=15914000, תאור מוצר=גי"ג ג'י וויסקי..., כמות=12, מחיר=109.50, הנחה=27% → name:"גי"ג ג'י וויסקי לונדון דריי ג'ין 1 ליטר", sku:"15914000", price:109.50, qty:12, unit:"יח'"
תעודת משלוח (ללא מחירים): אם אין עמודת מחיר, החזר no_prices:true ועם name, sku, unit, qty, price:0 לכל פריט.
החזר JSON בלבד: {"supplier_name":"...","invoice_date":"DD/MM/YYYY","no_prices":false,"items":[{"name":"...","sku":"מקט או null","price":0.00,"unit":"יחידה","qty":0}]}`

const MENU_KNOWLEDGE = `
קטגוריות נפוצות בתפריטים ישראליים: ראשונות, סלטים, מרקים, אנטיפסטי, מנות עיקריות, עיקריות, בשרים, דגים, פסטות, פיצות, קינוחים, משקאות, תוספות, מנות ילדים, מנות משפחתיות.
מחירים: זהה ₪ ש״ח שקלים NIS — המר למספר. דלג על "מחיר לפי משקל" או "לפי בקשה".
מבנה: תפריטים לרוב בשתי עמודות — שם מנה | מחיר. כותרות קטגוריה (ראשונות, עיקריות) אינן מנות.
מנות ישראליות טיפוסיות ורכיביהן (כמויות למנה): חומוס→גרגרי חומוס 80ג, טחינה 80ג, לימון 20ג, שמן 15ג; פלאפל→גרגרי חומוס 100ג, פטרוזיליה 15ג, שום 5ג; שווארמה→בשר עוף 150ג, פיתה 80ג, טחינה 80ג; שניצל→חזה עוף 150ג, פירורי לחם 30ג, ביצה 1 יח; קבב→בשר טחון 150ג, בצל 30ג, פטרוזיליה 10ג; סלמון→דג סלמון 180ג, לימון 20ג, שמן 15ג; פסטה→פסטה 120ג, רוטב 80ג, שום 5ג; המבורגר→בשר טחון 200ג, לחמניה 80ג, ירקות 50ג; סלט קיסר→חסה 80ג, פרמזן 20ג, קרוטונים 30ג; פיצה→בצק 200ג, עגבניות 50ג, מוצרלה 80ג; ברוסקטה→לחם 60ג, עגבניות 50ג, שום 5ג; טרטר→בשר נא 120ג, חלמון 1 יח; סטייק→בשר בקר 250ג, תבלינים 5ג; דניס→דג דניס 200ג, לימון 20ג; ריזוטו→אורז 80ג, יין 50מ"ל, פרמזן 30ג; מרק→ירקות 150ג או בשר 10ג, תבלינים; חומוס ביתי→גרגרי חומוס 100ג, טחינה 80ג, לימון 30ג; פלאפל→גרגרי חומוס 90ג, שום 5ג, פטרוזיליה 10ג; סלט ירקות→חסה 50ג, עגבניה 50ג, מלפפון 40ג, בצל 20ג; צ'יפס→תפוחי אדמה 150ג, שמן 15ג; פלאפל בפיתה→חמוצים 30ג, פלאפל 80ג, סלט 40ג; חומוס מלא→חומוס 150ג, ביצה 1 יח, פלאפל 30ג.
`

const DISH_SYSTEM = `אתה מנתח תפריטי מסעדות בישראל. חלץ מנות, מחירים, קטגוריות.
${MENU_KNOWLEDGE}
חשוב: לכל מנה ישייך רכיבים וכמויות לפי הבנתך — השתמש בכמויות הטיפוסיות מהרשימה למעלה. אם אין התאמה — השער כמויות סבירות (מנה עיקרית: 150–250ג בשר/דג, מנה קטנה: 50–100ג).
רכיבים: עד 8 למנה. יחידות: גרם/קג/יחידה/מ"ל.
החזר JSON בלבד: {"items":[{"name":"שם מנה","price":0,"category":"קטגוריה","ingredients":[{"name":"שם רכיב","qty":100,"unit":"גרם"}]}]}`

const SALES_SYSTEM = `אתה מנתח דוחות מכירות. חלץ: name, qty, price.
דלג: כותרות, מע"מ, הנחות. החזר JSON: {"items":[{"name":"...","qty":0,"price":0.00}]}`

/** פורמטים נתמכים — PDF, Excel, CSV, RTF, תמונות */
export const SUPPORTED_EXTENSIONS = ["pdf", "xlsx", "xls", "csv", "rtf", "png", "jpg", "jpeg", "gif", "webp"] as const

export function getFileExtension(file: File): string {
  return (file.name.split(".").pop()?.toLowerCase() ?? "").trim()
}

export function isSupportedFormat(file: File): boolean {
  return SUPPORTED_EXTENSIONS.includes(getFileExtension(file) as (typeof SUPPORTED_EXTENSIONS)[number])
}

async function rtfToPlainText(file: File): Promise<string> {
  const raw = await file.text()
  let out = raw
    .replace(/\\u(\d+)\s?/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\[a-z]+\d*\s?/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return out || raw.slice(0, 5000)
}

export async function detectDocumentType(file: File): Promise<DetectedDocType> {
  const ext = getFileExtension(file)
  const isImage = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)
  const isPdf = ext === "pdf"
  const isSheet = ["xlsx", "xls", "csv"].includes(ext)
  const isRtf = ext === "rtf"

  if (isRtf) {
    const text = await rtfToPlainText(file)
    const preview = text.slice(0, 2000)
    const data = await callClaude({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      system: DETECT_SYSTEM,
      messages: [{ role: "user", content: [{ type: "text", text: `טקסט מהמסמך:\n${preview}\n\nמה סוג המסמך? החזר JSON בלבד.` }] }],
    })
    const out = data.content?.map((b) => b.text ?? "").join("") ?? ""
    const clean = out.replace(/```json|```/g, "").trim()
    try {
      const parsed = JSON.parse(clean) as { type?: string }
      const t = (parsed.type || "unknown").toLowerCase()
      if (t === "menu" || t === "sales" || t === "invoice") return t
    } catch {}
    return "unknown"
  }

  if (isImage || isPdf) {
    const base64 = await fileToBase64(file)
    const mediaType = isPdf ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`
    const mediaBlock =
      isPdf
        ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } }
        : { type: "image" as const, source: { type: "base64" as const, media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: base64 } }
    const data = await callClaude({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      system: DETECT_SYSTEM,
      messages: [{ role: "user", content: [mediaBlock, { type: "text" as const, text: "מה סוג המסמך? החזר JSON בלבד." }] }],
    })
    const text = data.content?.map((b) => b.text ?? "").join("") ?? ""
    const clean = text.replace(/```json|```/g, "").trim()
    try {
      const parsed = JSON.parse(clean) as { type?: string }
      const t = (parsed.type || "unknown").toLowerCase()
      if (t === "menu" || t === "sales" || t === "invoice") return t
    } catch {}
    return "unknown"
  }

  if (isSheet) {
    const rows = await parseSpreadsheet(file, ext)
    const preview = JSON.stringify(rows.slice(0, 15))
    const data = await callClaude({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      system: DETECT_SYSTEM,
      messages: [{ role: "user", content: [{ type: "text", text: `הנתונים:\n${preview}\n\nמה סוג המסמך? החזר JSON בלבד.` }] }],
    })
    const text = data.content?.map((b) => b.text ?? "").join("") ?? ""
    const clean = text.replace(/```json|```/g, "").trim()
    try {
      const parsed = JSON.parse(clean) as { type?: string }
      const t = (parsed.type || "unknown").toLowerCase()
      if (t === "menu" || t === "sales" || t === "invoice") return t
    } catch {}
    return "unknown"
  }

  return "unknown"
}

export async function parseSpreadsheet(file: File, ext: string): Promise<Record<string, unknown>[]> {
  if (ext === "csv") {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (r) => resolve((r.data as Record<string, unknown>[]) || []),
      })
    })
  }
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: "array", cellFormula: false, cellNF: false })
  const ws = wb.Sheets[wb.SheetNames[0]] || {}
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(raw.length, 5); i++) {
    const row = raw[i] || []
    const strCells = row.filter((v) => v !== null && v !== "" && (typeof v !== "number" || isNaN(v)))
    if (strCells.length >= 2) {
      headerRowIdx = i
      break
    }
  }
  const h = ((raw[headerRowIdx] || []) as unknown[]).map((v) => (v != null ? String(v).trim() : ""))
  const rows = raw.slice(headerRowIdx + 1).map((row) => {
    const o: Record<string, unknown> = {}
    ;(row || []).forEach((v, i) => {
      o[h[i] || `col${i}`] = v !== null && v !== undefined ? v : ""
    })
    return o
  })
  return rows.filter((row) => Object.values(row).some((v) => v !== "" && v != null))
}

export async function extractWithAI(
  file: File,
  type: ExtractType,
  supplierName?: string
): Promise<ExtractResult> {
  const ext = getFileExtension(file)
  if (!ext || !SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) {
    throw new Error(
      `פורמט לא נתמך (${ext || "ללא סיומת"}). השתמש ב-PDF, Excel (.xlsx/.xls), CSV, RTF או תמונה (PNG/JPG).`
    )
  }
  const isImage = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)
  const isPdf = ext === "pdf"
  const isSheet = ["xlsx", "xls", "csv"].includes(ext)
  const isRtf = ext === "rtf"

  if (isRtf) {
    const text = await rtfToPlainText(file)
    const system =
      type === "p"
        ? SUPPLIER_SYSTEM + (supplierName ? ` שם הספק: "${supplierName}".` : "")
        : type === "d"
          ? DISH_SYSTEM
          : SALES_SYSTEM
    const userContent =
      type === "p"
        ? "נתח את המסמך (חשבונית/מחירון/תעודת משלוח). אם כותרת 'מחירון' — כל שורה=פריט, qty=1, price=המחיר, sku=קוד. אם חשבונית — price=נטו, qty=כמות. אם ללא מחירים — no_prices:true. name=שם המוצר בלבד. JSON בלבד."
        : type === "d"
          ? "חלץ מנות ומחירים מהתפריט. לכל מנה ישייך רכיבים לפי הבנתך (בשר, ירקות, קמח וכו') — גם אם לא מופיעים בתפריט. JSON בלבד."
          : "חלץ מנות, כמויות ומחירים. JSON בלבד."
    const data = await callClaude({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: [{ type: "text", text: `טקסט מהמסמך:\n\n${text}\n\n${userContent}` }] }],
    })
    const out = data.content?.map((b) => b.text ?? "").join("") ?? ""
    let clean = out.replace(/```json|```/g, "").trim()
    clean = clean.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
    try {
      return JSON.parse(clean) as ExtractResult
    } catch (e) {
      // נסיון שני — חלץ JSON אגרסיבי
      const attempts = [
        clean,
        clean.replace(/[\u2018\u2019\u201C\u201D]/g, '"'),
        (clean.match(/\{[\s\S]*\}/) || [])[0] || '',
      ].filter(Boolean)
      for (const attempt of attempts) {
        try {
          const c2 = attempt.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
          return JSON.parse(c2)
        } catch {}
      }
      if (clean.includes('"no_prices":true') && !clean.includes('"items":[{')) {
        const supMatch = clean.match(/supplier_name[^:]*:[^"]*"([^"]+)"/)
        const dateMatch = clean.match(/invoice_date[^:]*:[^"]*"([^"]+)"/)
        return { supplier_name: supMatch?.[1]?.trim() || '', invoice_date: dateMatch?.[1]?.trim() || null, no_prices: true, items: [] }
      }
      throw new Error(`שגיאה בפענוח תשובת AI — נסה שוב או השתמש בקובץ Excel`)
    }
  }

  if (isImage || isPdf) {
    const base64 = await fileToBase64(file)
    const mediaType = isPdf ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`
    const system =
      type === "p"
        ? SUPPLIER_SYSTEM + (supplierName ? ` שם הספק: "${supplierName}".` : "")
        : type === "d"
          ? DISH_SYSTEM
          : SALES_SYSTEM
    const userContent =
      type === "p"
        ? "נתח את המסמך (חשבונית/מחירון/תעודת משלוח). אם כותרת 'מחירון' — כל שורה=פריט, qty=1, price=המחיר, sku=קוד. אם חשבונית — price=נטו, qty=כמות. אם ללא מחירים — no_prices:true. name=שם המוצר בלבד. JSON בלבד."
        : type === "d"
          ? "חלץ מנות ומחירים מהתפריט. לכל מנה ישייך רכיבים לפי הבנתך (בשר, ירקות, קמח וכו') — גם אם לא מופיעים בתפריט. JSON בלבד."
          : "חלץ מנות, כמויות ומחירים. JSON בלבד."
    const mediaBlock =
      isPdf
        ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } }
        : { type: "image" as const, source: { type: "base64" as const, media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: base64 } }
    const data = await callClaude({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: [mediaBlock, { type: "text" as const, text: userContent }] }],
    })
    const text = data.content?.map((b) => b.text ?? "").join("") ?? ""
    let clean = text.replace(/```json|```/g, "").trim()
    // תיקון: הסר תווים בעייתיים שגורמים לשגיאות JSON
    clean = clean.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
    try {
      const parsed = JSON.parse(clean) as ExtractResult
      return parsed
    } catch (e) {
      // נסיון שני — חלץ JSON אגרסיבי
      const attempts = [
        clean,
        clean.replace(/[\u2018\u2019\u201C\u201D]/g, '"'),
        (clean.match(/\{[\s\S]*\}/) || [])[0] || '',
      ].filter(Boolean)
      for (const attempt of attempts) {
        try {
          const c2 = attempt.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
          return JSON.parse(c2)
        } catch {}
      }
      if (clean.includes('"no_prices":true') && !clean.includes('"items":[{')) {
        const supMatch = clean.match(/supplier_name[^:]*:[^"]*"([^"]+)"/)
        const dateMatch = clean.match(/invoice_date[^:]*:[^"]*"([^"]+)"/)
        return { supplier_name: supMatch?.[1]?.trim() || '', invoice_date: dateMatch?.[1]?.trim() || null, no_prices: true, items: [] }
      }
      throw new Error(`שגיאה בפענוח תשובת AI — נסה שוב או השתמש בקובץ Excel`)
    }
  }

  if (isSheet) {
    const rows = await parseSpreadsheet(file, ext)
    const preview = JSON.stringify(rows.slice(0, 30))
    const system =
      type === "p"
        ? SUPPLIER_SYSTEM
        : type === "d"
          ? DISH_SYSTEM
          : SALES_SYSTEM
    const sheetUserText =
      type === "d"
        ? `הנתונים:\n${preview}\n\nחלץ מנות ומחירים. לכל מנה ישייך רכיבים וכמויות לפי הבנתך. JSON בלבד.`
        : type === "p"
          ? `הנתונים:\n${preview}\n\nחלץ רכיבים (שם), מחיר, יחידה, כמות (qty). JSON בלבד.`
          : `הנתונים:\n${preview}\n\nחלץ ל-JSON.`
    const data = await callClaude({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: [{ type: "text", text: sheetUserText }] }],
    })
    const text = data.content?.map((b) => b.text ?? "").join("") ?? ""
    let clean = text.replace(/```json|```/g, "").trim()
    clean = clean.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/,\s*}/g, "}").replace(/,\s*]/g, "]")
    try {
      return JSON.parse(clean) as ExtractResult
    } catch {
      const jsonMatch = clean.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try { return JSON.parse(jsonMatch[0]) as ExtractResult } catch {}
      }
      throw new Error(`שגיאה בפענוח תשובת AI — נסה שוב או השתמש בקובץ Excel`)
    }
  }

  throw new Error(`פורמט לא נתמך (${ext}). השתמש ב-PDF, Excel, CSV, RTF או תמונה.`)
}

export interface IngredientForSuggestion {
  name: string
  price: number
  unit: string
  supplier?: string
  stock?: number
}

const SUGGEST_DISH_SYSTEM = `אתה שף ומנהל תפריט. בהתבסס על רשימת הרכיבים שיש למסעדה (עם מחירים ויחידות מהספקים), הצע מנה אחת מתאימה.
חוקים:
- השתמש רק ברכיבים מהרשימה — אל תוסיף רכיבים שלא קיימים.
- ציין כמויות מדויקות (גרם, יחידה וכו') לפי היחידות ברשימה.
- הצע מנה פופולרית שמתאימה למסעדה ישראלית (עיקריות, ראשונות, סלטים וכו').
- קבע מחיר מכירה סביר (כולל מע"מ) לפי עלות הרכיבים + רווח סביר (30–40% עלות מזון).
החזר JSON בלבד: {"name":"שם המנה","category":"קטגוריה","sellingPrice":0,"ingredients":[{"name":"שם רכיב","qty":0,"unit":"גרם"}]}`

export async function suggestDishFromIngredients(
  ingredients: IngredientForSuggestion[]
): Promise<ExtractedDishItem | null> {
  if (ingredients.length === 0) return null
  const list = ingredients
    .slice(0, 80)
    .map((i) => `${i.name} — ${i.price} ש"ח/${i.unit}${i.stock != null ? ` (מלאי: ${i.stock})` : ""}`)
    .join("\n")
  const data = await callClaude({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    system: SUGGEST_DISH_SYSTEM,
    messages: [{ role: "user", content: [{ type: "text", text: `רשימת הרכיבים במסעדה:\n${list}\n\nהצע מנה אחת עם מתכון מלא. JSON בלבד.` }] }],
  })
  const out = data.content?.map((b) => b.text ?? "").join("") ?? ""
  const clean = out.replace(/```json|```/g, "").trim()
  try {
    const parsed = JSON.parse(clean) as { name?: string; category?: string; sellingPrice?: number; ingredients?: Array<{ name: string; qty: number; unit: string }> }
    if (!parsed?.name || !Array.isArray(parsed.ingredients)) return null
    return {
      name: parsed.name,
      price: typeof parsed.sellingPrice === "number" ? parsed.sellingPrice : 0,
      category: parsed.category || "עיקריות",
      ingredients: parsed.ingredients.filter((ing) => ingredients.some((i) => i.name === ing.name)),
    }
  } catch {
    return null
  }
}

/** מחיר מהאינטרנט — AI מחזיר מחיר טיפוסי וחנות בישראל */
export interface WebPriceResult {
  price: number
  store: string
  unit: string
}

const WEB_PRICE_SYSTEM = `אתה מומחה למחירי מוצרי מזון בישראל. לפי שם הרכיב, החזר:
- מחיר בשקלים (מספר) — מחיר טיפוסי בסופרמרקטים
- חנות/רשת (רמי לוי, שופרסל, ויקטורי, יוחננוף, מגה בעיר וכו') — איפה בדרך כלל הכי זול
- יחידה (קג, גרם, ליטר, יחידה)

החזר JSON בלבד: {"price":0,"store":"שם חנות","unit":"יחידה"}`

export async function fetchWebPriceForIngredient(ingredientName: string): Promise<WebPriceResult | null> {
  const data = await callClaude({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: WEB_PRICE_SYSTEM,
    messages: [{ role: "user", content: [{ type: "text", text: `מה המחיר הטיפוסי ל-${ingredientName} בסופרמרקטים בישראל? איפה הכי זול? החזר JSON בלבד: {"price":0,"store":"שם","unit":"יחידה"}` }] }],
  })
  const out = data.content?.map((b) => b.text ?? "").join("") ?? ""
  const clean = out.replace(/```json|```/g, "").trim()
  try {
    const parsed = JSON.parse(clean) as { price?: number; store?: string; unit?: string }
    if (typeof parsed?.price !== "number" || parsed.price <= 0) return null
    return {
      price: parsed.price,
      store: (parsed.store as string) || "לא צוין",
      unit: (parsed.unit as string) || "קג",
    }
  } catch {
    return null
  }
}
