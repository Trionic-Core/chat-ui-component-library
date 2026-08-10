/* ------------------------------------------------------------------
 * Chart dispatcher
 *
 * Maps the emitted ChartBlock (closed chart_type enum + snake_case
 * options) onto the five chart wrappers and their camelCase ChartProps.
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
import type { ChartBlock } from './aui-types'

/** Translate the emitted snake_case options to the wrappers' camelCase props. */
function toChartOptions(block: ChartBlock): ChartOptions {
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

export function ChartDispatch({ block }: { block: ChartBlock }) {
  const props: ChartProps = {
    data: block.data,
    x: block.x,
    series: block.series,
    options: toChartOptions(block),
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
