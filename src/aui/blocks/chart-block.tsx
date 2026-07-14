import { useCallback, useMemo, useState } from 'react'
import { Card } from '../ui/card'
import { Dialog } from '../ui/dialog'
import { DownloadIcon } from '../ui/icons'
import type { ChartBlock as ChartBlockType } from '../aui-types'
import { ChartDispatch } from '../chart-dispatch'
import { rowsToCsv, downloadCsv } from '../csv'

/* ------------------------------------------------------------------
 * Chart Block
 *
 * Card-wrapped chart with a title bar, expand-to-fullscreen modal,
 * and CSV export. The chart components own hover tooltips, legends,
 * and animations; this block owns the chrome around them.
 * ----------------------------------------------------------------*/

interface ChartBlockProps {
  block: ChartBlockType
}

export function ChartBlock({ block }: ChartBlockProps) {
  const [expanded, setExpanded] = useState(false)

  const csvColumns = useMemo(
    () => [{ key: block.x.key, label: block.x.label }, ...block.series.map((s) => ({ key: s.key, label: s.label }))],
    [block.x, block.series],
  )

  const handleExport = useCallback(() => {
    downloadCsv(block.title || 'chart', rowsToCsv(csvColumns, block.data))
  }, [block.title, block.data, csvColumns])

  const openExpand = useCallback(() => setExpanded(true), [])
  const closeExpand = useCallback(() => setExpanded(false), [])

  return (
    <Card padding="sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="truncate text-sm font-semibold" style={{ color: 'var(--cx-text-primary)' }}>
          {block.title || 'Chart'}
        </h4>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="Download CSV" onClick={handleExport}>
            <DownloadIcon />
          </IconButton>
          <IconButton label="Expand chart" onClick={openExpand}>
            <ExpandIcon />
          </IconButton>
        </div>
      </div>

      <div className="h-64 min-h-64 w-full min-w-0">
        <ChartDispatch block={block} />
      </div>

      <Dialog open={expanded} onClose={closeExpand} title={block.title || 'Chart'}>
        <div className="h-[60vh] w-full min-w-0">
          <ChartDispatch block={block} />
        </div>
      </Dialog>
    </Card>
  )
}

/* ----------------------------- Chrome ---------------------------- */

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-md p-1.5 transition-colors hover:bg-[var(--cx-canvas-muted)] focus:outline-none focus-visible:ring-2"
      style={{ color: 'var(--cx-text-muted)' }}
    >
      {children}
    </button>
  )
}

function ExpandIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}
