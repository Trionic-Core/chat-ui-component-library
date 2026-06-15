/* ------------------------------------------------------------------
 * Internal helpers shared across chart wrappers.
 * ----------------------------------------------------------------*/

/** Shorten long category labels for axis ticks (full value stays in the tooltip). */
export function shortenLabel(value: unknown): string {
  const str = String(value ?? '')
  return str.length > 12 ? `${str.slice(0, 10)}...` : str
}

/** Whether a legend should render: explicit option wins, else on for multi-series. */
export function shouldShowLegend(seriesCount: number, showLegend?: boolean): boolean {
  return showLegend ?? seriesCount > 1
}
