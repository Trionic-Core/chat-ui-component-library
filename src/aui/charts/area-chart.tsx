import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  CHART_X_AXIS,
  CHART_GRID_STYLE,
  CHART_TOOLTIP_STYLE,
  CHART_ANIMATION,
  CHART_LEGEND_STYLE,
} from '../chart-theme'
import { getChartColor } from '../chart-colors'
import type { ChartProps } from './types'
import { shortenLabel, shouldShowLegend } from './chart-helpers'
import { ChartEmpty } from './chart-empty'

/**
 * Area chart over the emitted ChartBlock shape.
 *
 * Each entry in `series` becomes one gradient-filled area, indexed-colored.
 * `options.stacked` stacks the areas.
 */
export function AreaChart({ data, x, series, options }: ChartProps) {
  if (!data.length || !x.key || series.length === 0) {
    return <ChartEmpty />
  }

  const showLegend = shouldShowLegend(series.length, options?.showLegend)
  const seriesLabels = series.map((s) => s.label).join(', ')

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsAreaChart
        data={data}
        accessibilityLayer
        aria-label={`Area chart of ${seriesLabels} by ${x.label}`}
      >
        <defs>
          {series.map((s, index) => (
            <linearGradient
              key={`area-gradient-${s.key}`}
              id={`area-gradient-${s.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={getChartColor(index)} stopOpacity={0.3} />
              <stop offset="100%" stopColor={getChartColor(index)} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>

        <CartesianGrid {...CHART_GRID_STYLE} />
        <XAxis {...CHART_X_AXIS} dataKey={x.key} tickFormatter={shortenLabel} />

        <Tooltip cursor={false} contentStyle={CHART_TOOLTIP_STYLE} />

        {showLegend && (
          <Legend
            wrapperStyle={{
              fontSize: CHART_LEGEND_STYLE.fontSize,
              color: CHART_LEGEND_STYLE.color,
            }}
          />
        )}

        {series.map((s, index) => (
          <Area
            key={s.key}
            dataKey={s.key}
            name={s.label}
            type="monotone"
            stroke={getChartColor(index)}
            fill={`url(#area-gradient-${s.key})`}
            strokeWidth={2}
            stackId={options?.stacked ? 'stack' : undefined}
            isAnimationActive
            animationDuration={CHART_ANIMATION.duration}
            animationEasing={CHART_ANIMATION.easing}
          />
        ))}
      </RechartsAreaChart>
    </ResponsiveContainer>
  )
}
