import { useMemo } from 'react'
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  CHART_TOOLTIP_STYLE,
  CHART_ANIMATION,
  CHART_LEGEND_STYLE,
} from '../chart-theme'
import { getChartColor } from '../chart-colors'
import type { ChartProps } from './types'
import { shouldShowLegend } from './chart-helpers'
import { ChartEmpty } from './chart-empty'

interface PieChartProps extends ChartProps {
  /** Render as a donut (inner radius cut out). Maps the "donut" chart_type. */
  donut?: boolean
}

/**
 * Pie / donut chart over the emitted ChartBlock shape.
 *
 * A pie plots a single measure across categories, so it reads the first
 * `series` entry as the value and `x` as the slice label. Legend defaults
 * on (slices are otherwise unlabeled).
 */
export function PieChart({ data, x, series, options, donut = false }: PieChartProps) {
  const valueKey = series[0]?.key
  const valueLabel = series[0]?.label ?? ''

  const chartData = useMemo(() => {
    if (!data.length || !x.key || !valueKey) return []
    return data.map((row) => ({
      name: String(row[x.key] ?? ''),
      value: Number(row[valueKey]) || 0,
    }))
  }, [data, x.key, valueKey])

  if (!chartData.length) {
    return <ChartEmpty label="No data available" />
  }

  const showLegend = shouldShowLegend(chartData.length, options?.showLegend)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsPieChart
        accessibilityLayer
        aria-label={`${donut ? 'Donut' : 'Pie'} chart of ${valueLabel} by ${x.label}`}
      >
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={donut ? '60%' : 0}
          outerRadius="80%"
          paddingAngle={2}
          strokeWidth={0}
          animationDuration={CHART_ANIMATION.duration}
          animationEasing={CHART_ANIMATION.easing}
        >
          {chartData.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={getChartColor(index)}
              className="outline-none focus:outline-none"
            />
          ))}
        </Pie>

        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(value) => {
            if (value === undefined || value === null) return '--'
            return Number(value).toLocaleString()
          }}
        />

        {showLegend && (
          <Legend
            wrapperStyle={CHART_LEGEND_STYLE}
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
          />
        )}
      </RechartsPieChart>
    </ResponsiveContainer>
  )
}
