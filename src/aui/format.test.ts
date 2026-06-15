import { describe, expect, it } from 'vitest'
import { formatValue, formatWithUnit, isNumeric } from './format'

/* ------------------------------------------------------------------
 * Value-formatting regression guard.
 *
 * The headline contract: 'currency' bakes in NO locale symbol/code —
 * CypherX is multi-tenant across currencies (₹/$/AED) and the symbol
 * comes from the `unit`, applied by formatWithUnit. A regression that
 * reintroduced '$'/USD here would be wrong for every non-US install.
 * ----------------------------------------------------------------*/

describe('formatValue', () => {
  it('formats currency as a grouped decimal with NO $ or USD', () => {
    const out = formatValue(1234567.5, 'currency')
    expect(out).toBe('1,234,567.5')
    expect(out).not.toContain('$')
    expect(out).not.toContain('USD')
  })

  it('formats number with grouping', () => {
    expect(formatValue(1234567.5, 'number')).toBe('1,234,567.5')
  })

  it('formats percent with a trailing %', () => {
    expect(formatValue(42.5, 'percent')).toBe('42.5%')
  })

  it('formats compact notation', () => {
    expect(formatValue(1500000, 'compact')).toBe('1.5M')
  })

  it("passes a 'raw' format through as its string form", () => {
    expect(formatValue(1234.5, 'raw')).toBe('1234.5')
  })

  it('coerces a numeric string before formatting', () => {
    expect(formatValue('1000', 'number')).toBe('1,000')
  })

  it('falls back to the string form for non-numeric values under a numeric format', () => {
    expect(formatValue('N/A', 'number')).toBe('N/A')
  })

  it('renders null/undefined as the -- placeholder', () => {
    expect(formatValue(null, 'number')).toBe('--')
    expect(formatValue(undefined, 'currency')).toBe('--')
  })
})

describe('formatWithUnit', () => {
  it('appends the client currency symbol as a space-separated suffix', () => {
    expect(formatWithUnit(1234567.5, 'currency', '₹')).toBe('1,234,567.5 ₹')
    expect(formatWithUnit(1000, 'currency', '$')).toBe('1,000 $')
    expect(formatWithUnit(1000, 'currency', 'AED')).toBe('1,000 AED')
  })

  it('omits the unit when there is none', () => {
    expect(formatWithUnit(1000, 'number')).toBe('1,000')
  })

  it('does not attach a unit to the -- placeholder', () => {
    expect(formatWithUnit(null, 'currency', '$')).toBe('--')
  })
})

describe('isNumeric', () => {
  it('is true for finite numbers and numeric strings', () => {
    expect(isNumeric(42)).toBe(true)
    expect(isNumeric('42.5')).toBe(true)
  })

  it('is false for non-finite numbers, non-numeric strings, blanks, and null', () => {
    expect(isNumeric(Number.NaN)).toBe(false)
    expect(isNumeric(Number.POSITIVE_INFINITY)).toBe(false)
    expect(isNumeric('abc')).toBe(false)
    expect(isNumeric('   ')).toBe(false)
    expect(isNumeric(null)).toBe(false)
    expect(isNumeric(undefined)).toBe(false)
  })
})
