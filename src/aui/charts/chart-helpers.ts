/* ------------------------------------------------------------------
 * Internal helpers shared across chart wrappers.
 * ----------------------------------------------------------------*/

import type { AxisDomainItem } from 'recharts'
import { CHART_LEGEND_STYLE } from '../chart-theme'
import { formatValue } from '../format'
import type { CellValue, DataRow } from '../aui-types'

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
 */
export function formatTooltipValue(value: unknown): string {
  return formatValue(value as CellValue, 'number')
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
