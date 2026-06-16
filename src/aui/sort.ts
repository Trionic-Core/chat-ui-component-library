/* ------------------------------------------------------------------
 * Table sort — pure comparator extracted from table-block.tsx so the
 * column-sort semantics are independently unit-testable.
 *
 * Semantics (locked by sort.test.ts; do not change without updating it):
 *  - No sort state → the original array is returned as-is (same reference).
 *  - A sort produces a NEW array (the input is not mutated).
 *  - null/undefined cells always sort to the END, regardless of direction
 *    (an absent `a` ranks after `b`; an absent `b` ranks after `a`).
 *  - When BOTH cells read as numeric, compare numerically; otherwise compare
 *    as strings via localeCompare.
 *  - Direction flips the sign for present-vs-present pairs only.
 * ----------------------------------------------------------------*/

import type { DataRow } from './aui-types'
import { isNumeric } from './format'

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  key: string
  direction: SortDirection
}

/** Stable sort by a column; numeric when both cells parse as numbers, else string. */
export function sortRows(rows: DataRow[], sort: SortState | null): DataRow[] {
  if (!sort) return rows
  const dir = sort.direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = a[sort.key]
    const bv = b[sort.key]
    if (av === null || av === undefined) return 1
    if (bv === null || bv === undefined) return -1
    if (isNumeric(av) && isNumeric(bv)) return (Number(av) - Number(bv)) * dir
    return String(av).localeCompare(String(bv)) * dir
  })
}
