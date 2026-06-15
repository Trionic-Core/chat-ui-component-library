import { describe, expect, it } from 'vitest'
import { escapeCell, rowsToCsv } from './csv'

/* ------------------------------------------------------------------
 * CSV-injection + RFC-4180 regression guard for exported chart/table data.
 *
 * Client data is untrusted: a cell whose value starts with a formula
 * trigger must be defused with a leading single quote, and quoting must
 * still follow RFC-4180 so the file round-trips.
 * ----------------------------------------------------------------*/

describe('escapeCell — CSV-injection neutralization', () => {
  it("prefixes a single quote to every formula-trigger leading character", () => {
    // '-' and '@' need no further quoting; TAB/CR force RFC-4180 quoting too.
    expect(escapeCell('=1+1')).toBe("'=1+1")
    expect(escapeCell('+1')).toBe("'+1")
    expect(escapeCell('-1')).toBe("'-1")
    expect(escapeCell('@SUM(A1)')).toBe("'@SUM(A1)")
    // A leading TAB triggers both the quote-prefix AND RFC-4180 quoting (it
    // matches the \r|\n|,|" quoting test via \r? No — TAB is not in that set,
    // so it stays unquoted but prefixed).
    expect(escapeCell('\tcmd')).toBe("'\tcmd")
    // A leading CR triggers the prefix AND RFC-4180 quoting (\r is in the set).
    expect(escapeCell('\rcmd')).toBe('"\'\rcmd"')
  })

  it('does not touch a benign value', () => {
    expect(escapeCell('normal')).toBe('normal')
  })

  it('RFC-4180 quotes values containing a comma', () => {
    expect(escapeCell('a,b')).toBe('"a,b"')
  })

  it('RFC-4180 doubles embedded quotes', () => {
    expect(escapeCell('qu"ote')).toBe('"qu""ote"')
  })

  it('quotes values containing a newline', () => {
    expect(escapeCell('line1\nline2')).toBe('"line1\nline2"')
  })

  it('renders null/undefined as an empty cell', () => {
    expect(escapeCell(null)).toBe('')
    expect(escapeCell(undefined as unknown as null)).toBe('')
  })

  it('stringifies numbers without quoting', () => {
    expect(escapeCell(42)).toBe('42')
  })
})

describe('rowsToCsv — full round-trip', () => {
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'amount', label: 'Amount' },
  ]

  it('builds a header + body and escapes cells per column', () => {
    const rows = [
      { name: 'Acme, Inc', amount: 1000 },
      { name: '=cmd', amount: 2000 },
    ]
    const csv = rowsToCsv(columns, rows)
    expect(csv).toBe('Name,Amount\n"Acme, Inc",1000\n\'=cmd,2000')
  })

  it('renders missing keys as empty cells to keep rows aligned', () => {
    const csv = rowsToCsv(columns, [{ name: 'OnlyName' } as never])
    expect(csv).toBe('Name,Amount\nOnlyName,')
  })

  it('returns just the header when there are no rows', () => {
    expect(rowsToCsv(columns, [])).toBe('Name,Amount')
  })
})
