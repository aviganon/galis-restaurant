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
- invoice: חשבונית ספק (פריטים, מחירי רכיבים, מק"ט)

החזר JSON בלבד: {"type":"menu"} או {"type":"sales"} או {"type":"invoice"} או {"type":"unknown"}`

export interface ExtractedSupplierItem {
  name: string
  price: number
  unit: string
  sku?: string
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

const SUPPLIER_SYSTEM = `אתה מומחה לניתוח חשבוניות ומחירוני ספקי מזון ומשקאות בישראל.
חוקים: שם פריט=תיאור בלבד. מק"ט=קוד נפרד. מחיר נטו (לא סה"כ). יחידה: קג/יחידה/ליטר.
דלג: מע"מ, סיכומים, פקדונות, מחיר=0.
החזר JSON בלבד: {"supplier_name":"...","invoice_date":"DD/MM/YYYY","items":[{"name":"...","sku":"מקט או null","price":0.00,"unit":"יחידה"}]}`

const DISH_SYSTEM = `אתה מנתח תפריטי מסעדות בישראל. חלץ מנות, מחירים, קטגוריות.
רכיבים: עד 6 למנה. יחידות: גרם/קג/יחידה/מ"ל.
החזר JSON בלבד: {"items":[{"name":"שם מנה","price":0,"category":"קטגוריה","ingredients":[{"name":"שם רכיב","qty":100,"unit":"גרם"}]}]}`

const SALES_SYSTEM = `אתה מנתח דוחות מכירות. חלץ: name, qty, price.
דלג: כותרות, מע"מ, הנחות. החזר JSON: {"items":[{"name":"...","qty":0,"price":0.00}]}`

export async function detectDocumentType(file: File): Promise<DetectedDocType> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  const isImage = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)
  const isPdf = ext === "pdf"
  const isSheet = ["xlsx", "xls", "csv"].includes(ext)

  if (isImage || isPdf) {
    const base64 = await fileToBase64(file)
    const mediaType = isPdf ? "application/pdf" : `image/${ext}`
    const mediaBlock =
      isPdf
        ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } }
        : { type: "image" as const, source: { type: "base64" as const, media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: base64 } }
    const data = await callClaude({
      model: "claude-sonnet-4-20250514",
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
      model: "claude-sonnet-4-20250514",
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
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  const isImage = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)
  const isPdf = ext === "pdf"
  const isSheet = ["xlsx", "xls", "csv"].includes(ext)

  if (isImage || isPdf) {
    const base64 = await fileToBase64(file)
    const mediaType = isPdf ? "application/pdf" : `image/${ext}`
    const system =
      type === "p"
        ? SUPPLIER_SYSTEM + (supplierName ? ` שם הספק: "${supplierName}".` : "")
        : type === "d"
          ? DISH_SYSTEM
          : SALES_SYSTEM
    const userContent =
      type === "p"
        ? "נתח את המסמך וחלץ פריטים ומחירים. JSON בלבד."
        : type === "d"
          ? "חלץ מנות ומחירים מהתפריט. JSON בלבד."
          : "חלץ מנות, כמויות ומחירים. JSON בלבד."
    const mediaBlock =
      isPdf
        ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } }
        : { type: "image" as const, source: { type: "base64" as const, media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: base64 } }
    const data = await callClaude({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: [mediaBlock, { type: "text" as const, text: userContent }] }],
    })
    const text = data.content?.map((b) => b.text ?? "").join("") ?? ""
    const clean = text.replace(/```json|```/g, "").trim()
    const parsed = JSON.parse(clean) as ExtractResult
    return parsed
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
    const data = await callClaude({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: [{ type: "text", text: `הנתונים:\n${preview}\n\nחלץ ל-JSON.` }] }],
    })
    const text = data.content?.map((b) => b.text ?? "").join("") ?? ""
    const clean = text.replace(/```json|```/g, "").trim()
    const parsed = JSON.parse(clean) as ExtractResult
    return parsed
  }

  return { items: [] }
}
