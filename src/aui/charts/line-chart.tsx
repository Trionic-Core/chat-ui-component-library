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
  shouldShowLegend,
  chartLegendProps,
  seriesDotProp,
} from './chart-helpers'
import {
  ANIMATION_MAX_ROWS,
  DEFAULT_CHART_WIDTH_PX,
  VALUE_AXIS_ESTIMATE_PX,
} from './chart-layout'
import { measureCharPx } from './label-fit'
import { useCategoryTicks } from './use-category-ticks'
import { useSeriesFormatters } from './use-series-formatters'
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
export function LineChart({ data, x, series, options, width = DEFAULT_CHART_WIDTH_PX }: ChartProps) {
  // The x axis is a category axis, so which labels print and how wide each may
  // be is the same question a vertical bar chart asks. One answer, one hook.
  const formatters = useSeriesFormatters(series)
  const ticks = useCategoryTicks({
    data,
    xKey: x.key,
    plotWidth: Math.max(1, width - VALUE_AXIS_ESTIMATE_PX),
    charPx: measureCharPx(),
  })

  if (!data.length || !x.key || series.length === 0) {
    return <ChartEmpty />
  }

  const showLegend = shouldShowLegend(series.length, options?.showLegend)
  const seriesLabels = series.map((s) => s.label).join(', ')
  const animate = data.length <= ANIMATION_MAX_ROWS

  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
      <RechartsLineChart
        data={data}
        accessibilityLayer
        aria-label={`Line chart of ${seriesLabels} by ${x.label}`}
      >
        <CartesianGrid {...CHART_GRID_STYLE} />
        <XAxis
          {...CHART_X_AXIS}
          dataKey={x.key}
          tickFormatter={ticks.tickFormatter}
          tick={ticks.tick}
          interval={ticks.interval}
        />
        <YAxis {...CHART_Y_AXIS} width="auto" tickFormatter={formatters.tick} />

        <Tooltip
          cursor={false}
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={formatters.tooltip}
          labelFormatter={ticks.tooltipLabelFormatter}
        />

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
            isAnimationActive={animate}
            animationDuration={CHART_ANIMATION.duration}
            animationEasing={CHART_ANIMATION.easing}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}
