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
  BAR_VALUE_DOMAIN,
} from './chart-helpers'
import { ChartEmpty } from './chart-empty'

/**
 * Bar chart over the emitted ChartBlock shape.
 *
 * Each entry in `series` becomes one set of bars, indexed-colored.
 * `options.stacked` stacks them; `options.orientation = "vertical"`
 * renders horizontal bars (category on the Y axis).
 *
 * Whichever axis carries the values is drawn and anchored at zero
 * (BAR_VALUE_DOMAIN): a bar reads as a length, so a floating baseline
 * overstates small differences.
 */
export function BarChart({ data, x, series, options }: ChartProps) {
  if (!data.length || !x.key || series.length === 0) {
    return <ChartEmpty />
  }

  const isVertical = options?.orientation === 'vertical'
  const showLegend = shouldShowLegend(series.length, options?.showLegend)
  const seriesLabels = series.map((s) => s.label).join(', ')

  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
      <RechartsBarChart
        data={data}
        layout={isVertical ? 'vertical' : 'horizontal'}
        accessibilityLayer
        aria-label={`Bar chart of ${seriesLabels} by ${x.label}`}
      >
        <CartesianGrid {...CHART_GRID_STYLE} />

        {isVertical ? (
          <>
            <XAxis
              {...CHART_X_AXIS}
              type="number"
              domain={BAR_VALUE_DOMAIN}
              tickFormatter={formatAxisTick}
            />
            <YAxis
              {...CHART_Y_AXIS}
              dataKey={x.key}
              type="category"
              width={100}
              tickFormatter={shortenLabel}
            />
          </>
        ) : (
          <>
            <XAxis {...CHART_X_AXIS} dataKey={x.key} tickFormatter={shortenLabel} />
            <YAxis
              {...CHART_Y_AXIS}
              type="number"
              width="auto"
              domain={BAR_VALUE_DOMAIN}
              tickFormatter={formatAxisTick}
            />
          </>
        )}

        <Tooltip cursor={false} contentStyle={CHART_TOOLTIP_STYLE} formatter={formatTooltipValue} />

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
