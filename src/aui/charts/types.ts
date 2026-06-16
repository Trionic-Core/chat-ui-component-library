/* ------------------------------------------------------------------
 * Chart component contract
 *
 * These wrappers consume the EMITTED ChartBlock shape from the AUI
 * protocol (see DESIGN_AGENTIC_UI.md §1): structure and data travel
 * together — a flat row set plus an x-axis field and one or more
 * named series. The agent supplies business labels; the wrappers
 * render with indexed colors and the cx-* theme.
 *
 * The field/row shapes are the canonical wire types (ChartFieldRef,
 * DataRow) — these props are a thin, camelCase view of ChartBlock, so
 * they reuse the contract types rather than redeclaring them.
 * ----------------------------------------------------------------*/

import type { ChartFieldRef, DataRow } from '../aui-types'

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
  data: DataRow[]
  x: ChartFieldRef
  series: ChartFieldRef[]
  options?: ChartOptions
}
