import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuiView, type ChartBlock, type DataRow, type ViewSpec } from '@cypherx/chat-ui'
import '../src/styles/globals.css'

/* ------------------------------------------------------------------
 * Visual harness for the Chart Legibility Policy.
 *
 * Four cases, each at the three real chart widths. The chart width is what the
 * policy reads, so the columns are sized so the CHART lands on 324 / 600 / 984
 * px after the AUI section padding (p-3) and the card padding (p-4).
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

function specFor(id: string, block: ChartBlock): ViewSpec {
  return { surface_id: id, version: '1', blocks: [block] }
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

function Harness() {
  const cases = selectedCases()

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
          Chart legibility harness — @cypherx/chat-ui 0.8.0
        </h1>
        <p style={{ fontSize: 13, color: 'var(--cxc-text-secondary)' }}>
          Each case at the three real chart widths. Column widths include the AUI section and card
          padding, so the chart itself measures 324 / 600 / 984 px.
        </p>
      </header>

      {cases.map(({ id, caption, block }) => (
        <section key={id} data-harness-case={id}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--cxc-text)', marginBottom: 12 }}>
            {caption}
          </h2>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {COLUMNS.map((column) => (
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
    </main>
  )
}

function noop() {}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
