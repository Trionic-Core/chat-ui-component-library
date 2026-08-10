/* ------------------------------------------------------------------
 * Charts module — public surface for the AUI chart-block dispatcher.
 *
 * Every wrapper consumes the emitted ChartBlock shape (see ./types).
 * ----------------------------------------------------------------*/

export { BarChart } from './bar-chart'
export { LineChart } from './line-chart'
export { AreaChart } from './area-chart'
export { PieChart } from './pie-chart'
export { ScatterChart } from './scatter-chart'
export { BoxPlotChart } from './box-plot-chart'
export type { ChartProps, ChartOptions } from './types'
