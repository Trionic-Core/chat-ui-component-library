/* ------------------------------------------------------------------
 * Box-plot geometry — pure functions, no React and no DOM.
 *
 * The renderer draws raw SVG (recharts has no box plot), so every number it
 * paints is produced here instead: parsing, validation, scales, ticks and
 * layout. Keeping them pure means the geometry is unit-testable without a
 * browser, and a drawing bug shows up as a failing number rather than as a
 * misleading picture.
 * ----------------------------------------------------------------*/

import type { ChartFieldRef, DataRow } from '../aui-types'
import { CHAR_PX, MIN_LABEL_WIDTH } from './label-fit'

/**
 * The five statistics a box plot needs, ordered low to high.
 *
 * These are read from `series` BY KEY NAME, never by array position. The wire
 * contract fixes the names but not their order, so positional reading would let
 * a reordered `series` array draw a box from the wrong numbers — a plausible,
 * silent, wrong picture, which is worse than refusing to draw.
 */
export const BOX_PLOT_KEYS = ['q_min', 'q1', 'median', 'q3', 'q_max'] as const

export type BoxPlotKey = (typeof BOX_PLOT_KEYS)[number]

/** One validated category: its label plus the five monotonic statistics. */
export interface BoxStat {
  category: string
  q_min: number
  q1: number
  median: number
  q3: number
  q_max: number
}

/** Machine-readable reason a box plot drew nothing, surfaced in the DOM. */
export type BoxPlotRejection =
  | 'missing_quartile_series'
  | 'no_rows'
  | 'non_numeric_quartiles'
  | 'non_monotonic_quartiles'

export interface BoxPlotSeriesResolution {
  /** Present when every required key was found. */
  fields: Record<BoxPlotKey, ChartFieldRef> | null
  /** Required keys absent from `series`, for the error message. */
  missing: BoxPlotKey[]
}

export interface BoxPlotParse {
  boxes: BoxStat[]
  /** Rows dropped because their five numbers were unusable. */
  omitted: number
  /** Why nothing (or not everything) was drawn; null when every row was valid. */
  rejection: BoxPlotRejection | null
}

/** Match `series` to the five required keys by name, in any array order. */
export function resolveBoxPlotSeries(series: ChartFieldRef[]): BoxPlotSeriesResolution {
  const byKey = new Map(series.map((field) => [field.key, field]))
  const missing = BOX_PLOT_KEYS.filter((key) => !byKey.has(key))
  if (missing.length > 0) return { fields: null, missing }

  const fields = Object.fromEntries(
    BOX_PLOT_KEYS.map((key) => [key, byKey.get(key)!]),
  ) as Record<BoxPlotKey, ChartFieldRef>
  return { fields, missing: [] }
}

/** Finite number, or null — numeric strings are accepted, everything else is not. */
function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * Read `data` into drawable boxes, dropping every row that cannot produce an
 * honest one.
 *
 * A row is dropped when any of the five values is missing or non-numeric, or
 * when they are not ordered `q_min <= q1 <= median <= q3 <= q_max`. Drawing a
 * box from inconsistent numbers would invert the whiskers or put the median
 * outside the box — it still *looks* like a distribution, so a reader has no
 * way to tell it is wrong.
 */
export function parseBoxPlotRows(data: DataRow[], categoryKey: string): BoxPlotParse {
  if (data.length === 0) return { boxes: [], omitted: 0, rejection: 'no_rows' }

  const boxes: BoxStat[] = []
  let nonNumeric = 0
  let nonMonotonic = 0

  for (const row of data) {
    const values = BOX_PLOT_KEYS.map((key) => toFiniteNumber(row[key]))
    if (values.some((value) => value === null)) {
      nonNumeric++
      continue
    }

    const [qMin, q1, median, q3, qMax] = values as number[]
    if (!(qMin <= q1 && q1 <= median && median <= q3 && q3 <= qMax)) {
      nonMonotonic++
      continue
    }

    boxes.push({
      category: String(row[categoryKey] ?? ''),
      q_min: qMin,
      q1,
      median,
      q3,
      q_max: qMax,
    })
  }

  const omitted = nonNumeric + nonMonotonic
  // When some boxes survived, the rejection is a footnote; when none did it is
  // the empty state's reason, so report whichever fault dropped the most rows.
  const rejection =
    omitted === 0 ? null : nonMonotonic >= nonNumeric ? 'non_monotonic_quartiles' : 'non_numeric_quartiles'

  return { boxes, omitted, rejection }
}

/* ----------------------------- Value scale ----------------------------- */

/**
 * Value range covered by the boxes, padded so the extreme whiskers do not sit
 * on the frame.
 *
 * A box plot compares shape, not magnitude, so the range is NOT forced to zero
 * the way a bar chart's is — zero-anchoring a distribution of, say, delivery
 * times or temperatures would flatten every box into the same sliver.
 */
export function boxPlotDomain(boxes: BoxStat[]): [number, number] {
  if (boxes.length === 0) return [0, 1]

  let min = Infinity
  let max = -Infinity
  for (const box of boxes) {
    if (box.q_min < min) min = box.q_min
    if (box.q_max > max) max = box.q_max
  }

  if (min === max) {
    // A single distinct value across every category: open a symmetric window so
    // the flat boxes land mid-plot instead of on the axis.
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1
    return [min - pad, max + pad]
  }

  const pad = (max - min) * 0.08
  return [min - pad, max + pad]
}

/** Round `range / count` up to the next 1, 2, 5 or 10 x 10^n. */
function niceStep(range: number, count: number): number {
  const rough = range / Math.max(1, count)
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalized = rough / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

/** Evenly spaced, human-readable tick values covering `[min, max]`. */
export function valueAxisTicks([min, max]: [number, number], count = 4): number[] {
  if (!(max > min)) return [min]

  const step = niceStep(max - min, count)
  const ticks: number[] = []
  // Guard the loop independently of the float accumulation below: a pathological
  // domain must not spin forever inside a render.
  const limit = count * 4
  for (let tick = Math.ceil(min / step) * step; tick <= max && ticks.length < limit; tick += step) {
    // Re-round each step: repeated addition drifts (0.1 + 0.2 ...) and would
    // print a tick label like "2.9999999999999996".
    ticks.push(Number((Math.round(tick / step) * step).toPrecision(12)))
  }
  return ticks
}

/** Map a value onto a y pixel (SVG y grows downward, so the domain inverts). */
export function makeValueScale(
  [min, max]: [number, number],
  plotTop: number,
  plotHeight: number,
): (value: number) => number {
  const span = max - min
  if (span <= 0) return () => plotTop + plotHeight / 2
  return (value) => plotTop + plotHeight - ((value - min) / span) * plotHeight
}

/* -------------------------------- Layout ------------------------------- */

const AXIS_LABEL_GAP = 8
const CATEGORY_AXIS_HEIGHT = 22
const PLOT_PADDING_TOP = 10
const PLOT_PADDING_RIGHT = 8
/** Never draw a box thinner than this — below it the median line is unreadable. */
export const MIN_BOX_WIDTH = 6
/** Nor wider than this: two categories should not become two panels. */
export const MAX_BOX_WIDTH = 44
/** Share of a category band the box occupies, leaving a gutter between boxes. */
const BOX_WIDTH_RATIO = 0.62

export interface BoxPlotLayout {
  /** Left edge of the plot area; also the value-axis column width. */
  plotLeft: number
  plotTop: number
  plotWidth: number
  plotHeight: number
  /** Horizontal slice of the plot belonging to one category. */
  bandWidth: number
  boxWidth: number
  /** Draw a category label every `labelStride` bands (1 = every band). */
  labelStride: number
  /** Character budget for a printed category label. */
  labelMaxChars: number
}

/**
 * Place the plot inside `width` x `height` for `categoryCount` categories.
 *
 * `axisTickLabels` sizes the value-axis column from the text that will actually
 * be printed — a fixed column would clip "1.2M" or waste a third of a
 * 360px-wide chat column on "12". `charPx` is the width measured on the host in
 * the host's own font; the Latin estimate stands in when there is none.
 */
export function computeBoxPlotLayout(
  width: number,
  height: number,
  categoryCount: number,
  axisTickLabels: string[],
  charPx: number = CHAR_PX,
): BoxPlotLayout {
  const widestTick = axisTickLabels.reduce((longest, label) => Math.max(longest, label.length), 0)
  const plotLeft = Math.min(width * 0.4, widestTick * charPx + AXIS_LABEL_GAP)
  const plotWidth = Math.max(0, width - plotLeft - PLOT_PADDING_RIGHT)
  const plotHeight = Math.max(0, height - PLOT_PADDING_TOP - CATEGORY_AXIS_HEIGHT)

  const bands = Math.max(1, categoryCount)
  const bandWidth = plotWidth / bands
  const boxWidth = Math.min(MAX_BOX_WIDTH, Math.max(MIN_BOX_WIDTH, bandWidth * BOX_WIDTH_RATIO))

  // Once a band is narrower than a readable label, print every Nth label rather
  // than overlapping them into a smear.
  //
  // TODO: unify with verticalCategoryTicks() in chart-layout.ts. This stride
  // comes from a fixed 44px floor; the cartesian axes now derive theirs from
  // what the longest label actually needs, which is what stopped "2025-01" and
  // "2026-01" printing identically. The box plot draws its own SVG and reads
  // the stride differently, so the merge is a separate change.
  const labelStride = Math.max(1, Math.ceil(MIN_LABEL_WIDTH / Math.max(1, bandWidth)))
  const labelMaxChars = Math.max(1, Math.floor((bandWidth * labelStride - 4) / charPx))

  return {
    plotLeft,
    plotTop: PLOT_PADDING_TOP,
    plotWidth,
    plotHeight,
    bandWidth,
    boxWidth,
    labelStride,
    labelMaxChars,
  }
}

/** Centre x of the category at `index`. */
export function bandCenter(layout: BoxPlotLayout, index: number): number {
  return layout.plotLeft + layout.bandWidth * (index + 0.5)
}
