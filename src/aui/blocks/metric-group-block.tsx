import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { Card } from '../ui/card'
import { CHART_ANIMATION } from '../chart-theme'
import { getChartColor } from '../chart-colors'
import type { Metric, MetricGroupBlock as MetricGroupBlockType, MetricDelta } from '../aui-types'
import { formatValue } from '../format'

/* ------------------------------------------------------------------
 * Metric Group Block
 *
 * A responsive grid of KPI cards. Each card shows a big formatted
 * value, an optional unit, a colored delta (up = success, down =
 * error, flat = muted), and an optional baseline-free sparkline.
 * ----------------------------------------------------------------*/

interface MetricGroupBlockProps {
  block: MetricGroupBlockType
}

export function MetricGroupBlock({ block }: MetricGroupBlockProps) {
  if (block.metrics.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {block.metrics.map((metric) => (
        <MetricCard key={metric.id} metric={metric} />
      ))}
    </div>
  )
}

function MetricCard({ metric }: { metric: Metric }) {
  const value = formatValue(metric.value, metric.format)

  return (
    <Card padding="sm" className="flex flex-col gap-2">
      <p className="text-xs font-medium" style={{ color: 'var(--cx-text-secondary)' }}>
        {metric.label}
      </p>

      <div className="flex items-baseline gap-1.5">
        <span
          className="text-2xl font-semibold tracking-tight"
          style={{ color: 'var(--cx-text-primary)' }}
        >
          {value}
        </span>
        {metric.unit && (
          <span className="text-xs" style={{ color: 'var(--cx-text-muted)' }}>
            {metric.unit}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        {metric.delta ? <DeltaPill delta={metric.delta} /> : <span />}
        {metric.spark && metric.spark.length > 1 && <Sparkline values={metric.spark} />}
      </div>
    </Card>
  )
}

/* ----------------------------- Delta ----------------------------- */

const DELTA_COLOR: Record<MetricDelta['direction'], string> = {
  up: 'var(--cx-success)',
  down: 'var(--cx-error)',
  flat: 'var(--cx-text-muted)',
}

const DELTA_GLYPH: Record<MetricDelta['direction'], string> = {
  up: '▲',
  down: '▼',
  flat: '—',
}

function DeltaPill({ delta }: { delta: MetricDelta }) {
  const color = DELTA_COLOR[delta.direction]
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color }}>
      <span aria-hidden="true">{DELTA_GLYPH[delta.direction]}</span>
      <span>{formatValue(delta.value)}</span>
      {delta.label && (
        <span className="font-normal" style={{ color: 'var(--cx-text-muted)' }}>
          {delta.label}
        </span>
      )}
    </span>
  )
}

/* --------------------------- Sparkline --------------------------- */

function Sparkline({ values }: { values: number[] }) {
  const data = values.map((value, index) => ({ index, value }))
  return (
    <div className="h-7 w-20" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={getChartColor(0)}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive
            animationDuration={CHART_ANIMATION.duration}
            animationEasing={CHART_ANIMATION.easing}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
