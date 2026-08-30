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

import type { ChartFieldRef, ChartType, DataRow } from '../aui-types'
import type { BarLayoutPlan, ChartRenderMode } from './chart-layout'

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

  /* --------------------------------------------------------------
   * Render context (all optional, so a chart still renders standalone).
   *
   * The legibility policy needs to know how much room it has and which
   * surface it is on; a chart rendered without a block falls back to the
   * inline defaults and decides for itself.
   * ------------------------------------------------------------*/

  /** Inline card, or the expand dialog where the body scrolls. */
  mode?: ChartRenderMode
  /** Measured host width in px. */
  width?: number
  /** The wire chart_type, which the orientation policy reads. */
  chartType?: ChartType
  /**
   * Mean character width measured on the mounted host, in the host's own font
   * and over this chart's own labels. The Latin estimate when unmeasured.
   */
  charPx?: number
  /**
   * Layout decided by the block, which sliced `data` to match it.
   *
   * Bar family only. Recomputing it here would disagree with the block the
   * moment slicing changes the row count the flip rule reads.
   */
  plan?: BarLayoutPlan
}
