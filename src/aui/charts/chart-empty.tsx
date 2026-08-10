/* ------------------------------------------------------------------
 * Shared empty state shown when a chart has no renderable data.
 * ----------------------------------------------------------------*/

interface ChartEmptyProps {
  label?: string
  /**
   * Stable machine-readable cause, emitted as `data-cxc-empty-reason`.
   *
   * The visible label is written for the reader and may be reworded; tests and
   * host-side diagnostics assert on this instead, so a copy edit never silently
   * turns a "we refused to draw this" case into a passing test.
   */
  reason?: string
}

export function ChartEmpty({ label = 'No data', reason }: ChartEmptyProps) {
  return (
    <div
      className="flex h-full items-center justify-center px-3 text-center text-sm"
      style={{ color: 'var(--cx-text-muted)' }}
      role="status"
      aria-label={label}
      data-cxc-empty-reason={reason}
    >
      {label}
    </div>
  )
}
