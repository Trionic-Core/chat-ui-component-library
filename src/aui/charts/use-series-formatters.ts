import { useMemo } from 'react'
import type { ChartFieldRef } from '../aui-types'
import {
  makeAxisTickFormatter,
  makeTooltipValueFormatter,
  makeValueFormatter,
} from './chart-helpers'

/* ------------------------------------------------------------------
 * The value formatters every chart with a series set needs.
 *
 * Both are FACTORIES — the tooltip one builds a key→series Map — so calling
 * them inline in JSX allocates on every render and hands recharts a new
 * function identity each time. Three charts did that and three memoized it;
 * one hook is how the two halves stop drifting apart.
 * ----------------------------------------------------------------*/

export interface SeriesFormatters {
  /** Value-axis tick: compact, plus the unit every series agrees on. */
  tick: ReturnType<typeof makeAxisTickFormatter>
  /** Tooltip value: full precision, in the entry's own series' terms. */
  tooltip: ReturnType<typeof makeTooltipValueFormatter>
  /**
   * Full precision in the SHARED field's terms, for a readout with no per-entry
   * series to resolve — the box plot's five numbers of one measure.
   */
  value: ReturnType<typeof makeValueFormatter>
}

export function useSeriesFormatters(series: ChartFieldRef[]): SeriesFormatters {
  return useMemo(
    () => ({
      tick: makeAxisTickFormatter(series),
      tooltip: makeTooltipValueFormatter(series),
      value: makeValueFormatter(series),
    }),
    [series],
  )
}
