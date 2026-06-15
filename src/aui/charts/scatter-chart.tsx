import {
  ScatterChart as RechartsScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  CHART_X_AXIS,
  CHART_Y_AXIS,
  CHART_GRID_STYLE,
  CHART_TOOLTIP_STYLE,
  CHART_ANIMATION,
  CHART_LEGEND_STYLE,
} from '../chart-theme'
import { getChartColor } from '../chart-colors'
import type { ChartProps } from './types'
import { shouldShowLegend } from './chart-helpers'
import { ChartEmpty } from './chart-empty'

/**
 * Scatter chart over the emitted ChartBlock shape.
 *
 * `x` is the numeric X axis; each entry in `series` is a numeric Y measure
 * plotted against it as its own indexed-colored point cloud. Best for
 * correlating two measures.
 */
export function ScatterChart({ data, x, series, options }: ChartProps) {
  if (!data.length || !x.key || series.length === 0) {
    return <ChartEmpty label="Configure X-axis and a measure for the scatter plot" />
  }

  const showLegend = shouldShowLegend(series.length, options?.showLegend)
  const seriesLabels = series.map((s) => s.label).join(', ')

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsScatterChart
        margin={{ top: 10, right: 20, bottom: 20, left: 10 }}
        accessibilityLayer
        aria-label={`Scatter chart of ${seriesLabels} by ${x.label}`}
      >
        <CartesianGrid {...CHART_GRID_STYLE} />
        <XAxis {...CHART_X_AXIS} dataKey={x.key} type="number" name={x.label} />
        <YAxis {...CHART_Y_AXIS} type="number" />

        <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={CHART_TOOLTIP_STYLE} />

        {showLegend && (
          <Legend
            wrapperStyle={{
              fontSize: CHART_LEGEND_STYLE.fontSize,
              color: CHART_LEGEND_STYLE.color,
            }}
          />
        )}

        {series.map((s, index) => (
          <Scatter
            key={s.key}
            name={s.label}
            dataKey={s.key}
            data={data}
            fill={getChartColor(index)}
            isAnimationActive
            animationDuration={CHART_ANIMATION.duration}
            animationEasing={CHART_ANIMATION.easing}
          />
        ))}
      </RechartsScatterChart>
    </ResponsiveContainer>
  )
}
