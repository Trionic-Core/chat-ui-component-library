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
  CHART_INITIAL_DIMENSION,
} from '../chart-theme'
import { getChartColor } from '../chart-colors'
import type { ChartProps } from './types'
import { shouldShowLegend } from './chart-helpers'
import { useSeriesFormatters } from './use-series-formatters'
import { ANIMATION_MAX_ROWS, MAX_SLICES, collapseSlices, type PieSlice } from './chart-layout'
import { ChartEmpty } from './chart-empty'

interface PieChartProps extends ChartProps {
  /** Render as a donut (inner radius cut out). Maps the "donut" chart_type. */
  donut?: boolean
}

/** A pie's slices, or the reason there is no honest pie to draw. */
interface PieData {
  slices: PieSlice[]
  invalid: boolean
}

/**
 * Read the rows into slices, refusing anything a pie cannot honestly show.
 *
 * A pie asserts that its slices are the parts of one whole. Negative values
 * have no share of a whole, and a zero or non-numeric total has no whole to
 * divide — the old `Number(v) || 0` quietly turned both into a confident,
 * meaningless picture. Blank cells still count as zero; that is a missing
 * measurement, not a contradiction.
 */
function readSlices(rows: PieSlice[]): PieData {
  let total = 0
  for (const slice of rows) {
    if (!Number.isFinite(slice.value) || slice.value < 0) return { slices: [], invalid: true }
    total += slice.value
  }
  if (!(total > 0)) return { slices: [], invalid: true }

  return { slices: collapseSlices(rows, MAX_SLICES), invalid: false }
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

  // A pie plots ONE measure, so every slice — the "Other" aggregate included —
  // formats through that single series. The shared formatter handles it: with
  // one series it skips the dataKey lookup, which would miss here anyway
  // (recharts hands a pie the slice's "value" key, not the measure's).
  const formatters = useSeriesFormatters(series)

  const { slices, invalid } = useMemo<PieData>(() => {
    if (!data.length || !x.key || !valueKey) return { slices: [], invalid: false }
    return readSlices(
      data.map((row) => {
        const raw = row[valueKey]
        return {
          name: String(row[x.key] ?? ''),
          // A blank cell is a missing measurement, so it takes no share.
          value: raw === null || raw === undefined || raw === '' ? 0 : Number(raw),
        }
      }),
    )
  }, [data, x.key, valueKey])

  if (invalid) {
    return (
      <ChartEmpty
        label="These values cannot be drawn as a pie: a share of a whole cannot be negative."
        reason="pie_invalid_values"
      />
    )
  }

  if (!slices.length) {
    return <ChartEmpty label="No data available" />
  }

  const showLegend = shouldShowLegend(slices.length, options?.showLegend)

  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
      <RechartsPieChart
        accessibilityLayer
        aria-label={`${donut ? 'Donut' : 'Pie'} chart of ${valueLabel} by ${x.label}`}
      >
        <Pie
          data={slices}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={donut ? '60%' : 0}
          outerRadius="80%"
          paddingAngle={2}
          strokeWidth={0}
          isAnimationActive={slices.length <= ANIMATION_MAX_ROWS}
          animationDuration={CHART_ANIMATION.duration}
          animationEasing={CHART_ANIMATION.easing}
        >
          {slices.map((slice, index) => (
            <Cell
              key={`cell-${slice.name}-${index}`}
              fill={getChartColor(index)}
              className="outline-none focus:outline-none"
            />
          ))}
        </Pie>

        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={formatters.tooltip} />

        {showLegend && (
          // Intentionally diverges from chartLegendProps(): the pie legend is
          // bottom-aligned with circle swatches, since its slices are otherwise
          // unlabeled. `labelStyle` matters for the same reason it does there —
          // recharts paints legend text in the slice color unless told not to.
          <Legend
            wrapperStyle={{ fontSize: CHART_LEGEND_STYLE.fontSize }}
            labelStyle={{ color: CHART_LEGEND_STYLE.color }}
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
          />
        )}
      </RechartsPieChart>
    </ResponsiveContainer>
  )
}
