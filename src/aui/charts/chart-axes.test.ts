import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChartBlock, ChartType, DataRow } from '../aui-types'
import { ChartDispatch } from '../chart-dispatch'
import {
  BAR_VALUE_DOMAIN,
  SPARSE_SERIES_POINT_LIMIT,
  chartLegendProps,
  countPlottablePoints,
  formatAxisTick,
  formatTooltipLabel,
  formatTooltipValue,
  seriesDotProp,
} from './chart-helpers'

/* ------------------------------------------------------------------
 * Value axes, number formatting and legend legibility.
 *
 * Line and area imported no YAxis at all, so their numbers were reachable only
 * by hovering — which a touch device cannot do. These are the regression guards.
 *
 * recharts 3 renders nothing during server rendering (its SVG is produced in a
 * layout pass), so asserting on markup would assert nothing. Instead the
 * recharts primitives are replaced with prop recorders: the test then checks
 * exactly what this library hands to the chart engine, which is the part we
 * own and the part that regressed.
 * ----------------------------------------------------------------*/

const { captured } = vi.hoisted(() => ({
  captured: [] as { type: string; props: Record<string, unknown> }[],
}))

vi.mock('recharts', async () => {
  const { createElement: h, Fragment } = await import('react')
  const PRIMITIVES = [
    'ResponsiveContainer',
    'LineChart',
    'AreaChart',
    'BarChart',
    'PieChart',
    'ScatterChart',
    'Line',
    'Area',
    'Bar',
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
  // The chart roots render a real <svg> so SVG-namespaced children (the area
  // chart's <defs><linearGradient>) stay in an SVG context; anything else would
  // emit a React casing warning that came from the mock, not from the library.
  const SVG_ROOTS = new Set(['LineChart', 'AreaChart', 'BarChart', 'PieChart', 'ScatterChart'])
  const recorder = (type: string) => (props: Record<string, unknown>) => {
    captured.push({ type, props })
    return h(SVG_ROOTS.has(type) ? 'svg' : Fragment, null, (props.children ?? null) as never)
  }
  return Object.fromEntries(PRIMITIVES.map((name) => [name, recorder(name)]))
})

const SERIES = [{ key: 'revenue', label: 'Revenue' }]

const MONTHS: DataRow[] = [
  { month: 'Jan', revenue: 1234567 },
  { month: 'Feb', revenue: 2345678 },
  { month: 'Mar', revenue: 3456789 },
]

function block(
  chartType: ChartType,
  data: DataRow[],
  overrides: Partial<ChartBlock> = {},
): ChartBlock {
  return {
    type: 'chart',
    chart_type: chartType,
    x: { key: 'month', label: 'Month' },
    series: SERIES,
    data,
    ...overrides,
  }
}

/** Render through the real dispatcher and return the recorded primitives. */
function render(chart: ChartBlock) {
  renderToStaticMarkup(createElement(ChartDispatch, { block: chart }))
  return captured
}

/** The markup itself, for the refusal paths that never reach recharts. */
function renderHtml(chart: ChartBlock) {
  return renderToStaticMarkup(createElement(ChartDispatch, { block: chart }))
}

function all(type: string) {
  return captured.filter((entry) => entry.type === type)
}

function one(type: string) {
  const matches = all(type)
  expect(matches, `expected exactly one <${type}>`).toHaveLength(1)
  return matches[0].props
}

beforeEach(() => {
  captured.length = 0
})

describe('value axis — reachable without hover', () => {
  it.each(['line', 'area'] as const)('%s renders a numeric y-axis', (chartType) => {
    render(block(chartType, MONTHS))
    const yAxis = one('YAxis')
    expect(yAxis.tickFormatter).toBe(formatAxisTick)
    // "auto" sizes the column to the widest tick: a fixed width either clips
    // "1.2M" or wastes a third of a phone-width chat column on "12".
    expect(yAxis.width).toBe('auto')
  })

  it('vertical bars put the value axis on Y and format its ticks', () => {
    render(block('bar', MONTHS))
    const yAxis = one('YAxis')
    expect(yAxis.type).toBe('number')
    expect(yAxis.tickFormatter).toBe(formatAxisTick)
    expect(one('XAxis').dataKey).toBe('month')
  })

  it('horizontal bars keep the category on Y and the values on X', () => {
    render(block('bar_horizontal', MONTHS))
    expect(one('YAxis').type).toBe('category')
    expect(one('XAxis').type).toBe('number')
    expect(one('XAxis').tickFormatter).toBe(formatAxisTick)
  })

  it.each(['line', 'area', 'bar', 'bar_horizontal', 'pie', 'scatter'] as const)(
    '%s formats its tooltip values through the shared formatter',
    (chartType) => {
      render(block(chartType, MONTHS))
      expect(one('Tooltip').formatter).toBe(formatTooltipValue)
    },
  )
})

describe('formatters route through the shared format.ts', () => {
  it('compacts axis ticks', () => {
    expect(formatAxisTick(1234567)).toBe('1.2M')
    expect(formatAxisTick(1500)).toBe('1.5K')
    expect(formatAxisTick(42)).toBe('42')
  })

  it('groups tooltip values in full', () => {
    expect(formatTooltipValue(1234567)).toBe('1,234,567')
    expect(formatTooltipValue(0.5)).toBe('0.5')
  })

  it('degrades arbitrary client values instead of printing NaN', () => {
    expect(formatAxisTick(null)).toBe('--')
    expect(formatTooltipValue(undefined)).toBe('--')
    expect(formatTooltipValue('n/a')).toBe('n/a')
  })
})

describe('bar value domain — an honest baseline', () => {
  const [lower, upper] = BAR_VALUE_DOMAIN
  const floor = (dataMin: number) => (typeof lower === 'function' ? lower(dataMin) : lower)

  it('anchors at zero for all-positive data', () => {
    expect(floor(120)).toBe(0)
    expect(upper).toBe('auto')
  })

  it('extends below zero rather than clipping negative bars', () => {
    // A plain [0, 'auto'] domain would fix the truncated baseline and introduce
    // a worse bug: a loss/drawdown bar would drop out of the plot entirely.
    expect(floor(-45)).toBe(-45)
  })

  it.each(['bar', 'bar_horizontal'] as const)('%s applies it to the value axis', (chartType) => {
    render(block(chartType, MONTHS))
    const valueAxis = chartType === 'bar' ? one('YAxis') : one('XAxis')
    expect(valueAxis.domain).toBe(BAR_VALUE_DOMAIN)
  })
})

describe('sparse series draw their points', () => {
  it('counts only plottable values', () => {
    const data: DataRow[] = [
      { month: 'Jan', revenue: 1 },
      { month: 'Feb', revenue: null },
      { month: 'Mar', revenue: 'n/a' },
      { month: 'Apr', revenue: '3' },
    ]
    expect(countPlottablePoints(data, 'revenue')).toBe(2)
  })

  it('turns markers on for a single point and off once dense', () => {
    const dense: DataRow[] = Array.from({ length: SPARSE_SERIES_POINT_LIMIT + 1 }, (_, i) => ({
      month: String(i),
      revenue: i,
    }))
    expect(seriesDotProp([{ month: 'Jan', revenue: 5 }], 'revenue')).toMatchObject({ r: 3 })
    expect(seriesDotProp(dense, 'revenue')).toBe(false)
  })

  it.each([
    ['line', 'Line'],
    ['area', 'Area'],
  ] as const)('a single-point %s chart draws a visible marker', (chartType, mark) => {
    // A one-row series draws a zero-length path; with dot={false} the chart
    // renders an empty plot area and the reader sees nothing at all.
    render(block(chartType, [{ month: 'Jan', revenue: 5 }]))
    expect(one(mark).dot).toMatchObject({ r: 3 })
  })

  it.each([
    ['line', 'Line'],
    ['area', 'Area'],
  ] as const)('a dense %s chart stays marker-free', (chartType, mark) => {
    const dense: DataRow[] = Array.from({ length: 24 }, (_, i) => ({
      month: `M${i}`,
      revenue: i * 100,
    }))
    render(block(chartType, dense))
    expect(one(mark).dot).toBe(false)
  })

  it('decides per series, not per chart', () => {
    // A dense chart can still carry a sparse series; the marker belongs to the
    // series that needs it.
    const data: DataRow[] = Array.from({ length: 24 }, (_, i) => ({
      month: `M${i}`,
      dense: i,
      sparse: i === 0 ? 5 : null,
    }))
    render(
      block('line', data, {
        series: [
          { key: 'dense', label: 'Dense' },
          { key: 'sparse', label: 'Sparse' },
        ],
      }),
    )
    const lines = all('Line')
    expect(lines[0].props.dot).toBe(false)
    expect(lines[1].props.dot).toMatchObject({ r: 3 })
  })
})

describe('legend text is legible, not the series colour', () => {
  it('pins the label to the text token and leaves the swatch coloured', () => {
    // recharts' DefaultLegendContent falls back to entry.color for the label
    // when labelStyle carries no colour, so a pale series painted pale text.
    const { labelStyle, wrapperStyle } = chartLegendProps()
    expect(labelStyle.color).toBe('var(--cx-text-secondary)')
    expect(wrapperStyle).not.toHaveProperty('color')
  })

  it.each(['line', 'area', 'bar', 'scatter', 'pie'] as const)(
    '%s hands the legend an explicit label colour',
    (chartType) => {
      render(
        block(chartType, MONTHS, {
          series: [
            { key: 'revenue', label: 'Revenue' },
            { key: 'cost', label: 'Cost' },
          ],
          options: { show_legend: true },
        }),
      )
      expect(one('Legend').labelStyle).toMatchObject({ color: 'var(--cx-text-secondary)' })
    },
  )
})

describe('category axes print a label that identifies its mark', () => {
  const OUTLETS: DataRow[] = Array.from({ length: 24 }, (_, i) => ({
    month: `Region ${i + 1} distribution centre`,
    revenue: i * 100,
  }))

  /** Two years, so a fitter that drops the year digit is caught. */
  const TWO_YEARS: DataRow[] = Array.from({ length: 24 }, (_, i) => ({
    month: `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
    revenue: 400000 + i * 9100,
  }))

  it.each(['line', 'area', 'bar'] as const)('%s thins its ticks on a fixed stride', (chartType) => {
    // A NUMBER, not "equidistantPreserveStart": with the string, recharts chose
    // its own stride by measuring the already-truncated text, so its stride and
    // the label budget disagreed and the budget was the wrong one.
    render(block(chartType, TWO_YEARS))
    const interval = one('XAxis').interval
    expect(typeof interval).toBe('number')
    expect(interval).toBe(2)
  })

  it.each(['line', 'area', 'bar'] as const)(
    '%s keeps two years of months apart on the axis',
    (chartType) => {
      // The defect: at a six-character budget "2025-01" and "2026-01" both
      // printed "202…01". The stride now comes from what the label needs.
      render(block(chartType, TWO_YEARS))
      const axis = one('XAxis')
      const format = axis.tickFormatter as (value: unknown) => string
      const stride = (axis.interval as number) + 1
      const shown = TWO_YEARS.filter((_, index) => index % stride === 0)
      const printed = shown.map((row) => format(row.month))
      expect(new Set(printed).size).toBe(printed.length)
      for (const label of printed) expect(label).not.toContain('…')
    },
  )

  it.each(['line', 'area'] as const)('%s renders the shared tick component', (chartType) => {
    render(block(chartType, TWO_YEARS))
    expect(typeof one('XAxis').tick).toBe('function')
  })

  it.each(['line', 'area', 'bar', 'bar_horizontal'] as const)(
    '%s puts the full category in the tooltip',
    (chartType) => {
      render(block(chartType, MONTHS))
      expect(one('Tooltip').labelFormatter).toBe(formatTooltipLabel)
    },
  )

  it.each([
    ['line', 'Line'],
    ['area', 'Area'],
  ] as const)('%s stops animating past the row budget', (chartType, mark) => {
    render(block(chartType, MONTHS))
    expect(one(mark).isAnimationActive).toBe(true)

    captured.length = 0
    const dense: DataRow[] = Array.from({ length: 40 }, (_, i) => ({ month: `M${i}`, revenue: i }))
    render(block(chartType, dense))
    expect(one(mark).isAnimationActive).toBe(false)
  })

})

describe('pie and donut refuse what a pie cannot say', () => {
  const slices = (count: number): DataRow[] =>
    Array.from({ length: count }, (_, i) => ({ month: `Category ${i + 1}`, revenue: count - i }))

  it('caps the slice count and names the remainder', () => {
    render(block('donut', slices(11)))
    const pie = one('Pie').data as { name: string; value: number }[]
    expect(pie).toHaveLength(8)
    expect(all('Cell')).toHaveLength(8)
    expect(pie[pie.length - 1].name).toBe('Other (4 categories)')
  })

  it('leaves a chart at the cap alone', () => {
    render(block('pie', slices(8)))
    expect(all('Cell')).toHaveLength(8)
  })

  it('refuses negative values instead of drawing a false whole', () => {
    // `Number(v) || 0` used to coerce these into a confident, meaningless pie.
    const html = renderHtml(block('pie', [
      { month: 'Gain', revenue: 40 },
      { month: 'Loss', revenue: -25 },
    ]))
    expect(html).toContain('data-cxc-empty-reason="pie_invalid_values"')
  })

  it('refuses a total of zero, which has no whole to divide', () => {
    const html = renderHtml(block('pie', [
      { month: 'A', revenue: 0 },
      { month: 'B', revenue: 0 },
    ]))
    expect(html).toContain('data-cxc-empty-reason="pie_invalid_values"')
  })

  it('refuses a non-numeric measure rather than plotting it as zero', () => {
    const html = renderHtml(block('pie', [
      { month: 'A', revenue: 'n/a' },
      { month: 'B', revenue: 10 },
    ]))
    expect(html).toContain('data-cxc-empty-reason="pie_invalid_values"')
  })

  it('still treats a blank cell as a missing measurement, not a contradiction', () => {
    render(block('pie', [
      { month: 'A', revenue: null },
      { month: 'B', revenue: 10 },
    ]))
    expect(all('Cell')).toHaveLength(2)
  })
})
