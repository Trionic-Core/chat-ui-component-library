/* ------------------------------------------------------------------
 * Shared empty state shown when a chart has no renderable data.
 * ----------------------------------------------------------------*/

interface ChartEmptyProps {
  label?: string
}

export function ChartEmpty({ label = 'No data' }: ChartEmptyProps) {
  return (
    <div
      className="flex h-full items-center justify-center text-sm"
      style={{ color: 'var(--cx-text-muted)' }}
      role="status"
      aria-label="No chart data available"
    >
      {label}
    </div>
  )
}
