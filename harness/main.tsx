import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AuiView,
  type ChartBlock,
  type DataRow,
  type FileBlock,
  type FileHandler,
  type FileStatus,
  type ViewSpec,
} from '@cypherx/chat-ui'
import '../src/styles/globals.css'

/* ------------------------------------------------------------------
 * Visual harness for the AUI blocks.
 *
 * Charts: the Chart Legibility Policy, each case at the three real chart
 * widths. The chart width is what the policy reads, so the columns are sized
 * so the CHART lands on 324 / 600 / 984 px after the AUI section padding
 * (p-3) and the card padding (p-4).
 *
 * Files: the file card in each state at phone width (360 px) and in the chat
 * column, driven by a fake host adapter with no network.
 * ----------------------------------------------------------------*/

/** AUI section p-3 (12px x 2) plus card p-4 (16px x 2). */
const CHROME_PX = 56

const COLUMNS = [
  { chartWidth: 324, label: '324px — chat widget panel' },
  { chartWidth: 600, label: '600px — chat message column' },
  { chartWidth: 984, label: '984px — expand dialog' },
] as const

/* ----------------------------- The data ---------------------------- */

/**
 * (a) The 2026-08-29 screenshot: a 62-row ranking of negative margins, long
 * variant labels that all share a prefix, and one outlier at -1.2M that puts
 * every other bar under a pixel. Sorted ascending (worst first).
 */
const RANKING_ROWS: DataRow[] = [
  { variant: 'Variant #7 – Red / XL', margin: -1234567 },
  ...Array.from({ length: 61 }, (_, i) => ({
    variant: `Variant #${i + 12} – ${['Red', 'Blue', 'Black', 'Ivory'][i % 4]} / ${['XL', 'S', 'M', 'XXL'][i % 4]}`,
    margin: -(5000 - Math.round((i * 4950) / 60)),
  })),
]

/** (b) 24 months of one positive series — an ordered axis, which never flips. */
const MONTH_ROWS: DataRow[] = Array.from({ length: 24 }, (_, i) => ({
  month: `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
  revenue: 400000 + Math.round(Math.sin(i / 2.4) * 180000) + i * 9000,
  cost: 300000 + Math.round(Math.cos(i / 3.1) * 90000) + i * 4000,
}))

/** (c) 11 slices — three past the cap, so the tail collapses into "Other". */
const SLICE_ROWS: DataRow[] = [
  'Beverages',
  'Snacks',
  'Dairy',
  'Bakery',
  'Frozen',
  'Produce',
  'Household',
  'Personal Care',
  'Pet',
  'Stationery',
  'Seasonal',
].map((category, i) => ({ category, revenue: Math.round(900000 / (i + 1.4)) }))

/** (d) 3 series across 9 text categories — a grouped band, 44px tall. */
const GROUPED_ROWS: DataRow[] = [
  'Andheri West',
  'Bandra Kurla',
  'Colaba Causeway',
  'Dadar East',
  'Goregaon North',
  'Juhu Beach Road',
  'Lower Parel',
  'Powai Central',
  'Thane West',
].map((outlet, i) => ({
  outlet,
  online: 120000 + i * 14000,
  store: 260000 - i * 11000,
  wholesale: 60000 + ((i * 37) % 50) * 1000,
}))

/** (f) scatter — the only chart whose x is a MEASURE, in its own currency. */
const SPEND_ROWS: DataRow[] = Array.from({ length: 40 }, (_, i) => {
  const spend = 40000 + i * 21000 + ((i * 37) % 11) * 4000
  return { spend, revenue: Math.round(spend * (2.4 + Math.sin(i / 3) * 0.6)) }
})

/* ---------------------------- The blocks --------------------------- */

const CASES: { id: string; caption: string; block: ChartBlock }[] = [
  {
    id: 'a-ranking',
    caption:
      '(a) bar_horizontal · 62 rows · one -1.2M outlier · shared-prefix labels · no title · currency ₹',
    block: {
      type: 'chart',
      chart_type: 'bar_horizontal',
      x: { key: 'variant', label: 'Product Variant' },
      series: [{ key: 'margin', label: 'Gross Margin', format: 'currency', unit: '₹' }],
      data: RANKING_ROWS,
      total_count: 62,
    },
  },
  {
    id: 'b-months',
    caption: '(b) bar · 24 months across two years · ordered x values, so never flipped',
    block: {
      type: 'chart',
      chart_type: 'bar',
      title: 'Revenue by month',
      x: { key: 'month', label: 'Month' },
      series: [{ key: 'revenue', label: 'Revenue' }],
      data: MONTH_ROWS,
    },
  },
  {
    id: 'e-line-months',
    caption: '(e) line · the same 24 months x 2 series · the shared category-tick stride',
    block: {
      type: 'chart',
      chart_type: 'line',
      title: 'Revenue and cost by month',
      x: { key: 'month', label: 'Month' },
      series: [
        { key: 'revenue', label: 'Revenue' },
        { key: 'cost', label: 'Cost' },
      ],
      data: MONTH_ROWS,
    },
  },
  {
    id: 'f-scatter',
    caption: '(f) scatter · x is a measure too · currency ₹ on both axes',
    block: {
      type: 'chart',
      chart_type: 'scatter',
      title: 'Revenue against marketing spend',
      x: { key: 'spend', label: 'Marketing Spend', format: 'currency', unit: '₹' },
      series: [{ key: 'revenue', label: 'Revenue', format: 'currency', unit: '₹' }],
      data: SPEND_ROWS,
    },
  },
  {
    id: 'c-donut',
    caption: '(c) donut · 11 slices · the tail collapses into "Other (4 categories)"',
    block: {
      type: 'chart',
      chart_type: 'donut',
      title: 'Revenue share by category',
      x: { key: 'category', label: 'Category' },
      series: [{ key: 'revenue', label: 'Revenue' }],
      data: SLICE_ROWS,
    },
  },
  {
    id: 'd-grouped',
    caption: '(d) bar_grouped · 3 series x 9 text categories · 44px grouped band',
    block: {
      type: 'chart',
      chart_type: 'bar_grouped',
      title: 'Channel revenue by outlet',
      x: { key: 'outlet', label: 'Outlet' },
      series: [
        { key: 'online', label: 'Online' },
        { key: 'store', label: 'Store' },
        { key: 'wholesale', label: 'Wholesale' },
      ],
      data: GROUPED_ROWS,
    },
  },
]

function specFor(id: string, block: ChartBlock | FileBlock): ViewSpec {
  return { surface_id: id, version: '1', blocks: [block] }
}

/* ---------------------------- File cards -------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000
const PAGE_LOADED_AT = Date.now()
/** The live CSV turns ready this long after the page loads. */
const LIVE_CSV_READY_MS = 7_000

function fileBlock(overrides: Partial<FileBlock> & Pick<FileBlock, 'file_id'>): FileBlock {
  return {
    type: 'file',
    file_name: 'Totals-by-region-20260927-1015.csv',
    format: 'csv',
    content_type: 'text/csv; charset=utf-8',
    status: 'ready',
    size_bytes: 482113,
    row_count: 12840,
    truncated: false,
    expires_at: new Date(PAGE_LOADED_AT + 30 * DAY_MS).toISOString(),
    title: 'Totals by region',
    ...overrides,
  }
}

const PREPARING = { status: 'preparing', size_bytes: null, row_count: null } as const

const FILE_CASES: { id: string; caption: string; block: FileBlock }[] = [
  {
    id: 'live-csv',
    caption: 'preparing -> ready: a live CSV (reads every 2 s; ready after 7 s)',
    block: fileBlock({ file_id: 'live-csv', ...PREPARING }),
  },
  {
    id: 'slow-csv',
    caption: 'preparing: a CSV whose job is still running',
    block: fileBlock({ file_id: 'slow-csv', ...PREPARING }),
  },
  {
    id: 'ready-csv',
    caption: 'ready: CSV',
    block: fileBlock({ file_id: 'ready-csv' }),
  },
  {
    id: 'truncated-csv',
    caption: 'ready: CSV stopped at the row limit',
    block: fileBlock({
      file_id: 'truncated-csv',
      size_bytes: 4_300_000,
      row_count: 100_000,
      truncated: true,
    }),
  },
  {
    id: 'ready-pdf',
    caption: 'ready: PDF report',
    block: fileBlock({
      file_id: 'ready-pdf',
      format: 'pdf',
      content_type: 'application/pdf',
      file_name: 'Revenue-review-20260927-1015.pdf',
      title: 'Revenue review',
      size_bytes: 90_112,
      row_count: null,
    }),
  },
  {
    id: 'ready-docx',
    caption: 'ready: DOCX report, no title, a long file name',
    block: fileBlock({
      file_id: 'ready-docx',
      format: 'docx',
      content_type:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      file_name: 'Quarterly-outlet-and-channel-revenue-review-for-the-western-region-20260927-1015.docx',
      title: null,
      size_bytes: 41_984,
      row_count: null,
    }),
  },
  {
    id: 'failed-csv',
    caption: 'failed: the status route sentence',
    block: fileBlock({ file_id: 'failed-csv', ...PREPARING }),
  },
  {
    id: 'expired-csv',
    caption: 'expired: expires_at in the past',
    block: fileBlock({
      file_id: 'expired-csv',
      expires_at: new Date(PAGE_LOADED_AT - DAY_MS).toISOString(),
    }),
  },
  {
    id: 'download-fails',
    caption: 'ready: the download rejects (click it)',
    block: fileBlock({ file_id: 'download-fails' }),
  },
  {
    id: 'download-gone',
    caption: 'ready: the download answers 410 (click it)',
    block: fileBlock({ file_id: 'download-gone' }),
  },
]

const FILE_COLUMNS = [
  { width: 360, label: '360px — phone' },
  { width: 600, label: '600px — chat message column' },
] as const

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function statusFor(block: FileBlock): FileStatus {
  const ready: FileStatus = {
    file_id: block.file_id,
    status: 'ready',
    file_name: block.file_name,
    format: block.format,
    content_type: block.content_type,
    size_bytes: block.size_bytes ?? 482113,
    row_count: block.row_count ?? 12840,
    truncated: block.truncated ?? false,
    expires_at: block.expires_at,
    error_type: null,
    error: null,
  }
  switch (block.file_id) {
    case 'live-csv':
      return Date.now() - PAGE_LOADED_AT < LIVE_CSV_READY_MS
        ? { ...ready, status: 'preparing', size_bytes: null, row_count: null }
        : ready
    case 'slow-csv':
      return { ...ready, status: 'preparing', size_bytes: null, row_count: null }
    case 'failed-csv':
      return {
        ...ready,
        status: 'failed',
        size_bytes: null,
        row_count: null,
        error_type: 'export_busy',
        error: 'The export queue is busy. Try again in a few minutes.',
      }
    default:
      return ready
  }
}

/** The fake host: no network, a short delay, and one scripted answer per file. */
const FAKE_FILES: FileHandler = {
  async status(block) {
    await wait(300)
    return statusFor(block)
  },
  async download(block) {
    await wait(1_200)
    if (block.file_id === 'download-fails') throw new Error('Failed to fetch')
    if (block.file_id === 'download-gone') throw Object.assign(new Error('Gone'), { status: 410 })
  },
}

/* ------------------------------ The page --------------------------- */

/**
 * `?case=a-ranking` renders one case on its own, so a full-page screenshot is
 * exactly that case at the three widths. No filter renders all four.
 */
function selectedCases() {
  const wanted = new URLSearchParams(window.location.search).get('case')
  if (!wanted) return CASES
  return CASES.filter((entry) => entry.id === wanted)
}

/** `?width=600` renders that column alone, for a tight screenshot. */
function selectedColumns() {
  const wanted = Number(new URLSearchParams(window.location.search).get('width'))
  const match = COLUMNS.filter((column) => column.chartWidth === wanted)
  return match.length > 0 ? match : COLUMNS
}

/** `?case=files` renders the file cards alone; a chart case hides them. */
function showFiles() {
  const wanted = new URLSearchParams(window.location.search).get('case')
  return !wanted || wanted === 'files'
}

/** `?width=360` renders that file column alone. */
function selectedFileColumns() {
  const wanted = Number(new URLSearchParams(window.location.search).get('width'))
  const match = FILE_COLUMNS.filter((column) => column.width === wanted)
  return match.length > 0 ? match : FILE_COLUMNS
}

function Harness() {
  const cases = selectedCases()
  const columns = selectedColumns()

  return (
    <main
      style={{
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 40,
        backgroundColor: 'var(--cxc-bg)',
        minHeight: '100vh',
        fontFamily: 'var(--cxc-font-sans)',
      }}
    >
      <header>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--cxc-text)' }}>
          AUI harness — @cypherx/chat-ui 0.9.0
        </h1>
        <p style={{ fontSize: 13, color: 'var(--cxc-text-secondary)' }}>
          Each chart case at the three real chart widths. Column widths include the AUI section and
          card padding, so the chart itself measures 324 / 600 / 984 px. The file cards follow.
        </p>
      </header>

      {cases.map(({ id, caption, block }) => (
        <section key={id} data-harness-case={id}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--cxc-text)', marginBottom: 12 }}>
            {caption}
          </h2>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {columns.map((column) => (
              <div
                key={column.chartWidth}
                data-harness-column={column.chartWidth}
                style={{ width: column.chartWidth + CHROME_PX, flex: '0 0 auto' }}
              >
                <p style={{ fontSize: 11, color: 'var(--cxc-text-muted)', marginBottom: 6 }}>
                  {column.label}
                </p>
                <AuiView spec={specFor(`${id}-${column.chartWidth}`, block)} onSendMessage={noop} />
              </div>
            ))}
          </div>
        </section>
      ))}

      {showFiles() && (
        <section data-harness-case="files">
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--cxc-text)', marginBottom: 12 }}>
            File cards — each state, with a fake host adapter
          </h2>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {selectedFileColumns().map((column) => (
              <div
                key={column.width}
                data-harness-column={column.width}
                style={{
                  width: column.width,
                  flex: '0 0 auto',
                  display: 'grid',
                  // minmax(0, …): a long file name must truncate, not widen the column.
                  gridTemplateColumns: 'minmax(0, 1fr)',
                  gap: 16,
                }}
              >
                <p style={{ fontSize: 11, color: 'var(--cxc-text-muted)' }}>{column.label}</p>
                {FILE_CASES.map(({ id, caption, block }) => (
                  <div key={id}>
                    <p style={{ fontSize: 11, color: 'var(--cxc-text-muted)', marginBottom: 6 }}>
                      {caption}
                    </p>
                    <AuiView
                      spec={specFor(`${id}-${column.width}`, block)}
                      onSendMessage={noop}
                      files={FAKE_FILES}
                    />
                  </div>
                ))}
                <div>
                  <p style={{ fontSize: 11, color: 'var(--cxc-text-muted)', marginBottom: 6 }}>
                    no host adapter: details only, no button, no reads
                  </p>
                  <AuiView
                    spec={specFor(`no-adapter-${column.width}`, fileBlock({ file_id: 'no-adapter' }))}
                    onSendMessage={noop}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

function noop() {}

// `?theme=dark` checks the dark token set.
if (new URLSearchParams(window.location.search).get('theme') === 'dark') {
  document.documentElement.classList.add('dark')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
