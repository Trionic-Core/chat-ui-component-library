/* ------------------------------------------------------------------
 * Value formatting shared by metric and table cells.
 *
 * One source of truth for the ValueFormat enum so a metric KPI and a
 * table column render the same number identically.
 * ----------------------------------------------------------------*/

import type { CellValue, ValueFormat } from './aui-types'

const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const PLAIN = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
// Currency is rendered as a grouped decimal number only — no locale currency
// symbol/code is baked in. CypherX is multi-tenant across clients in different
// currencies (₹, $, AED, …); the symbol comes from the metric/column `unit`,
// applied by the caller around this value. Hardcoding USD/$ here would be wrong
// for every non-US install.
const CURRENCY = new Intl.NumberFormat('en-US', {
  style: 'decimal',
  useGrouping: true,
  maximumFractionDigits: 2,
})

/**
 * Format a scalar value for display.
 *
 * Numeric formats only apply to finite numbers (or numeric strings);
 * anything non-numeric falls back to its string form so arbitrary
 * client data never throws or shows `NaN`.
 */
export function formatValue(value: CellValue | undefined, format?: ValueFormat): string {
  if (value === null || value === undefined) return '--'

  if (format && format !== 'raw') {
    const num = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(num)) {
      switch (format) {
        case 'currency':
          return CURRENCY.format(num)
        case 'percent':
          return `${PLAIN.format(num)}%`
        case 'compact':
          return COMPACT.format(num)
        case 'number':
          return PLAIN.format(num)
      }
    }
  }

  return String(value)
}

/**
 * Format a scalar and attach its unit, for cells that render the value as a
 * single string (e.g. table cells). The unit is appended as a space-separated
 * suffix, matching the metric card's value+unit layout — so a currency
 * column shows the same client symbol (₹/$/AED) a KPI card would, since the
 * formatter itself bakes in no locale currency.
 */
export function formatWithUnit(
  value: CellValue | undefined,
  format?: ValueFormat,
  unit?: string,
): string {
  const formatted = formatValue(value, format)
  if (!unit || formatted === '--') return formatted
  return `${formatted} ${unit}`
}

/** Whether a value reads as numeric (drives right-alignment of unspecified columns). */
export function isNumeric(value: CellValue | undefined): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string' && value.trim() !== '') return Number.isFinite(Number(value))
  return false
}
