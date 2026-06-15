import { useCallback, useMemo, useState } from 'react'
import { Card } from '../ui/card'
import { Dialog } from '../ui/dialog'
import { Table, Thead, Tbody, Tr, Th, Td } from '../ui/table'
import { cn } from '../../utils/cn'
import type { CellValue, DataRow, TableBlock as TableBlockType, TableColumn } from '../aui-types'
import { formatWithUnit, isNumeric } from '../format'
import { rowsToCsv, downloadCsv } from '../csv'

/* ------------------------------------------------------------------
 * Table Block
 *
 * A sortable, client-paginated table. Click a header to sort; when
 * the result is capped (total_count > shown) a "view all" modal shows
 * every embedded row. Cells format per column.format and numerics
 * right-align. CSV export covers the embedded rows.
 * ----------------------------------------------------------------*/

const DEFAULT_PAGE_SIZE = 10

type SortDirection = 'asc' | 'desc'

interface SortState {
  key: string
  direction: SortDirection
}

interface TableBlockProps {
  block: TableBlockType
}

export function TableBlock({ block }: TableBlockProps) {
  const [sort, setSort] = useState<SortState | null>(null)
  const [page, setPage] = useState(0)
  const [viewAll, setViewAll] = useState(false)

  const pageSize = block.page_size && block.page_size > 0 ? block.page_size : DEFAULT_PAGE_SIZE

  const sortedRows = useMemo(() => sortRows(block.rows, sort), [block.rows, sort])

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const pagedRows = useMemo(
    () => sortedRows.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [sortedRows, safePage, pageSize],
  )

  const toggleSort = useCallback((key: string) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, direction: 'asc' }
      if (prev.direction === 'asc') return { key, direction: 'desc' }
      return null
    })
    setPage(0)
  }, [])

  const handleExport = useCallback(() => {
    downloadCsv(block.title || 'table', rowsToCsv(block.columns, block.rows))
  }, [block.title, block.columns, block.rows])

  const totalCount = block.total_count ?? block.rows.length
  const hasMoreThanEmbedded = totalCount > block.rows.length
  const openViewAll = useCallback(() => setViewAll(true), [])
  const closeViewAll = useCallback(() => setViewAll(false), [])

  if (block.columns.length === 0) return null

  return (
    <Card padding="sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="truncate text-sm font-semibold" style={{ color: 'var(--cx-text-primary)' }}>
          {block.title || 'Results'}
        </h4>
        <button
          type="button"
          onClick={handleExport}
          aria-label="Download CSV"
          title="Download CSV"
          className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--cx-canvas-muted)] focus:outline-none focus-visible:ring-2"
          style={{ color: 'var(--cx-text-muted)' }}
        >
          <DownloadIcon />
        </button>
      </div>

      <DataTable columns={block.columns} rows={pagedRows} sort={sort} onSort={toggleSort} />

      <div className="mt-3 flex items-center justify-between text-xs" style={{ color: 'var(--cx-text-muted)' }}>
        <span>
          Showing {pagedRows.length} of {sortedRows.length}
          {hasMoreThanEmbedded ? ` (${totalCount.toLocaleString()} total)` : ''}
        </span>
        <div className="flex items-center gap-2">
          {pageCount > 1 && (
            <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
          )}
          {block.rows.length > pageSize && (
            <button
              type="button"
              onClick={openViewAll}
              className="font-medium"
              style={{ color: 'var(--cx-accent)' }}
            >
              View all
            </button>
          )}
        </div>
      </div>

      <Dialog open={viewAll} onClose={closeViewAll} title={block.title || 'Results'}>
        <div className="max-h-[60vh] overflow-y-auto">
          <DataTable columns={block.columns} rows={sortedRows} sort={sort} onSort={toggleSort} />
        </div>
        {hasMoreThanEmbedded && (
          <p className="mt-3 text-xs" style={{ color: 'var(--cx-text-muted)' }}>
            Showing the first {block.rows.length.toLocaleString()} of {totalCount.toLocaleString()} rows.
          </p>
        )}
      </Dialog>
    </Card>
  )
}

/* --------------------------- Inner table ------------------------- */

function DataTable({
  columns,
  rows,
  sort,
  onSort,
}: {
  columns: TableColumn[]
  rows: DataRow[]
  sort: SortState | null
  onSort: (key: string) => void
}) {
  return (
    <Table>
      <Thead>
        <Tr>
          {columns.map((col) => (
            <Th key={col.key} className={alignClass(col)}>
              <button
                type="button"
                onClick={() => onSort(col.key)}
                className="inline-flex items-center gap-1 uppercase tracking-wider"
                aria-label={`Sort by ${col.label}`}
              >
                {col.label}
                <SortGlyph active={sort?.key === col.key} direction={sort?.direction} />
              </button>
            </Th>
          ))}
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((row, rowIdx) => (
          <Tr key={rowIdx}>
            {columns.map((col) => (
              <Td key={col.key} className={alignClass(col, row[col.key])}>
                {formatWithUnit(row[col.key] ?? null, col.format, col.unit)}
              </Td>
            ))}
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}

/* ---------------------------- Pagination ------------------------- */

function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number
  pageCount: number
  onChange: (page: number) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, page - 1))}
        disabled={page === 0}
        className="rounded p-1 hover:bg-[var(--cx-canvas-muted)] disabled:opacity-40"
        aria-label="Previous page"
      >
        <ChevronIcon direction="left" />
      </button>
      <span>
        {page + 1} / {pageCount}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(pageCount - 1, page + 1))}
        disabled={page >= pageCount - 1}
        className="rounded p-1 hover:bg-[var(--cx-canvas-muted)] disabled:opacity-40"
        aria-label="Next page"
      >
        <ChevronIcon direction="right" />
      </button>
    </div>
  )
}

/* ------------------------------ Helpers -------------------------- */

/** Right-align an explicit numeric column, or one whose value reads numeric. */
function alignClass(col: TableColumn, value?: CellValue): string {
  const align =
    col.align ??
    (col.format && col.format !== 'raw'
      ? 'right'
      : value !== undefined && isNumeric(value)
        ? 'right'
        : 'left')
  return cn(align === 'right' && 'text-right', align === 'center' && 'text-center')
}

/** Stable sort by a column; numeric when both cells parse as numbers, else string. */
function sortRows(rows: DataRow[], sort: SortState | null): DataRow[] {
  if (!sort) return rows
  const dir = sort.direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = a[sort.key]
    const bv = b[sort.key]
    if (av === null || av === undefined) return 1
    if (bv === null || bv === undefined) return -1
    if (isNumeric(av) && isNumeric(bv)) return (Number(av) - Number(bv)) * dir
    return String(av).localeCompare(String(bv)) * dir
  })
}

function SortGlyph({ active, direction }: { active: boolean; direction?: SortDirection }) {
  if (!active) {
    return (
      <span style={{ color: 'var(--cx-text-muted)', opacity: 0.5 }} aria-hidden="true">
        ↕
      </span>
    )
  }
  return (
    <span style={{ color: 'var(--cx-text-secondary)' }} aria-hidden="true">
      {direction === 'asc' ? '↑' : '↓'}
    </span>
  )
}

function DownloadIcon() {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {direction === 'left' ? (
        <polyline points="15 18 9 12 15 6" />
      ) : (
        <polyline points="9 18 15 12 9 6" />
      )}
    </svg>
  )
}
