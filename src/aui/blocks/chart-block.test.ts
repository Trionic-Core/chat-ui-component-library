import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChartBlock as ChartBlockType, ChartFieldRef, ChartType, DataRow } from '../aui-types'
import { ChartBlock } from './chart-block'

/* ------------------------------------------------------------------
 * The Chart Legibility Policy, as the block applies it.
 *
 * chart-layout.test.ts proves the arithmetic; this proves the block acts on it
 * — how many rows reach the chart engine, how tall the host is, what the footer
 * admits, and which layout the bars end up in.
 *
 * recharts renders nothing during server rendering, so the primitives are prop
 * recorders (same pattern as chart-axes.test.ts). The Dialog is replaced by a
 * recorder that always renders its children, so one pass covers the inline
 * chart and the expanded one.
 * ----------------------------------------------------------------*/

const { captured, dialogs } = vi.hoisted(() => ({
  captured: [] as { type: string; props: Record<string, unknown> }[],
  dialogs: [] as Record<string, unknown>[],
}))

vi.mock('recharts', async () => {
  const { createElement: h, Fragment } = await import('react')
  const PRIMITIVES = [
    'ResponsiveContainer',
    'BarChart',
    'LineChart',
    'AreaChart',
    'PieChart',
    'ScatterChart',
    'Bar',
    'Line',
    'Area',
    'Pie',
    'Cell',
    'Scatter',
    'XAxis',
    'YAxis',
    'CartesianGrid',
    'Tooltip',
    'Legend',
    'LabelList',
    'ReferenceLine',
  ]
  const SVG_ROOTS = new Set(['BarChart', 'LineChart', 'AreaChart', 'PieChart', 'ScatterChart'])
  const recorder = (type: string) => (props: Record<string, unknown>) => {
    captured.push({ type, props })
    return h(SVG_ROOTS.has(type) ? 'svg' : Fragment, null, (props.children ?? null) as never)
  }
  return Object.fromEntries(PRIMITIVES.map((name) => [name, recorder(name)]))
})

vi.mock('../ui/dialog', async () => {
  const { createElement: h, Fragment } = await import('react')
  return {
    Dialog: (props: Record<string, unknown>) => {
      dialogs.push(props)
      // Always render the children: the expand view is a mounted component, so
      // this covers it in the same pass instead of simulating a click.
      return h(Fragment, null, (props.children ?? null) as never)
    },
  }
})

const NEGATIVE_MARGINS: DataRow[] = Array.from({ length: 62 }, (_, i) => ({
  variant: `Variant #${i + 1} – Red / Extra Large`,
  margin: i === 0 ? -1234567 : -(5000 - i * 80),
}))

/** Realistic revenue: the compact labels are six characters ("409.1K"). */
const MONTHS: DataRow[] = Array.from({ length: 24 }, (_, i) => ({
  month: `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
  revenue: 400000 + i * 9100,
}))

const OUTLETS: DataRow[] = Array.from({ length: 13 }, (_, i) => ({
  outlet: `Outlet ${i + 1}`,
  revenue: (i + 1) * 100,
}))

function block(
  chartType: ChartType,
  data: DataRow[],
  x: ChartFieldRef,
  series: ChartFieldRef[],
  overrides: Partial<ChartBlockType> = {},
): ChartBlockType {
  return { type: 'chart', chart_type: chartType, x, series, data, ...overrides }
}

const RANKING = (measure: Partial<ChartFieldRef> = {}) =>
  block('bar_horizontal', NEGATIVE_MARGINS, { key: 'variant', label: 'Product Variant' }, [
    { key: 'margin', label: 'Gross Margin', ...measure },
  ])

function render(chart: ChartBlockType): string {
  return renderToStaticMarkup(createElement(ChartBlock, { block: chart }))
}

function all(type: string) {
  return captured.filter((entry) => entry.type === type)
}

/**
 * LabelLists belonging to the nth chart.
 *
 * The recorder is a flat list in render order, and one pass renders both the
 * inline chart and the expanded one, so a chart owns everything recorded
 * between its own root and the next.
 */
function labelListsOfChart(index: number): number {
  const roots = captured
    .map((entry, position) => (entry.type === 'BarChart' ? position : -1))
    .filter((position) => position >= 0)
  const start = roots[index]
  const end = roots[index + 1] ?? captured.length
  return captured.slice(start, end).filter((entry) => entry.type === 'LabelList').length
}

/** Visible text, with the markup taken out — what the reader actually reads. */
function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

beforeEach(() => {
  captured.length = 0
  dialogs.length = 0
})

describe('a 62-row ranking, inline', () => {
  it('hands the chart 12 rows and keeps the other 50 for the expand view', () => {
    render(RANKING())
    const charts = all('BarChart')
    expect(charts[0].props.data).toHaveLength(12)
    expect(charts[1].props.data).toHaveLength(62)
  })

  it('sizes the host in pixels from the band count', () => {
    // 12 bands x 28px + 46px of chrome. A percentage height inside an auto
    // parent measures 0 in ResponsiveContainer, so this must be px.
    const html = render(RANKING())
    expect(html).toContain('height:382px')
    expect(html).toContain('data-cxc-shown="12"')
    expect(html).toContain('data-cxc-total="62"')
  })

  it('prints the cut instead of hiding it', () => {
    expect(text(render(RANKING()))).toContain('Showing 12 of 62 · 20 · 50 · All')
  })

  it('names the rows behind the ones it embedded', () => {
    // total_count is a wire contract for a producer that truncates; today it
    // always equals the embedded count, so the suffix must stay off then.
    const capped = { ...RANKING(), total_count: 340 }
    expect(text(render(capped))).toContain('Showing 12 of 62 (340 total) · 20 · 50 · All')

    captured.length = 0
    const exact = { ...RANKING(), total_count: 62 }
    expect(text(render(exact))).toContain('Showing 12 of 62 · 20 · 50 · All')
    expect(text(render(exact))).not.toContain('total)')
  })

  it('still names them when every embedded row is drawn', () => {
    const short = block(
      'bar_horizontal',
      NEGATIVE_MARGINS.slice(0, 9),
      { key: 'variant', label: 'V' },
      [{ key: 'margin', label: 'Margin' }],
      { total_count: 340 },
    )
    const rendered = text(render(short))
    expect(rendered).toContain('Showing 9 of 9 (340 total)')
    // Nothing more to offer: every embedded row is already on screen.
    expect(rendered).toContain('Showing 9 of 9 (340 total)')
    expect(rendered).not.toContain('All')
  })

  it('prints no footer when every row is drawn', () => {
    const short = block('bar_horizontal', NEGATIVE_MARGINS.slice(0, 9), { key: 'variant', label: 'V' }, [
      { key: 'margin', label: 'Margin' },
    ])
    expect(text(render(short))).not.toContain('Showing')
  })

  it('prints every category tick, on an axis sized to the labels', () => {
    render(RANKING())
    const yAxis = all('YAxis')[0].props
    expect(yAxis.type).toBe('category')
    expect(yAxis.interval).toBe(0)
    expect(yAxis.width).toBeGreaterThanOrEqual(72)
    expect(yAxis.width).toBeLessThanOrEqual(240)
  })

  it('keeps every printed label distinguishable', () => {
    // The 2026-08-29 defect: 18 labels all reading "Variant #1...".
    render(RANKING())
    const format = all('YAxis')[0].props.tickFormatter as (value: unknown) => string
    const printed = NEGATIVE_MARGINS.slice(0, 12).map((row) => format(row.variant))
    expect(new Set(printed).size).toBe(12)
  })

  it('carries the full label in a <title> the reader can hover', () => {
    render(RANKING())
    const tick = all('YAxis')[0].props.tick as (props: Record<string, unknown>) => ReactElement
    const html = renderToStaticMarkup(
      tick({
        x: 60,
        y: 40,
        textAnchor: 'end',
        verticalAnchor: 'middle',
        payload: { value: 'Variant #12 – Red / Extra Large' },
      }),
    )
    expect(html).toContain('<title>Variant #12 – Red / Extra Large</title>')
  })

  it('prints the number on every bar', () => {
    // One bar at -1.2M puts the rest under a pixel; a touch device has no
    // hover, so without this the reader gets no figure at all.
    render(RANKING())
    expect(labelListsOfChart(0)).toBe(1)
    expect(all('Bar')[0].props.minPointSize).toBe(2)
  })

  it('anchors a negative value label on the outer end of the bar', () => {
    // recharts hands a negative bar an x at the ZERO baseline and a negative
    // width. Read raw, every label landed on the zero line, on top of the next
    // bar's label. Browser-verified on the harness, 2026-08-29.
    render(RANKING())
    const content = all('LabelList')[0].props.content as (
      props: Record<string, unknown>,
    ) => ReactElement
    const html = renderToStaticMarkup(
      content({ viewBox: { x: 975, y: 0, width: -691, height: 28 }, value: -1234567 }),
    )
    expect(html).toContain('text-anchor="end"')
    // 975 - 691 = the outer end at 284, minus the 6px gap.
    expect(html).toContain('x="278"')
    expect(html).toContain('-1.2M')
  })

  it('anchors a positive value label past the end of the bar', () => {
    render(RANKING())
    const content = all('LabelList')[0].props.content as (
      props: Record<string, unknown>,
    ) => ReactElement
    const html = renderToStaticMarkup(
      content({ viewBox: { x: 100, y: 0, width: 240, height: 28 }, value: 4200 }),
    )
    expect(html).toContain('text-anchor="start"')
    expect(html).toContain('x="346"')
  })

  it('reserves the room the unit takes, not just the number', () => {
    // The label paints "-1.2M ₹" but the reserve used to measure "-1.2M", so
    // the widest bar's number clipped at the plot edge — the very defect the
    // reserve exists to prevent. Both now measure seriesValueLabel().
    render(RANKING())
    const bare = all('BarChart')[0].props.margin as { left: number }

    captured.length = 0
    render(RANKING({ format: 'currency', unit: '₹' }))
    const withUnit = all('BarChart')[0].props.margin as { left: number }

    // All-negative data, so the labels hang to the LEFT and that margin grows.
    // "-1.2M" -> 5 chars = 37px reserve; "-1.2M ₹" -> 7 chars = 49px.
    expect(bare.left).toBe(5 + 37)
    expect(withUnit.left).toBe(5 + 49)
  })

  it('counts the unit when deciding a vertical band can hold a label', () => {
    // 15 months at 600px is a 36.8px band. "409.1K" fits it; "409.1K ₹" does
    // not, so the labels come off rather than printing over each other.
    const rows: DataRow[] = Array.from({ length: 15 }, (_, i) => ({
      month: `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
      revenue: 400000 + i * 9100,
    }))
    const months = (series: { key: string; label: string; format?: 'currency'; unit?: string }) =>
      block('bar', rows, { key: 'month', label: 'Month' }, [series])

    render(months({ key: 'revenue', label: 'Revenue' }))
    expect(labelListsOfChart(0)).toBe(1)

    captured.length = 0
    render(months({ key: 'revenue', label: 'Revenue', format: 'currency', unit: '₹' }))
    expect(labelListsOfChart(0)).toBe(0)
  })

  it('draws no zero line when every value shares a sign', () => {
    render(RANKING())
    expect(all('ReferenceLine')).toHaveLength(0)
  })

  it('reserves the bottom for a negative column\'s label, not the top', () => {
    // A vertical bar's label hangs ABOVE a positive column and BELOW a negative
    // one. The margin used to reserve the top whenever labels were on at all,
    // so a loss column's number had nowhere to go and clipped.
    const losses: DataRow[] = Array.from({ length: 8 }, (_, i) => ({
      month: `${2026}-${String(i + 1).padStart(2, '0')}`,
      revenue: -(400000 + i * 9100),
    }))
    render(block('bar', losses, { key: 'month', label: 'Month' }, [
      { key: 'revenue', label: 'Revenue' },
    ]))
    const margin = all('BarChart')[0].props.margin as Record<string, number>
    expect(margin.bottom).toBeGreaterThan(margin.top)
    expect(margin.top).toBe(5)
  })

  it('reserves the top for a positive column\'s label', () => {
    const gains: DataRow[] = Array.from({ length: 8 }, (_, i) => ({
      month: `${2026}-${String(i + 1).padStart(2, '0')}`,
      revenue: 400000 + i * 9100,
    }))
    render(block('bar', gains, { key: 'month', label: 'Month' }, [
      { key: 'revenue', label: 'Revenue' },
    ]))
    const margin = all('BarChart')[0].props.margin as Record<string, number>
    expect(margin.top).toBeGreaterThan(margin.bottom)
    expect(margin.bottom).toBe(5)
  })

  it('reserves both ends when a vertical chart crosses zero', () => {
    const mixed: DataRow[] = Array.from({ length: 8 }, (_, i) => ({
      month: `${2026}-${String(i + 1).padStart(2, '0')}`,
      revenue: i < 4 ? 400000 + i * 9100 : -(400000 + i * 9100),
    }))
    render(block('bar', mixed, { key: 'month', label: 'Month' }, [
      { key: 'revenue', label: 'Revenue' },
    ]))
    const margin = all('BarChart')[0].props.margin as Record<string, number>
    expect(margin.top).toBeGreaterThan(5)
    expect(margin.bottom).toBeGreaterThan(5)
  })

  it('draws a zero line once the data crosses zero', () => {
    const mixed = NEGATIVE_MARGINS.map((row, i) => (i < 3 ? { ...row, margin: 5000 } : row))
    render(block('bar_horizontal', mixed, { key: 'variant', label: 'Product Variant' }, [
      { key: 'margin', label: 'Gross Margin' },
    ]))
    expect(all('ReferenceLine').length).toBeGreaterThanOrEqual(1)
    expect(all('ReferenceLine')[0].props.x).toBe(0)
  })

  it('derives a title rather than printing the literal "Chart"', () => {
    const html = render(RANKING())
    expect(text(html)).toContain('Gross Margin by Product Variant')
    expect(text(html)).not.toContain('Chart Download CSV')
  })

  it('never leaves the header blank, even with no labels on the wire', () => {
    // deriveTitle has nothing to work with here. A blank header reads as a
    // broken card, and the dialog needs an accessible name either way, so both
    // fall back to the same word.
    const bare = block('bar_horizontal', NEGATIVE_MARGINS, { key: 'variant', label: '' }, [
      { key: 'margin', label: '' },
    ])
    const html = render(bare)
    expect(text(html)).toContain('Chart')
    expect(dialogs[0].title).toBe('Chart')
  })

  it('keeps an agent-supplied title', () => {
    const titled = { ...RANKING(), title: 'Loss-making variants' }
    expect(text(render(titled))).toContain('Loss-making variants')
  })
})

describe('the expand view', () => {
  it('lists every row at a full band in a wide dialog', () => {
    const html = render(RANKING())
    expect(all('BarChart')[1].props.data).toHaveLength(62)
    // 62 x 28 + 46. The dialog body scrolls; the bands stay readable.
    expect(html).toContain('height:1782px')
    expect(dialogs[0].size).toBe('lg')
  })

  it('moves the value axis to the top, where a scrolled reader can see it', () => {
    render(RANKING())
    const valueAxes = all('XAxis')
    expect(valueAxes[0].props.orientation).toBe('bottom')
    expect(valueAxes[1].props.orientation).toBe('top')
  })

  it('stops animating a list longer than the animation budget', () => {
    render(RANKING())
    const bars = all('Bar')
    expect(bars[0].props.isAnimationActive).toBe(true)
    expect(bars[1].props.isAnimationActive).toBe(false)
  })
})

describe('auto-orientation', () => {
  it('flips 13 text categories and shows 12 of them inline', () => {
    const html = render(
      block('bar', OUTLETS, { key: 'outlet', label: 'Outlet' }, [{ key: 'revenue', label: 'Revenue' }]),
    )
    expect(html).toContain('data-cxc-layout="flipped"')
    expect(html).toContain('data-cxc-shown="12"')
    expect(all('BarChart')[0].props.layout).toBe('vertical')
    // 13 rows: no "20" or "50" to offer, only the whole thing.
    expect(text(html)).toContain('Showing 12 of 13 · All')
  })

  it('leaves 24 months upright, complete, and thinned by a fixed stride', () => {
    // Turning time on its side, or dropping half the months, would both be
    // worse than a thinned axis.
    const html = render(
      block('bar', MONTHS, { key: 'month', label: 'Month' }, [{ key: 'revenue', label: 'Revenue' }]),
    )
    expect(html).not.toContain('data-cxc-layout="flipped"')
    expect(html).toContain('data-cxc-shown="24"')
    expect(html).toContain('height:256px')
    expect(all('BarChart')[0].props.layout).toBe('horizontal')
    // A number, so recharts prints exactly every Nth tick rather than choosing
    // its own stride from the already-truncated text.
    expect(all('XAxis')[0].props.interval).toBe(2)
  })

  it('keeps the printed month labels unique and whole', () => {
    // The same bar the ranking is held to: a label that does not identify its
    // mark is not a label. Two years, so a fitter that drops the year digit is
    // caught — "2025-01" and "2026-01" both printed "202…01" before the stride
    // came from the longest label.
    render(block('bar', MONTHS, { key: 'month', label: 'Month' }, [
      { key: 'revenue', label: 'Revenue' },
    ]))
    const axis = all('XAxis')[0].props
    const format = axis.tickFormatter as (value: unknown) => string
    const stride = (axis.interval as number) + 1
    const printed = MONTHS.filter((_, index) => index % stride === 0).map((row) =>
      format(row.month),
    )
    expect(new Set(printed).size).toBe(printed.length)
    for (const label of printed) expect(label).not.toContain('…')
  })

  it('drops the value labels when 24 months cannot hold them', () => {
    // At 600px the bands are 23px and a compact label is 38px wide. The
    // horizontal band rule says yes; the band WIDTH says no, and it wins.
    render(block('bar', MONTHS, { key: 'month', label: 'Month' }, [
      { key: 'revenue', label: 'Revenue' },
    ]))
    expect(labelListsOfChart(0)).toBe(0)
    // The 984px expand view has the room, so there the numbers come back.
    expect(labelListsOfChart(1)).toBe(1)
  })

  it('never slices a chart type whose rows are not bands', () => {
    for (const chartType of ['line', 'area', 'scatter'] as const) {
      captured.length = 0
      const html = render(
        block(chartType, MONTHS, { key: 'month', label: 'Month' }, [
          { key: 'revenue', label: 'Revenue' },
        ]),
      )
      expect(html).toContain('data-cxc-shown="24"')
      expect(text(html)).not.toContain('Showing')
    }
  })
})
