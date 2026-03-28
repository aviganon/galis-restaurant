import writeXlsxFile from "write-excel-file/universal"
import type { SheetData } from "write-excel-file/universal"

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function downloadExcel(
  data: Record<string, unknown>[],
  filename: string,
  sheetName = "נתונים"
) {
  if (data.length === 0) return
  const sheet = recordsToSheetData(data)
  const blob = await writeXlsxFile(sheet, { sheet: sheetName, rightToLeft: true })
  triggerBlobDownload(blob, `${filename}.xlsx`)
}

export async function downloadExcelFromArrays(
  rows: (string | number)[][],
  filename: string,
  sheetName = "נתונים"
) {
  const sheet = rows as SheetData
  const blob = await writeXlsxFile(sheet, { sheet: sheetName, rightToLeft: true })
  triggerBlobDownload(blob, `${filename}.xlsx`)
}

function recordsToSheetData(data: Record<string, unknown>[]): SheetData {
  if (data.length === 0) {
    return [["—"], [""]] as SheetData
  }
  const keys = Object.keys(data[0])
  const header = keys
  const body: (string | number)[][] = data.map((row) =>
    keys.map((k) => {
      const v = row[k]
      if (v === null || v === undefined) return ""
      if (typeof v === "number" || typeof v === "string") return v
      if (typeof v === "boolean") return v ? 1 : 0
      return String(v)
    })
  )
  return [header, ...body] as SheetData
}

/** קובץ Excel עם מספר גיליונות (שם גיליון עד 31 תווים) */
export async function downloadExcelMultiSheet(
  sheets: { name: string; data: Record<string, unknown>[] }[],
  filename: string
) {
  if (sheets.length === 0) return
  const built = sheets.map((s) => recordsToSheetData(s.data))
  const names = sheets.map((s) => s.name.slice(0, 31) || "Sheet")
  const blob = await writeXlsxFile(built, {
    sheets: names,
    rightToLeft: true,
  })
  triggerBlobDownload(blob, `${filename}.xlsx`)
}
