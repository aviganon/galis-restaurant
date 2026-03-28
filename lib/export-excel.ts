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
  const sheet: SheetData = [header, ...body] as SheetData
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
