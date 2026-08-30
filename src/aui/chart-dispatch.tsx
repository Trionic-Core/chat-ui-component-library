/* ------------------------------------------------------------------
 * Chart dispatcher
 *
 * Maps the emitted ChartBlock (closed chart_type enum + snake_case options)
 * onto the six chart wrappers — bar, line, area, pie, scatter, box plot — and
 * their camelCase ChartProps.
 * The enum carries presentation variants (bar_stacked, bar_horizontal,
 * donut, ...) that collapse onto a base component plus options here, so
 * the wrappers stay variant-free.
 * ----------------------------------------------------------------*/

import {
  BarChart,
  LineChart,
  AreaChart,
  PieChart,
  ScatterChart,
  BoxPlotChart,
  type ChartProps,
  type ChartOptions,
} from './charts'
import { ChartEmpty } from './charts/chart-empty'
import type { BarLayoutPlan, ChartRenderMode } from './charts/chart-layout'
import type { ChartBlock } from './aui-types'

/**
 * Translate the emitted snake_case options to the wrappers' camelCase props.
 *
 * Exported because the block plans a bar chart's layout before it renders one,
 * and both have to read the same orientation and the same stacking.
 */
export function chartOptionsFor(block: ChartBlock): ChartOptions {
  const stacked =
    block.options?.stacked ??
    (block.chart_type === 'bar_stacked' || block.chart_type === 'area_stacked')

  const orientation =
    block.options?.orientation ?? (block.chart_type === 'bar_horizontal' ? 'vertical' : undefined)

  return {
    stacked,
    showLegend: block.options?.show_legend,
    orientation,
  }
}

interface ChartDispatchProps {
  block: ChartBlock
  /** Render context from the block; a bare dispatch renders inline defaults. */
  mode?: ChartRenderMode
  width?: number
  /** Bar-family layout the block already decided (and sliced `data` to match). */
  plan?: BarLayoutPlan
  /** Character width measured on the block's host, in the host's own font. */
  charPx?: number
}

export function ChartDispatch({ block, mode, width, plan, charPx }: ChartDispatchProps) {
  const props: ChartProps = {
    data: block.data,
    x: block.x,
    series: block.series,
    options: chartOptionsFor(block),
    mode,
    width,
    chartType: block.chart_type,
    charPx,
    plan,
  }

  switch (block.chart_type) {
    case 'bar':
    case 'bar_horizontal':
    case 'bar_grouped':
    case 'bar_stacked':
      return <BarChart {...props} />
    case 'line':
      return <LineChart {...props} />
    case 'area':
    case 'area_stacked':
      return <AreaChart {...props} />
    case 'pie':
      return <PieChart {...props} />
    case 'donut':
      return <PieChart {...props} donut />
    case 'scatter':
      return <ScatterChart {...props} />
    case 'box_plot':
      return <BoxPlotChart {...props} />
    default:
      return <ChartEmpty label="Unsupported chart type" />
  }
}
