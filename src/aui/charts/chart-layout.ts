/* ------------------------------------------------------------------
 * Chart Legibility Policy — pure layout arithmetic, no React and no DOM.
 *
 * One question runs through this module: can a person READ the chart? A chart
 * with 62 categories in a fixed 256px box draws 3px bands, drops two labels in
 * three and shows a texture instead of an answer. The renderer decides height
 * from the number of categories, prints an honest "Showing 12 of 62", fits the
 * labels to the space it actually has, and puts the number on the bar.
 *
 * Every decision comes from counts, widths and signs. Nothing here reads label
 * text patterns, currencies, table names or a client's schema — the same rules
 * have to hold for every install.
 * ----------------------------------------------------------------*/

import type { ChartFieldRef, ChartType, DataRow } from '../aui-types'
import { CHAR_PX } from './label-fit'

/* ------------------------------ Constants ------------------------------ */

/**
 * Height of one category band in a horizontal bar chart.
 *
 * Vega-Lite's default discrete step is 20px and Observable Plot computes its
 * default height at 20px per band. 28px adds air on both sides of a 12px label
 * and leaves room for an optional second line.
 */
export const BAND_PX = 28
/** Never draw a band below this: the value label stops fitting beside the bar. */
export const MIN_BAND_PX = 22
/** Categories drawn inline before the chart hands the rest to "View all". */
export const INLINE_MAX_CATEGORIES = 12
/** Axis, margins and legend around the plot area (recharts chrome). */
export const CHART_CHROME_PX = 46
/** A chart shorter than this reads as a strip rather than a chart. */
export const INLINE_MIN_HEIGHT_PX = 200
/** Fixed inline height for charts whose density does not grow with rows. */
export const VERTICAL_CHART_HEIGHT_PX = 256
/** Below this chart width a value label beside the bar has nowhere to go. */
export const VALUE_LABEL_MIN_WIDTH_PX = 360
/** Above this row count the entrance animation delays the first readable frame. */
export const ANIMATION_MAX_ROWS = 30
/** Pie/donut slices drawn before the tail collapses into one "Other" slice. */
export const MAX_SLICES = 8
/** A category axis narrower than this cannot print a label worth reading. */
export const AXIS_MIN_WIDTH_PX = 72
/** Nor may it eat more than this share of the chart — the bars need the rest. */
export const AXIS_MAX_WIDTH_RATIO = 0.4
/** Longest label a category axis prints on one line. */
export const LABEL_MAX_CHARS = 28
/** More categories than this and vertical bars stop being readable. */
export const FLIP_MIN_CATEGORIES = 12
/** With long text labels the flip starts here instead. */
export const FLIP_LONG_LABEL_CATEGORIES = 6
/** A label longer than this cannot sit under a vertical bar. */
export const FLIP_LONG_LABEL_CHARS = 12
/** Extra band height per additional grouped series. */
export const GROUPED_BAND_STEP_PX = 8
/** Ceiling for a grouped band: past this the group reads as its own panel. */
export const GROUPED_BAND_MAX_PX = 56

/** Chart width below which every text category axis flips (the 420px widget). */
export const NARROW_CHART_WIDTH_PX = 400
/** Inline chart width in the 720px message column — the measurement fallback. */
export const DEFAULT_CHART_WIDTH_PX = 600
/** Chart width inside the size="lg" expand dialog — the measurement fallback. */
export const EXPANDED_CHART_WIDTH_PX = 984
/** Floor for a vertical chart in the expand dialog, where 60vh can be short. */
export const EXPANDED_VERTICAL_MIN_HEIGHT_PX = 360
/** Below this band height, printing every tick would overlap the labels. */
export const TICK_INTERVAL_MIN_BAND_PX = 16
/** Air between two printed category ticks, and around a printed label. */
export const TICK_GAP_PX = 8
/** A thinned axis still has to name enough places for the reader to orient. */
export const MIN_VISIBLE_TICKS = 4
/** Width recharts' auto value axis takes for a compact tick like "1.2M". */
export const VALUE_AXIS_ESTIMATE_PX = 48
/** Air between the longest label and the plot area on a category axis. */
export const AXIS_LABEL_PADDING_PX = 12
/** Sample size for the ordered-axis test — enough to classify, cheap to run. */
export const ORDERED_SAMPLE_LIMIT = 50
/** Share of sampled x values that must be ordered to lock the axis direction. */
export const ORDERED_RATIO = 0.8

/**
 * Regular thinning for a category axis that cannot print every tick.
 *
 * "equidistantPreserveStart" keeps a constant stride, which reads as a rhythm;
 * recharts' default "preserveEnd" drops colliding ticks wherever they happen to
 * collide, so the surviving labels land at irregular positions and the reader
 * cannot tell which label belongs to which bar.
 */
export const EQUIDISTANT_INTERVAL = 'equidistantPreserveStart' as const

export type ChartRenderMode = 'inline' | 'expanded'
export type CategoryTickInterval = 0 | typeof EQUIDISTANT_INTERVAL

/* -------------------------- Band height and size ------------------------- */

/** Bar-family chart types the orientation policy is allowed to flip. */
const FLIPPABLE_CHART_TYPES: ReadonlySet<ChartType> = new Set<ChartType>([
  'bar',
  'bar_grouped',
  'bar_stacked',
])

/** Every bar-family chart type, flipped or already horizontal. */
export const BAR_CHART_TYPES: ReadonlySet<ChartType> = new Set<ChartType>([
  'bar',
  'bar_horizontal',
  'bar_grouped',
  'bar_stacked',
])

/**
 * Clamp with the ceiling winning a degenerate range.
 *
 * The floor and the ceiling protect different things: the floor keeps a label
 * legible, the ceiling keeps the plot area from disappearing. On a chart too
 * narrow to satisfy both, the plot area wins — an axis with no chart beside it
 * is not a chart.
 */
function clamp(low: number, value: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}

/** Finite number, or null — numeric strings count, everything else does not. */
function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * Band height for one category.
 *
 * Grouped series share a band, so the band grows with the number of bars in it;
 * stacked series share ONE bar, so a stack costs no extra height.
 */
export function bandHeight(seriesCount: number, stacked: boolean): number {
  if (stacked || seriesCount <= 1) return BAND_PX
  return Math.min(GROUPED_BAND_MAX_PX, BAND_PX + GROUPED_BAND_STEP_PX * (seriesCount - 1))
}

/**
 * Tick interval for a category axis of `bandPx` bands.
 *
 * Printing every tick (interval 0) is only safe while the band is tall enough
 * to hold a label. The caller normally guarantees that through categoryLayout;
 * this exists so a future caller with its own band degrades to honest thinning
 * instead of overlapping labels into a smear.
 */
export function axisIntervalFor(bandPx: number): CategoryTickInterval {
  return bandPx >= TICK_INTERVAL_MIN_BAND_PX ? 0 : EQUIDISTANT_INTERVAL
}

export interface CategoryLayoutInput {
  /** Categories carried on the wire. */
  rows: number
  /** Measured chart width in px. */
  width: number
  mode: ChartRenderMode
  seriesCount: number
  stacked: boolean
  /** Longest category label in characters; sizes the axis column. */
  longestLabelChars?: number
  /** Measured character width; the Latin estimate when there is no DOM. */
  charPx?: number
}

export interface CategoryLayout {
  /** Explicit pixel height for the chart host (never a percentage — see below). */
  hostHeight: number
  /** Categories this mode draws; the rest go to "View all". */
  shownRows: number
  bandPx: number
  axisWidth: number
  maxChars: number
  interval: CategoryTickInterval
  showValueLabels: boolean
  animate: boolean
}

/**
 * Size a horizontal-bar chart from its category count.
 *
 * The host gets an explicit PIXEL height. ResponsiveContainer measures its
 * wrapper with a ResizeObserver, and a percentage height inside an auto-height
 * parent measures 0 — the chart would vanish rather than shrink.
 *
 * Inline the height is capped, because a chat message must not become a page:
 * past INLINE_MAX_CATEGORIES the chart shows the first rows in wire order and
 * says so. Expanded there is no cap — the dialog body scrolls, and the whole
 * ranking at a readable band is the reason the reader opened it.
 */
export function categoryLayout({
  rows,
  width,
  mode,
  seriesCount,
  stacked,
  longestLabelChars = 0,
  charPx = CHAR_PX,
}: CategoryLayoutInput): CategoryLayout {
  const bandPx = bandHeight(seriesCount, stacked)
  const totalRows = Math.max(0, rows)
  const shownRows = mode === 'expanded' ? totalRows : Math.min(totalRows, INLINE_MAX_CATEGORIES)

  const contentHeight = shownRows * bandPx + CHART_CHROME_PX
  const hostHeight =
    mode === 'expanded'
      ? contentHeight
      : clamp(INLINE_MIN_HEIGHT_PX, contentHeight, INLINE_MAX_CATEGORIES * bandPx + CHART_CHROME_PX)

  const axisCeiling = AXIS_MAX_WIDTH_RATIO * width
  const axisWidth = Math.round(
    clamp(AXIS_MIN_WIDTH_PX, longestLabelChars * charPx + AXIS_LABEL_PADDING_PX, axisCeiling),
  )
  const maxChars = Math.max(
    1,
    Math.min(LABEL_MAX_CHARS, Math.floor((axisCeiling - AXIS_LABEL_PADDING_PX) / charPx)),
  )

  return {
    hostHeight,
    shownRows,
    bandPx,
    axisWidth,
    maxChars,
    interval: axisIntervalFor(bandPx),
    // Stacked segments share one band and can each be a few pixels wide, so
    // their labels would land on top of one another. Grouped series pay for
    // their labels with a taller band (see bandHeight).
    showValueLabels: !stacked && bandPx >= MIN_BAND_PX && width >= VALUE_LABEL_MIN_WIDTH_PX,
    animate: shownRows <= ANIMATION_MAX_ROWS,
  }
}

export interface VerticalCategoryTicksInput {
  /** Plot area width in px — the chart width less the value axis. */
  plotWidth: number
  rows: number
  /** Longest category label in characters. */
  longestLabelChars: number
  charPx?: number
}

export interface VerticalCategoryTicks {
  /** Print one label every `stride` bands. */
  stride: number
  /** The same thing as recharts states it: skip this many between ticks. */
  interval: number
  /** Character budget for a printed label. */
  maxChars: number
}

/**
 * Which labels a VERTICAL category axis prints, and how wide each may be.
 *
 * The stride comes from what the LONGEST LABEL NEEDS, not from a fixed floor.
 * A fixed floor (44px, about six characters) was the bug: 24 months across
 * 540px produced a six-character budget for a seven-character "2025-01", so
 * every label collided on truncation, the whole set fell back to middle
 * truncation, and its 3-head/2-tail split dropped the year digit — "2025-01"
 * and "2026-01" both printed "202…01". Widening the stride by one band buys
 * the characters instead, and the labels print whole.
 *
 * The stride is capped so a thinned axis still names MIN_VISIBLE_TICKS places;
 * one very long label among short ones therefore truncates rather than emptying
 * the axis. Below MIN_VISIBLE_TICKS rows nothing is thinned at all — printing
 * one of three categories is worse than printing three short ones.
 */
export function verticalCategoryTicks({
  plotWidth,
  rows,
  longestLabelChars,
  charPx = CHAR_PX,
}: VerticalCategoryTicksInput): VerticalCategoryTicks {
  const bandPx = Math.max(1, plotWidth / Math.max(1, rows))
  const needed = Math.max(1, Math.ceil((longestLabelChars * charPx + TICK_GAP_PX) / bandPx))
  const stride =
    rows < MIN_VISIBLE_TICKS
      ? 1
      : Math.min(needed, Math.max(1, Math.floor(rows / MIN_VISIBLE_TICKS)))

  return {
    stride,
    // recharts counts the ticks it SKIPS between two printed ones.
    interval: stride - 1,
    maxChars: Math.max(
      1,
      Math.min(LABEL_MAX_CHARS, Math.floor((bandPx * stride - TICK_GAP_PX) / charPx)),
    ),
  }
}

/**
 * Ratio of the value-label font to the axis font (11px against 12px).
 *
 * The label sits inside the plot next to the mark it describes, so it is one
 * step down from the axis — see CHART_VALUE_LABEL_STYLE.
 */
export const VALUE_LABEL_FONT_RATIO = 11 / 12

/**
 * Whether a value label fits inside a VERTICAL bar's band.
 *
 * categoryLayout's rule is about band HEIGHT, which is what a horizontal bar
 * has to spare. A vertical bar has the opposite constraint: 24 months across
 * 552px is a 23px band, and "750.6K" is 38px wide, so the labels print over
 * one another (browser-verified, 2026-08-29). `marks` counts every bar in the
 * plot — a grouped chart divides one band between its series.
 */
export function verticalValueLabelsFit(
  plotWidth: number,
  marks: number,
  longestValueChars: number,
  charPx: number = CHAR_PX,
): boolean {
  if (longestValueChars <= 0 || marks <= 0) return false
  const bandWidth = plotWidth / marks
  return bandWidth >= longestValueChars * charPx * VALUE_LABEL_FONT_RATIO
}

/** Air between the end of a bar and its value label. */
export const VALUE_LABEL_GAP_PX = 6
/** Height of one value-label line, for the margin above a vertical bar. */
export const VALUE_LABEL_LINE_PX = 14

/**
 * Pixels a value label needs OUTSIDE the plot area.
 *
 * The label hangs off the end of the bar, and the longest bar ends at the edge
 * of the plot — so without a reserved margin the biggest number in the chart is
 * the one that gets clipped (browser-verified, 2026-08-29). Sized from the text
 * that will actually print, not from an assumed maximum.
 */
export function valueLabelReservePx(longestValueChars: number, charPx: number = CHAR_PX): number {
  if (longestValueChars <= 0) return 0
  return Math.ceil(longestValueChars * charPx * VALUE_LABEL_FONT_RATIO) + VALUE_LABEL_GAP_PX
}

/* ----------------------------- Axis shape ------------------------------ */

const ORDERED_PATTERNS: readonly RegExp[] = [
  // ISO date, with or without a time part: 2026-01-15, 2026-01-15T09:30:00Z
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/,
  // Year-month: 2026-01, 2026/1
  /^\d{4}[-/]\d{1,2}$/,
  // Year plus a period marker: 2026-Q1, 2026 H2, 2026W07
  /^\d{4}[-/ ]?(q[1-4]|h[12]|w\d{1,2})$/i,
  // The same written the other way round: Q1 2026, W07-2026
  /^(q[1-4]|h[12]|w\d{1,2})[-/ ]?\d{4}$/i,
  // Month name with a year: Jan 2026, January-2026, Jan. 26
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s,/-]+\d{2,4}$/i,
  // And the other way round: 2026 Jan
  /^\d{4}[\s,/-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?$/i,
]

function isOrderedValue(value: unknown): boolean {
  // A number is an ordinal axis (a year, a rating, an hour of the day). It
  // shares the property that matters here: its order carries meaning, so it
  // must stay left-to-right.
  if (typeof value === 'number') return Number.isFinite(value)
  if (value instanceof Date) return !Number.isNaN(value.getTime())
  if (typeof value !== 'string') return false

  const text = value.trim()
  if (text === '') return false
  if (Number.isFinite(Number(text))) return true

  return ORDERED_PATTERNS.some((pattern) => pattern.test(text))
}

/**
 * Whether the ORDER of an x axis carries meaning, judged on the VALUES.
 *
 * True for dates, year-months, years, month-plus-year and finite numbers: time
 * or magnitude, either way the sequence is part of what the chart says. Such an
 * axis is never flipped — a monthly chart must read left to right, and so must
 * store 101, 102, 103 — so its density problem is solved with tick thinning
 * instead. These labels are short, which is what makes thinning enough.
 *
 * Never judged on the column name. A client may call the column `period`, `ym`,
 * `bucket` or nothing recognisable at all, and a name lexicon would be a
 * category error across installs — it would read a product code
 * "date_of_manufacture_batch" as time and a genuine month column as text.
 */
export function isOrderedAxis(values: unknown[]): boolean {
  const sample: unknown[] = []
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    sample.push(value)
    if (sample.length >= ORDERED_SAMPLE_LIMIT) break
  }
  if (sample.length === 0) return false

  let matches = 0
  for (const value of sample) {
    if (isOrderedValue(value)) matches++
  }
  return matches / sample.length >= ORDERED_RATIO
}

export interface FlipInput {
  chartType: ChartType
  rows: number
  longestLabelChars: number
  width: number
  /** The axis order carries meaning (see isOrderedAxis); never flip it. */
  ordered: boolean
}

/**
 * Whether to draw a vertical bar chart on its side.
 *
 * Last line of defence, not a preference: 600px over 30 categories is a 20px
 * band, and a printed category label needs about 44px (MIN_LABEL_WIDTH). Turned
 * horizontal, the same categories get a full text column each. The data is not
 * touched — the flip is presentation only, and the host records it in
 * `data-cxc-layout` so a surprised reader can be answered.
 */
export function shouldFlipToHorizontal({
  chartType,
  rows,
  longestLabelChars,
  width,
  ordered,
}: FlipInput): boolean {
  if (!FLIPPABLE_CHART_TYPES.has(chartType)) return false
  if (ordered) return false

  if (rows > FLIP_MIN_CATEGORIES) return true
  if (rows > FLIP_LONG_LABEL_CATEGORIES && longestLabelChars > FLIP_LONG_LABEL_CHARS) return true
  // The 420px widget: a text axis runs out of room far sooner there.
  return width < NARROW_CHART_WIDTH_PX && rows > FLIP_LONG_LABEL_CATEGORIES
}

/* ---------------------------- Value labels ----------------------------- */

export interface ValueLabelAnchor {
  /**
   * Which edge of the bar rectangle the label hangs off: 'end' is the far edge
   * (x + width), 'start' the near edge (x).
   */
  side: 'end' | 'start'
  textAnchor: 'start' | 'end'
  dx: number
}

/**
 * Where a value label sits on a horizontal bar, by sign.
 *
 * recharts positions labels relative to the bar RECTANGLE, and a negative bar
 * is drawn from its value across to zero — so `position="right"` on a negative
 * bar lands on the zero line, on top of the next bar's label. Both signs anchor
 * on the OUTER end instead, which is where the reader's eye already is.
 */
export function valueLabelAnchor(value: number): ValueLabelAnchor {
  if (value < 0) return { side: 'start', textAnchor: 'end', dx: -VALUE_LABEL_GAP_PX }
  return { side: 'end', textAnchor: 'start', dx: VALUE_LABEL_GAP_PX }
}

export interface ValueSigns {
  positive: boolean
  negative: boolean
}

/**
 * Which sides of zero the plotted values occupy.
 *
 * Two decisions read this: the zero reference line (both sides), and which end
 * of the plot has to reserve room for a value label (each side separately — an
 * all-negative ranking hangs every label to the LEFT).
 */
export function valueSigns(data: DataRow[], keys: string[]): ValueSigns {
  let positive = false
  let negative = false
  for (const row of data) {
    for (const key of keys) {
      const num = toFiniteNumber(row[key])
      if (num === null) continue
      // Zero anchors on the positive side, the same way valueLabelAnchor does.
      if (num >= 0) positive = true
      else negative = true
      if (positive && negative) return { positive, negative }
    }
  }
  return { positive, negative }
}

/** Whether any two plotted values straddle zero (drives the zero reference line). */
export function hasMixedSigns(data: DataRow[], keys: string[]): boolean {
  const { positive, negative } = valueSigns(data, keys)
  return positive && negative
}

/* -------------------------------- Title -------------------------------- */

/**
 * Title for a chart the agent left untitled: "Gross Margin by Product Variant".
 *
 * The literal "Chart" was the old fallback. It costs the reader the one line
 * that says what they are looking at, and the labels to build a real one are
 * already on the wire.
 */
export function deriveTitle(x: ChartFieldRef, series: ChartFieldRef[]): string {
  const measures = series
    .map((field) => field.label?.trim())
    .filter((label): label is string => Boolean(label))
    .join(', ')
  const dimension = x.label?.trim() ?? ''

  if (measures && dimension) return `${measures} by ${dimension}`
  return measures || dimension
}

/* ------------------------------ Pie slices ------------------------------ */

export interface PieSlice {
  name: string
  value: number
}

/**
 * Cap the slice count, collapsing the tail into one "Other (k categories)".
 *
 * A pie already claims its slices sum to the whole, so summing the tail states
 * nothing the chart did not already assert — unlike a ranking, where an "Other"
 * bar would invent a number the agent never computed. Above MAX_SLICES the
 * colours stop being distinguishable and the legend outgrows the chart.
 *
 * The largest slices are kept, but in WIRE ORDER: the renderer never re-sorts,
 * because the order it was given may itself be the answer.
 */
export function collapseSlices(rows: PieSlice[], max: number = MAX_SLICES): PieSlice[] {
  if (max < 2 || rows.length <= max) return rows

  const keep = max - 1
  const kept = new Set(
    rows
      .map((slice, index) => ({ index, value: slice.value }))
      .sort((a, b) => b.value - a.value || a.index - b.index)
      .slice(0, keep)
      .map((entry) => entry.index),
  )

  const slices: PieSlice[] = []
  let otherTotal = 0
  let otherCount = 0
  rows.forEach((slice, index) => {
    if (kept.has(index)) {
      slices.push(slice)
      return
    }
    otherTotal += slice.value
    otherCount++
  })

  slices.push({ name: `Other (${otherCount} categories)`, value: otherTotal })
  return slices
}

/* --------------------------- Bar render plan --------------------------- */

export interface BarLayoutInput {
  chartType: ChartType
  /** Raw x values in wire order; the time-shape test reads these, not labels. */
  xValues: unknown[]
  /** Wire orientation. "vertical" already means horizontal bars in recharts. */
  orientation?: 'horizontal' | 'vertical'
  width: number
  mode: ChartRenderMode
  seriesCount: number
  stacked: boolean
  charPx?: number
}

export interface BarLayoutPlan {
  /** Draw horizontal bars — recharts calls that layout="vertical". */
  horizontal: boolean
  /** The policy turned a vertical chart on its side. Diagnostics only. */
  flipped: boolean
  /** Category labels in wire order, stringified once. */
  categories: string[]
  layout: CategoryLayout
}

/**
 * The single decision point for a bar chart's geometry.
 *
 * The block and the chart must agree: the block slices `data` to `shownRows`
 * and sizes the host, the chart draws what it is given. Two independent
 * decisions would disagree the moment slicing changes the row count that the
 * flip rule reads — 13 short categories flip, then 12 survive the slice and no
 * longer would. So the block computes the plan once and hands it down.
 */
export function planBarLayout({
  chartType,
  xValues,
  orientation,
  width,
  mode,
  seriesCount,
  stacked,
  charPx = CHAR_PX,
}: BarLayoutInput): BarLayoutPlan {
  const categories = xValues.map((value) => String(value ?? ''))
  const longestLabelChars = categories.reduce((longest, label) => Math.max(longest, label.length), 0)

  // The agent (or the bar_horizontal chart type) already asked for horizontal
  // bars; there is nothing left to decide, and nothing to report as flipped.
  const requestedHorizontal = orientation === 'vertical'
  const flipped =
    !requestedHorizontal &&
    shouldFlipToHorizontal({
      chartType,
      rows: categories.length,
      longestLabelChars,
      width,
      ordered: isOrderedAxis(xValues),
    })

  return {
    horizontal: requestedHorizontal || flipped,
    flipped,
    categories,
    layout: categoryLayout({
      rows: categories.length,
      width,
      mode,
      seriesCount,
      stacked,
      longestLabelChars,
      charPx,
    }),
  }
}
