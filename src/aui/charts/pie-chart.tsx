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
import { usePrefersReducedMotion } from '../hooks/use-prefers-reduced-motion'
import { useSeriesFormatters } from './use-series-formatters'
import { MAX_SLICES, collapseSlices, shouldAnimate, type PieSlice } from './chart-layout'
import { ChartEmpty } from './chart-empty'

interface PieChartProps extends ChartProps {
  /** Render as a donut (inner radius cut out). Maps the "donut" chart_type. */
  donut?: boolean
}

/** Why a pie was refused. Each cause gets its own reason and its own sentence. */
type PieRejection = 'pie_negative_values' | 'pie_non_numeric_values' | 'pie_zero_total'

/** A pie's slices, or the reason there is no honest pie to draw. */
interface PieData {
  slices: PieSlice[]
  rejection: PieRejection | null
}

/**
 * Read the rows into slices, refusing anything a pie cannot honestly show.
 *
 * A pie asserts that its slices are the parts of one whole. Negative values
 * have no share of a whole, a non-numeric cell has no share at all, and a zero
 * total has no whole to divide — the old `Number(v) || 0` quietly turned all
 * three into a confident, meaningless picture. Blank cells still count as zero;
 * that is a missing measurement, not a contradiction.
 *
 * The three causes are told apart because the reader can act on the difference:
 * a negative value is a question about the measure, a zero total is a question
 * about the filter.
 */
function readSlices(rows: PieSlice[]): PieData {
  // Fixed PRECEDENCE, not row order: a dataset with both faults would
  // otherwise be explained by whichever row happened to come first, so the
  // same data could produce two different messages after a re-sort. A cell
  // that is not a number is the graver authoring fault — it means the measure
  // is not a measure — so it is reported ahead of a negative share, and an
  // empty total is only worth naming once the values are all usable numbers.
  if (rows.some((slice) => !Number.isFinite(slice.value))) {
    return { slices: [], rejection: 'pie_non_numeric_values' }
  }
  if (rows.some((slice) => slice.value < 0)) {
    return { slices: [], rejection: 'pie_negative_values' }
  }
  const total = rows.reduce((sum, slice) => sum + slice.value, 0)
  if (!(total > 0)) return { slices: [], rejection: 'pie_zero_total' }

  return { slices: collapseSlices(rows, MAX_SLICES), rejection: null }
}

/** The sentence for each cause — the reason attribute is the stable half. */
const REJECTION_LABEL: Record<PieRejection, string> = {
  pie_negative_values: 'These values cannot be drawn as a pie: a share of a whole cannot be negative.',
  pie_non_numeric_values: 'These values cannot be drawn as a pie: one of them is not a number.',
  pie_zero_total: 'These values cannot be drawn as a pie: they add up to zero, so there is no whole to divide.',
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
  const reducedMotion = usePrefersReducedMotion()

  const { slices, rejection } = useMemo<PieData>(() => {
    if (!data.length || !x.key || !valueKey) return { slices: [], rejection: null }
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

  if (rejection) {
    return <ChartEmpty label={REJECTION_LABEL[rejection]} reason={rejection} />
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
          isAnimationActive={shouldAnimate(slices.length) && !reducedMotion}
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
