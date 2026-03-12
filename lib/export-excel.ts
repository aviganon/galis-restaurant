import * as XLSX from "xlsx"

export function downloadExcel(
  data: Record<string, unknown>[],
  filename: string,
  sheetName = "נתונים"
) {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

export function downloadExcelFromArrays(
  rows: (string | number)[][],
  filename: string,
  sheetName = "נתונים"
) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}
