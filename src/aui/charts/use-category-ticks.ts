import { useMemo } from 'react'
import type { DataRow } from '../aui-types'
import { makeCategoryTick } from './category-tick'
import { verticalCategoryTicks } from './chart-layout'
import { fitCategoryLabels, CHAR_PX } from './label-fit'
import { formatTooltipLabel } from './chart-helpers'

/* ------------------------------------------------------------------
 * The vertical category axis, decided once for every chart that has one.
 *
 * A vertical bar, a line and an area all run their categories along the x axis
 * and all face the same question: which labels can print here, and how wide may
 * each one be? Three copies of that answer is three chances to fix a bug twice
 * and miss the third — this is the one copy.
 * ----------------------------------------------------------------*/

export interface CategoryTicksInput {
  data: DataRow[]
  xKey: string
  /** Plot area width in px — the chart width less the value axis. */
  plotWidth: number
  /** Measured character width; the Latin estimate when there is no DOM. */
  charPx?: number
}

export interface CategoryTicks {
  /**
   * recharts `interval`: a NUMBER, so recharts prints exactly every Nth tick.
   *
   * Not "equidistantPreserveStart": that made recharts pick its own stride by
   * measuring the ALREADY-TRUNCATED text, so the stride it used and the stride
   * the label budget assumed disagreed, and the budget was the wrong one.
   */
  interval: number
  /** The `tick` render function: fitted text, full label in a <title>. */
  tick: ReturnType<typeof makeCategoryTick>
  /** The `tickFormatter`, which is also what recharts measures. */
  tickFormatter: (value: unknown) => string
  /** The `labelFormatter` for the tooltip: always the full category. */
  tooltipLabelFormatter: typeof formatTooltipLabel
}

export function useCategoryTicks({
  data,
  xKey,
  plotWidth,
  charPx = CHAR_PX,
}: CategoryTicksInput): CategoryTicks {
  return useMemo(() => {
    const categories = data.map((row) => String(row[xKey] ?? ''))
    const longestLabelChars = categories.reduce(
      (longest, label) => Math.max(longest, label.length),
      0,
    )
    const { interval, maxChars } = verticalCategoryTicks({
      plotWidth,
      rows: categories.length,
      longestLabelChars,
      charPx,
    })

    // Fit the whole set together, so two categories sharing a prefix cannot
    // collapse to the same printed string.
    const labels = fitCategoryLabels(categories, maxChars)
    const fitted = new Map<string, string>()
    categories.forEach((raw, index) => {
      if (!fitted.has(raw)) fitted.set(raw, labels[index])
    })

    return {
      interval,
      tick: makeCategoryTick({ fitted, maxChars, allowWrap: false }),
      // recharts measures this string to lay the axis out, so it has to be the
      // string that is actually painted — not the raw label.
      tickFormatter: (value: unknown) => {
        const raw = String(value ?? '')
        return fitted.get(raw) ?? raw
      },
      tooltipLabelFormatter: formatTooltipLabel,
    }
  }, [data, xKey, plotWidth, charPx])
}
