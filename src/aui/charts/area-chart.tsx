import { useId } from 'react'
import {
  AreaChart as RechartsAreaChart,
  Area,
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
 * Area chart over the emitted ChartBlock shape.
 *
 * Each entry in `series` becomes one gradient-filled area, indexed-colored.
 * `options.stacked` stacks the areas.
 *
 * The value axis is always drawn — see the note on LineChart: a touch device
 * has no hover, so a tooltip-only chart hides its own numbers there.
 */
export function AreaChart({ data, x, series, options, width = DEFAULT_CHART_WIDTH_PX }: ChartProps) {
  // Per-instance prefix so two AreaCharts with the same series key don't collide
  // on a document-global <linearGradient id> (and its url(#...) fill reference).
  const uid = useId()

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
      <RechartsAreaChart
        data={data}
        accessibilityLayer
        aria-label={`Area chart of ${seriesLabels} by ${x.label}`}
      >
        <defs>
          {series.map((s, index) => (
            <linearGradient
              key={s.key}
              id={`area-gradient-${uid}-${s.key}`}
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
          <Area
            key={s.key}
            dataKey={s.key}
            name={s.label}
            type="monotone"
            stroke={getChartColor(index)}
            fill={`url(#area-gradient-${uid}-${s.key})`}
            strokeWidth={2}
            dot={seriesDotProp(data, s.key)}
            stackId={options?.stacked ? 'stack' : undefined}
            isAnimationActive={animate}
            animationDuration={CHART_ANIMATION.duration}
            animationEasing={CHART_ANIMATION.easing}
          />
        ))}
      </RechartsAreaChart>
    </ResponsiveContainer>
  )
}
