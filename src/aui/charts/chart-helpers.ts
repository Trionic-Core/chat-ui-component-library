/* ------------------------------------------------------------------
 * Internal helpers shared across chart wrappers.
 * ----------------------------------------------------------------*/

import type { AxisDomainItem } from 'recharts'
import { CHART_LEGEND_STYLE } from '../chart-theme'
import { formatValue, formatWithUnit } from '../format'
import type { CellValue, ChartFieldRef, DataRow } from '../aui-types'

/**
 * Shared <Legend> props for the cartesian wrappers (bar/area/line/scatter).
 *
 * `labelStyle` is load-bearing, not decoration: recharts' DefaultLegendContent
 * falls back to `entry.color` for the label when no label color is set, so a
 * pale series painted its own legend text in that pale color — unreadable on
 * the canvas. Pinning the text to the secondary text token keeps the coloured
 * swatch as the identity cue and the label as plain, legible text.
 *
 * The pie chart intentionally diverges (vertical/icon overrides).
 */
export function chartLegendProps() {
  return {
    wrapperStyle: {
      fontSize: CHART_LEGEND_STYLE.fontSize,
    },
    labelStyle: {
      color: CHART_LEGEND_STYLE.color,
    },
  }
}

/**
 * Value-axis tick label. Compact notation (1234567 -> "1.2M") because a value
 * axis is the narrowest text in the chart — on a phone-width chat column a
 * grouped number would either wrap or eat the plot area.
 */
export function formatAxisTick(value: unknown): string {
  return formatValue(value as CellValue, 'compact')
}

/**
 * Tooltip value. Grouped in full ("1,234,567") — the tooltip is the one place
 * with room for the exact figure, so the axis stays compact and the tooltip
 * stays precise. Both route through the shared formatter, so a chart, a KPI
 * card and a table cell render the same number identically.
 *
 * The unit-aware path is formatSeriesValue(); this is the fallback for a value
 * whose series cannot be identified, and for the charts that carry no series.
 */
export function formatTooltipValue(value: unknown): string {
  return formatValue(value as CellValue, 'number')
}

/* ----------------------- Series format and unit ----------------------- */

/**
 * One measure, rendered the way its series says to render it.
 *
 * `compact` is a placement decision, not a data one: an axis tick and a value
 * label have room for "1.2M ₹", a tooltip has room for "1,234,567 ₹". The unit
 * is appended by the shared formatWithUnit, so a chart, a KPI card and a table
 * cell all show the client's own symbol identically.
 *
 * `percent` is the exception that takes neither: the format already prints the
 * symbol, and a unit on top would read "12% %".
 */
export function formatSeriesValue(
  value: unknown,
  series: ChartFieldRef,
  { compact }: { compact: boolean },
): string {
  if (series.format === 'percent') return formatValue(value as CellValue, 'percent')
  return formatWithUnit(
    value as CellValue,
    compact ? 'compact' : (series.format ?? 'number'),
    series.unit,
  )
}

/**
 * The string a value label paints for one series — compact, plus its unit.
 *
 * The ONE place that string is produced. The chart reserves margin for it and
 * tests whether it fits a band, and both of those measurements have to be of
 * the text that actually prints: measuring "1.2M" while painting "1.2M ₹" is
 * short by the unit, and the longest bar's number clips at the plot edge.
 */
export function seriesValueLabel(value: unknown, series: ChartFieldRef): string {
  return formatSeriesValue(value, series, { compact: true })
}

/**
 * Characters in the longest value label the chart will paint.
 *
 * Per series, because units can differ between them: a ₹ measure beside a bare
 * count needs room for the wider of the two.
 */
export function longestValueLabel(data: DataRow[], series: ChartFieldRef[]): number {
  let longest = 0
  for (const row of data) {
    for (const field of series) {
      const value = row[field.key]
      if (value === null || value === undefined || value === '') continue
      if (!Number.isFinite(Number(value))) continue
      longest = Math.max(longest, seriesValueLabel(value, field).length)
    }
  }
  return longest
}

/**
 * The unit a SHARED value axis may claim: the one every series agrees on.
 *
 * One axis cannot be in two units. With revenue in ₹ beside a count, "1.2M ₹"
 * on the axis would be a false statement about half the bars, so the axis goes
 * bare and the tooltip and the value labels carry each series' own unit.
 */
export function axisUnitFor(series: ChartFieldRef[]): string | undefined {
  const first = series[0]?.unit
  if (!first) return undefined
  return series.every((field) => field.unit === first) ? first : undefined
}

/** The synthetic field a shared value axis formats through — see axisUnitFor. */
export function axisFieldFor(series: ChartFieldRef[]): ChartFieldRef {
  const percent = series.length > 0 && series.every((field) => field.format === 'percent')
  return {
    key: '',
    label: '',
    format: percent ? 'percent' : undefined,
    unit: axisUnitFor(series),
  }
}

/** Value-axis tick formatter for a chart's series set. Compact, plus any unit. */
export function makeAxisTickFormatter(series: ChartFieldRef[]): (value: unknown) => string {
  const field = axisFieldFor(series)
  return (value: unknown) => formatSeriesValue(value, field, { compact: true })
}

/**
 * Full-precision formatter for the SHARED value field — the axis's own terms.
 *
 * For a readout that has no per-entry series to resolve: a box plot prints five
 * numbers of ONE measure, so there is no dataKey to look up, only the unit the
 * five series agree on.
 */
export function makeValueFormatter(series: ChartFieldRef[]): (value: unknown) => string {
  const field = axisFieldFor(series)
  return (value: unknown) => formatSeriesValue(value, field, { compact: false })
}

/**
 * One tooltip entry carries the key of the series it came from.
 *
 * `unknown` because recharts types dataKey as string | number | accessor
 * FUNCTION; a function stringifies to something no series key matches, which
 * falls through to the plain formatter — the honest outcome.
 */
interface TooltipItem {
  dataKey?: unknown
}

/**
 * Tooltip value formatter that renders each entry in ITS OWN series' terms.
 *
 * A grouped chart can mix a currency and a count in one tooltip, so the series
 * is resolved per entry from recharts' `dataKey` rather than assumed.
 *
 * With a SINGLE series there is nothing to disambiguate, so the lookup is
 * skipped: a pie's slices carry dataKey "value", not the measure's key, and a
 * lookup there would miss and silently drop the client's unit.
 */
export function makeTooltipValueFormatter(
  series: ChartFieldRef[],
): (value: unknown, name: unknown, item?: TooltipItem) => string {
  const only = series.length === 1 ? series[0] : undefined
  const byKey = new Map(series.map((field) => [field.key, field]))

  return (value: unknown, _name: unknown, item?: TooltipItem) => {
    const field = only ?? byKey.get(String(item?.dataKey ?? ''))
    return field ? formatSeriesValue(value, field, { compact: false }) : formatTooltipValue(value)
  }
}

/**
 * Tooltip category label — the full, unfitted value.
 *
 * The axis prints a label fitted to the space it has; the tooltip is the place
 * that owes the reader the whole name. recharts hands this the raw axis value,
 * not the formatted tick, so no un-fitting is needed.
 */
export function formatTooltipLabel(label: unknown): string {
  return String(label ?? '')
}

/** Whether a legend should render: explicit option wins, else on for multi-series. */
export function shouldShowLegend(seriesCount: number, showLegend?: boolean): boolean {
  return showLegend ?? seriesCount > 1
}

/**
 * Value-axis domain for bars: always anchored at zero, but extended below it
 * when the data goes negative.
 *
 * A bar encodes magnitude by length, so a non-zero baseline exaggerates small
 * differences — recharts' default `auto` domain does exactly that. A plain
 * `[0, 'auto']` would fix the exaggeration and introduce a worse bug: negative
 * bars (loss, drawdown, net change — ordinary in client data) would be clipped
 * out of the plot entirely. This keeps the honest baseline in both cases.
 */
export const BAR_VALUE_DOMAIN: Readonly<[AxisDomainItem, AxisDomainItem]> = [
  (dataMin: number) => Math.min(0, dataMin),
  'auto',
]

/**
 * Point count at or below which a line/area series draws its markers.
 *
 * Marker-less lines are cleaner at density, but a series with a single point
 * draws a zero-length path — a blank chart. Below this count the markers also
 * carry real information: they say where the observations actually are, rather
 * than implying a continuous reading between sparse samples.
 */
export const SPARSE_SERIES_POINT_LIMIT = 8

/** Number of rows carrying a plottable (finite numeric) value for `key`. */
export function countPlottablePoints(data: DataRow[], key: string): number {
  let count = 0
  for (const row of data) {
    const value = row[key]
    if (value === null || value === undefined || value === '') continue
    if (Number.isFinite(typeof value === 'number' ? value : Number(value))) count++
  }
  return count
}

/**
 * The `dot` prop for one line/area series: markers on a sparse series (see
 * SPARSE_SERIES_POINT_LIMIT), off once the series is dense enough to read as
 * a trend.
 */
export function seriesDotProp(data: DataRow[], key: string): false | { r: number; strokeWidth: number } {
  return countPlottablePoints(data, key) <= SPARSE_SERIES_POINT_LIMIT
    ? { r: 3, strokeWidth: 0 }
    : false
}
