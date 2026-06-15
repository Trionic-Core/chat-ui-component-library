/* ------------------------------------------------------------------
 * CSV export shared by the chart and table blocks.
 * ----------------------------------------------------------------*/

import type { CellValue, DataRow } from './aui-types'

// Characters that make a spreadsheet treat a cell as a formula. A cell whose
// stringified value begins with one is prefixed with a single quote so Excel/
// Sheets render it as literal text rather than executing it (CSV injection /
// DDE attack — OWASP). Client data is untrusted, so this runs on every export.
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r']

/**
 * RFC-4180 cell escaping with CSV-injection neutralization.
 *
 * First defuse a formula-triggering leading character (prefix a single quote),
 * then quote per RFC-4180 when the result contains a comma, quote, or newline.
 */
export function escapeCell(value: CellValue): string {
  if (value === null || value === undefined) return ''
  let str = String(value)
  if (FORMULA_TRIGGERS.includes(str.charAt(0))) {
    str = `'${str}`
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Build a CSV string from explicit columns (key + header label) over rows.
 * Missing keys render as empty cells so heterogeneous rows stay aligned.
 */
export function rowsToCsv(
  columns: { key: string; label: string }[],
  rows: DataRow[],
): string {
  const header = columns.map((c) => escapeCell(c.label)).join(',')
  const body = rows
    .map((row) => columns.map((c) => escapeCell(row[c.key] ?? null)).join(','))
    .join('\n')
  return body ? `${header}\n${body}` : header
}

/** Trigger a browser download of `content` as a UTF-8 .csv file. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
