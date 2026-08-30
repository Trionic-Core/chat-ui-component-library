import { type RefObject, useCallback, useMemo, useRef, useState } from 'react'
import { Card } from '../ui/card'
import { Dialog } from '../ui/dialog'
import { DownloadIcon } from '../ui/icons'
import type { ChartBlock as ChartBlockType } from '../aui-types'
import { ChartDispatch, chartOptionsFor } from '../chart-dispatch'
import {
  BAR_CHART_TYPES,
  DEFAULT_CHART_WIDTH_PX,
  EXPANDED_CHART_WIDTH_PX,
  EXPANDED_VERTICAL_MIN_HEIGHT_PX,
  VERTICAL_CHART_HEIGHT_PX,
  type BarLayoutPlan,
  type ChartRenderMode,
  deriveTitle,
  planBarLayout,
} from '../charts/chart-layout'
import { labelSample } from '../charts/label-fit'
import { useCharPx } from '../hooks/use-char-px'
import { useElementSize } from '../hooks/use-element-size'
import { rowsToCsv, downloadCsv } from '../csv'

/* ------------------------------------------------------------------
 * Chart Block
 *
 * Card-wrapped chart with a title bar, expand-to-fullscreen modal,
 * and CSV export. The chart components own hover tooltips, legends,
 * and animations; this block owns the chrome around them — and the one
 * decision they cannot make for themselves: how much room they get.
 *
 * The block measures its host, asks the legibility policy for a plan, sizes
 * the host in PIXELS from it, and slices the data to match. A percentage
 * height inside an auto-height parent measures 0 in ResponsiveContainer, and
 * a chart that draws 62 categories in 256px is a texture, not an answer.
 * ----------------------------------------------------------------*/

interface ChartBlockProps {
  block: ChartBlockType
}

/** Ask the policy how to draw this block, or null when it is not a bar chart. */
function useBarPlan(
  block: ChartBlockType,
  width: number,
  mode: ChartRenderMode,
  charPx: number,
): BarLayoutPlan | null {
  const options = useMemo(() => chartOptionsFor(block), [block])
  return useMemo(() => {
    if (!BAR_CHART_TYPES.has(block.chart_type)) return null
    return planBarLayout({
      chartType: block.chart_type,
      xValues: block.data.map((row) => row[block.x.key]),
      orientation: options.orientation,
      width,
      mode,
      seriesCount: block.series.length,
      stacked: options.stacked ?? false,
      charPx,
    })
  }, [block, options, width, mode, charPx])
}

/**
 * The two things only a MOUNTED host can answer: how wide the chart is, and
 * how wide its own labels are in the host's own font.
 */
function useHostMetrics(
  ref: RefObject<HTMLDivElement | null>,
  block: ChartBlockType,
  fallbackWidth: number,
): { width: number; charPx: number } {
  const { width } = useElementSize(ref, {
    width: fallbackWidth,
    height: VERTICAL_CHART_HEIGHT_PX,
  })
  const sample = useMemo(
    () => labelSample(block.data.map((row) => String(row[block.x.key] ?? ''))),
    [block.data, block.x.key],
  )
  return { width, charPx: useCharPx(ref, sample) }
}

export function ChartBlock({ block }: ChartBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const { width, charPx } = useHostMetrics(hostRef, block, DEFAULT_CHART_WIDTH_PX)

  const plan = useBarPlan(block, width, 'inline', charPx)

  // Only horizontal bars are sliced. Every other chart type draws one mark per
  // row inside a fixed box, so its legibility does not depend on the row COUNT
  // — and a time axis with a third of its months missing would be a lie.
  const shownRows = plan?.horizontal ? plan.layout.shownRows : block.data.length
  const inlineBlock = useMemo(
    () => (shownRows < block.data.length ? { ...block, data: block.data.slice(0, shownRows) } : block),
    [block, shownRows],
  )

  const total = block.data.length
  const shown = inlineBlock.data.length
  // Rows the query produced, when the producer says that is more than the rows
  // it embedded. Same wording as the table, so the two footers read alike.
  const totalCount = block.total_count ?? total
  const hasMoreThanEmbedded = totalCount > total
  const showViewAll = shown < total
  // One title for the header, the CSV name and the dialog's accessible name.
  // The literal survives only for a block whose wire carries no labels at all;
  // a blank header would be worse, and a dialog needs a name either way.
  const title = (block.title ?? '').trim() || deriveTitle(block.x, block.series) || 'Chart'

  const csvColumns = useMemo(
    () => [{ key: block.x.key, label: block.x.label }, ...block.series.map((s) => ({ key: s.key, label: s.label }))],
    [block.x, block.series],
  )

  const handleExport = useCallback(() => {
    // The export is of the whole block, never of the inline slice.
    downloadCsv(title, rowsToCsv(csvColumns, block.data))
  }, [title, block.data, csvColumns])

  const openExpand = useCallback(() => setExpanded(true), [])
  const closeExpand = useCallback(() => setExpanded(false), [])

  return (
    <Card padding="sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="truncate text-sm font-semibold" style={{ color: 'var(--cx-text-primary)' }}>
          {title}
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

      <div
        ref={hostRef}
        className="w-full min-w-0"
        style={{ height: plan?.horizontal ? plan.layout.hostHeight : VERTICAL_CHART_HEIGHT_PX }}
        data-cxc-shown={shown}
        data-cxc-total={total}
      >
        <ChartDispatch
          block={inlineBlock}
          mode="inline"
          width={width}
          charPx={charPx}
          plan={plan ?? undefined}
        />
      </div>

      {(showViewAll || hasMoreThanEmbedded) && (
        // Every cut is printed. The renderer never drops a row silently, and
        // the wire order is kept — an ORDER BY ranking IS the answer.
        <div
          className="mt-2 flex items-center gap-1.5 text-xs"
          style={{ color: 'var(--cx-text-muted)' }}
        >
          <span>
            Showing {shown} of {total}
            {hasMoreThanEmbedded ? ` (${totalCount.toLocaleString()} total)` : ''}
          </span>
          {showViewAll && (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={openExpand}
                className="font-medium hover:underline focus:outline-none focus-visible:ring-2"
                style={{ color: 'var(--cx-accent)' }}
              >
                View all
              </button>
            </>
          )}
        </div>
      )}

      <Dialog open={expanded} onClose={closeExpand} title={title} size="lg">
        <ExpandedChart block={block} />
      </Dialog>
    </Card>
  )
}

/**
 * The expand view: every row, at a full band, inside a scrolling body.
 *
 * Its own component so it mounts with the dialog — the width hook has to
 * observe an element that exists, and the dialog renders nothing while closed.
 */
function ExpandedChart({ block }: ChartBlockProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const { width, charPx } = useHostMetrics(hostRef, block, EXPANDED_CHART_WIDTH_PX)
  const plan = useBarPlan(block, width, 'expanded', charPx)

  return (
    <div
      ref={hostRef}
      className="w-full min-w-0"
      style={
        plan?.horizontal
          ? { height: plan.layout.hostHeight }
          : // A vertical chart cannot use its rows to earn height, so it takes a
            // share of the viewport with a floor for short laptop screens.
            { height: '60vh', minHeight: EXPANDED_VERTICAL_MIN_HEIGHT_PX }
      }
      data-cxc-shown={block.data.length}
      data-cxc-total={block.data.length}
    >
      <ChartDispatch
        block={block}
        mode="expanded"
        width={width}
        charPx={charPx}
        plan={plan ?? undefined}
      />
    </div>
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
