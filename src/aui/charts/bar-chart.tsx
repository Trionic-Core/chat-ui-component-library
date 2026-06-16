import {
  BarChart as RechartsBarChart,
  Bar,
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
} from '../chart-theme'
import { getChartColor } from '../chart-colors'
import type { ChartProps } from './types'
import { shortenLabel, shouldShowLegend, chartLegendProps } from './chart-helpers'
import { ChartEmpty } from './chart-empty'

/**
 * Bar chart over the emitted ChartBlock shape.
 *
 * Each entry in `series` becomes one set of bars, indexed-colored.
 * `options.stacked` stacks them; `options.orientation = "vertical"`
 * renders horizontal bars (category on the Y axis).
 */
export function BarChart({ data, x, series, options }: ChartProps) {
  if (!data.length || !x.key || series.length === 0) {
    return <ChartEmpty />
  }

  const isVertical = options?.orientation === 'vertical'
  const showLegend = shouldShowLegend(series.length, options?.showLegend)
  const seriesLabels = series.map((s) => s.label).join(', ')

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsBarChart
        data={data}
        layout={isVertical ? 'vertical' : 'horizontal'}
        accessibilityLayer
        aria-label={`Bar chart of ${seriesLabels} by ${x.label}`}
      >
        <CartesianGrid {...CHART_GRID_STYLE} />

        {isVertical ? (
          <>
            <XAxis {...CHART_X_AXIS} type="number" />
            <YAxis
              {...CHART_Y_AXIS}
              dataKey={x.key}
              type="category"
              width={100}
              tickFormatter={shortenLabel}
            />
          </>
        ) : (
          <XAxis {...CHART_X_AXIS} dataKey={x.key} tickFormatter={shortenLabel} />
        )}

        <Tooltip cursor={false} contentStyle={CHART_TOOLTIP_STYLE} />

        {showLegend && <Legend {...chartLegendProps()} />}

        {series.map((s, index) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={getChartColor(index)}
            radius={4}
            stackId={options?.stacked ? 'stack' : undefined}
            isAnimationActive
            animationDuration={CHART_ANIMATION.duration}
            animationEasing={CHART_ANIMATION.easing}
          />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}
