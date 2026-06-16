/* ------------------------------------------------------------------
 * Internal helpers shared across chart wrappers.
 * ----------------------------------------------------------------*/

import { CHART_LEGEND_STYLE } from '../chart-theme'

/**
 * Shared <Legend> props for the cartesian wrappers (bar/area/line/scatter).
 * Returns just the themed wrapperStyle subset they all use; the pie chart
 * intentionally diverges (full CHART_LEGEND_STYLE + vertical/icon overrides).
 */
export function chartLegendProps() {
  return {
    wrapperStyle: {
      fontSize: CHART_LEGEND_STYLE.fontSize,
      color: CHART_LEGEND_STYLE.color,
    },
  }
}

/** Shorten long category labels for axis ticks (full value stays in the tooltip). */
export function shortenLabel(value: unknown): string {
  const str = String(value ?? '')
  return str.length > 12 ? `${str.slice(0, 10)}...` : str
}

/** Whether a legend should render: explicit option wins, else on for multi-series. */
export function shouldShowLegend(seriesCount: number, showLegend?: boolean): boolean {
  return showLegend ?? seriesCount > 1
}
