import {
  LineChart as RechartsLineChart,
  Line,
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
  CHART_INITIAL_DIMENSION,
} from '../chart-theme'
import { getChartColor } from '../chart-colors'
import type { ChartProps } from './types'
import {
  shortenLabel,
  shouldShowLegend,
  chartLegendProps,
  formatAxisTick,
  formatTooltipValue,
  seriesDotProp,
} from './chart-helpers'
import { ChartEmpty } from './chart-empty'

/**
 * Line chart over the emitted ChartBlock shape.
 *
 * Each entry in `series` becomes one line, indexed-colored. Best for
 * trends over an ordered (typically date) x-axis.
 *
 * The value axis is always drawn. The chart renders inside a chat message on
 * whatever device the user holds, and a touch device has no hover — without an
 * axis the numbers would be unreachable there.
 */
export function LineChart({ data, x, series, options }: ChartProps) {
  if (!data.length || !x.key || series.length === 0) {
    return <ChartEmpty />
  }

  const showLegend = shouldShowLegend(series.length, options?.showLegend)
  const seriesLabels = series.map((s) => s.label).join(', ')

  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
      <RechartsLineChart
        data={data}
        accessibilityLayer
        aria-label={`Line chart of ${seriesLabels} by ${x.label}`}
      >
        <CartesianGrid {...CHART_GRID_STYLE} />
        <XAxis {...CHART_X_AXIS} dataKey={x.key} tickFormatter={shortenLabel} />
        <YAxis {...CHART_Y_AXIS} width="auto" tickFormatter={formatAxisTick} />

        <Tooltip cursor={false} contentStyle={CHART_TOOLTIP_STYLE} formatter={formatTooltipValue} />

        {showLegend && <Legend {...chartLegendProps()} />}

        {series.map((s, index) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.label}
            type="monotone"
            stroke={getChartColor(index)}
            strokeWidth={2}
            dot={seriesDotProp(data, s.key)}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive
            animationDuration={CHART_ANIMATION.duration}
            animationEasing={CHART_ANIMATION.easing}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}
