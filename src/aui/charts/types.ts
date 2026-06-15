/* ------------------------------------------------------------------
 * Chart component contract
 *
 * These wrappers consume the EMITTED ChartBlock shape from the AUI
 * protocol (see DESIGN_AGENTIC_UI.md §1): structure and data travel
 * together — a flat row set plus an x-axis field and one or more
 * named series. The agent supplies business labels; the wrappers
 * render with indexed colors and the cx-* theme.
 * ----------------------------------------------------------------*/

/** A single data row keyed by field name (values are display- or numeric-typed). */
export type ChartDataRow = Record<string, unknown>

/** The x-axis (category) field: the key to read and the label to show. */
export interface ChartAxis {
  key: string
  label: string
}

/** One plotted series: the key to read and the label to show in tooltip/legend. */
export interface ChartSeries {
  key: string
  label: string
}

/** Optional rendering hints from the ChartBlock `options` field. */
export interface ChartOptions {
  /** Stack series on top of one another (bar/area). */
  stacked?: boolean
  /** Show the series legend. Defaults on when more than one series. */
  showLegend?: boolean
  /** Bar layout: "vertical" renders horizontal bars. Defaults to "horizontal". */
  orientation?: 'horizontal' | 'vertical'
}

/** Shared props for every chart wrapper. */
export interface ChartProps {
  data: ChartDataRow[]
  x: ChartAxis
  series: ChartSeries[]
  options?: ChartOptions
}
