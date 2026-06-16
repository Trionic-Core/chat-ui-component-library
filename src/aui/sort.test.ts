import { describe, expect, it } from 'vitest'
import { sortRows } from './sort'
import type { DataRow } from './aui-types'

/* ------------------------------------------------------------------
 * Characterization tests for the table-block column sort.
 *
 * These LOCK the current behavior (they are not a spec to fix toward):
 *  - no sort → same array reference, unmutated
 *  - numeric-vs-string dispatch (numeric only when BOTH cells read numeric)
 *  - null/undefined cells always sink to the end, both directions
 *  - direction flips present-vs-present pairs only
 *  - equal values preserve input order (stable)
 * ----------------------------------------------------------------*/

const keysOf = (rows: DataRow[], key: string) => rows.map((r) => r[key])

describe('sortRows — no sort state', () => {
  it('returns the same array reference when sort is null (no copy, no mutation)', () => {
    const rows: DataRow[] = [{ a: 3 }, { a: 1 }, { a: 2 }]
    const out = sortRows(rows, null)
    expect(out).toBe(rows)
    expect(keysOf(out, 'a')).toEqual([3, 1, 2])
  })
})

describe('sortRows — numeric columns', () => {
  it('sorts ascending numerically', () => {
    const rows: DataRow[] = [{ a: 10 }, { a: 2 }, { a: 30 }]
    const out = sortRows(rows, { key: 'a', direction: 'asc' })
    expect(keysOf(out, 'a')).toEqual([2, 10, 30])
  })

  it('sorts descending numerically', () => {
    const rows: DataRow[] = [{ a: 10 }, { a: 2 }, { a: 30 }]
    const out = sortRows(rows, { key: 'a', direction: 'desc' })
    expect(keysOf(out, 'a')).toEqual([30, 10, 2])
  })

  it('compares numeric strings numerically (not lexicographically) when both read numeric', () => {
    // Lexicographic would order ['10','2','30'] as ['10','2','30']; numeric is ['2','10','30'].
    const rows: DataRow[] = [{ a: '10' }, { a: '2' }, { a: '30' }]
    const out = sortRows(rows, { key: 'a', direction: 'asc' })
    expect(keysOf(out, 'a')).toEqual(['2', '10', '30'])
  })

  it('does not mutate the input array', () => {
    const rows: DataRow[] = [{ a: 3 }, { a: 1 }, { a: 2 }]
    const snapshot = keysOf(rows, 'a')
    sortRows(rows, { key: 'a', direction: 'asc' })
    expect(keysOf(rows, 'a')).toEqual(snapshot)
  })
})

describe('sortRows — string columns', () => {
  it('sorts ascending with localeCompare', () => {
    const rows: DataRow[] = [{ a: 'banana' }, { a: 'apple' }, { a: 'cherry' }]
    const out = sortRows(rows, { key: 'a', direction: 'asc' })
    expect(keysOf(out, 'a')).toEqual(['apple', 'banana', 'cherry'])
  })

  it('sorts descending with localeCompare', () => {
    const rows: DataRow[] = [{ a: 'banana' }, { a: 'apple' }, { a: 'cherry' }]
    const out = sortRows(rows, { key: 'a', direction: 'desc' })
    expect(keysOf(out, 'a')).toEqual(['cherry', 'banana', 'apple'])
  })
})

describe('sortRows — mixed-type columns', () => {
  it('falls back to string compare when one cell is non-numeric', () => {
    // 2 is numeric but 'apple' is not, so the pair compares as strings:
    // String(2) = '2', and '2' < 'apple' by localeCompare.
    const rows: DataRow[] = [{ a: 'apple' }, { a: 2 }]
    const out = sortRows(rows, { key: 'a', direction: 'asc' })
    expect(keysOf(out, 'a')).toEqual([2, 'apple'])
  })
})

describe('sortRows — null / undefined ordering', () => {
  it('sinks null cells to the end on ascending sort', () => {
    const rows: DataRow[] = [{ a: 2 }, { a: null }, { a: 1 }]
    const out = sortRows(rows, { key: 'a', direction: 'asc' })
    expect(keysOf(out, 'a')).toEqual([1, 2, null])
  })

  it('sinks null cells to the end on descending sort too (null ordering ignores direction)', () => {
    const rows: DataRow[] = [{ a: 2 }, { a: null }, { a: 1 }]
    const out = sortRows(rows, { key: 'a', direction: 'desc' })
    expect(keysOf(out, 'a')).toEqual([2, 1, null])
  })

  it('treats a missing (undefined) cell like null and sinks it to the end', () => {
    const rows: DataRow[] = [{ a: 2 }, {}, { a: 1 }]
    const out = sortRows(rows, { key: 'a', direction: 'asc' })
    expect(keysOf(out, 'a')).toEqual([1, 2, undefined])
  })
})

describe('sortRows — stability', () => {
  it('preserves input order for equal values', () => {
    const rows: DataRow[] = [
      { a: 1, tag: 'first' },
      { a: 1, tag: 'second' },
      { a: 1, tag: 'third' },
    ]
    const out = sortRows(rows, { key: 'a', direction: 'asc' })
    expect(out.map((r) => r.tag)).toEqual(['first', 'second', 'third'])
  })
})
