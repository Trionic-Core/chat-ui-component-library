import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChartBlock, ChartFieldRef, ChartType, DataRow } from '../aui-types'
import { ChartDispatch } from '../chart-dispatch'
import {
  BAR_VALUE_DOMAIN,
  SPARSE_SERIES_POINT_LIMIT,
  chartLegendProps,
  countPlottablePoints,
  axisUnitFor,
  formatAxisTick,
  formatSeriesValue,
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

const { captured, motion } = vi.hoisted(() => ({
  captured: [] as { type: string; props: Record<string, unknown> }[],
  // Mutable so one file can render both states of the setting. Defaults off,
  // so every other test in this file sees the ordinary path.
  motion: { reduced: false },
}))

vi.mock('../hooks/use-prefers-reduced-motion', () => ({
  usePrefersReducedMotion: () => motion.reduced,
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

/** The recorded axis tick formatter, as a callable. */
function tick(axis: Record<string, unknown>) {
  return axis.tickFormatter as (value: unknown) => string
}

/** The recorded tooltip value formatter, as a callable. */
function tooltip() {
  return one('Tooltip').formatter as (
    value: unknown,
    name: unknown,
    item?: { dataKey?: unknown },
  ) => string
}

beforeEach(() => {
  captured.length = 0
  motion.reduced = false
})

describe('value axis — reachable without hover', () => {
  it.each(['line', 'area'] as const)('%s renders a numeric y-axis', (chartType) => {
    render(block(chartType, MONTHS))
    const yAxis = one('YAxis')
    expect(tick(yAxis)(1234567)).toBe('1.2M')
    // "auto" sizes the column to the widest tick: a fixed width either clips
    // "1.2M" or wastes a third of a phone-width chat column on "12".
    expect(yAxis.width).toBe('auto')
  })

  it('vertical bars put the value axis on Y and format its ticks', () => {
    render(block('bar', MONTHS))
    const yAxis = one('YAxis')
    expect(yAxis.type).toBe('number')
    expect(tick(yAxis)(1234567)).toBe('1.2M')
    expect(one('XAxis').dataKey).toBe('month')
  })

  it('horizontal bars keep the category on Y and the values on X', () => {
    render(block('bar_horizontal', MONTHS))
    expect(one('YAxis').type).toBe('category')
    expect(one('XAxis').type).toBe('number')
    expect(tick(one('XAxis'))(1234567)).toBe('1.2M')
  })

  it.each(['line', 'area', 'bar', 'bar_horizontal', 'pie', 'scatter'] as const)(
    '%s formats its tooltip values through the shared formatter',
    (chartType) => {
      render(block(chartType, MONTHS))
      expect(tooltip()(1234567, 'Revenue', { dataKey: 'revenue' })).toBe('1,234,567')
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

  it('names the cause when it refuses: a negative share', () => {
    // `Number(v) || 0` used to coerce these into a confident, meaningless pie.
    // The three causes are told apart because the reader can act on the
    // difference — a negative value is a question about the measure, a zero
    // total is a question about the filter.
    const html = renderHtml(block('pie', [
      { month: 'Gain', revenue: 40 },
      { month: 'Loss', revenue: -25 },
    ]))
    expect(html).toContain('data-cxc-empty-reason="pie_negative_values"')
    expect(html).toContain('cannot be negative')
  })

  it('names the cause when it refuses: no whole to divide', () => {
    const html = renderHtml(block('pie', [
      { month: 'A', revenue: 0 },
      { month: 'B', revenue: 0 },
    ]))
    expect(html).toContain('data-cxc-empty-reason="pie_zero_total"')
    expect(html).toContain('add up to zero')
  })

  it('names the cause when it refuses: a value that is not a number', () => {
    const html = renderHtml(block('pie', [
      { month: 'A', revenue: 'n/a' },
      { month: 'B', revenue: 10 },
    ]))
    expect(html).toContain('data-cxc-empty-reason="pie_non_numeric_values"')
    expect(html).toContain('not a number')
  })

  it('gives each cause its own sentence, never a shared one', () => {
    const negative = renderHtml(block('pie', [{ month: 'A', revenue: -1 }]))
    const zero = renderHtml(block('pie', [{ month: 'A', revenue: 0 }]))
    const text = (html: string) => html.replace(/<[^>]*>/g, '')
    expect(text(negative)).not.toBe(text(zero))
  })

  it('still treats a blank cell as a missing measurement, not a contradiction', () => {
    render(block('pie', [
      { month: 'A', revenue: null },
      { month: 'B', revenue: 10 },
    ]))
    expect(all('Cell')).toHaveLength(2)
  })
})

describe('series format and unit reach the axis, the tooltip and the labels', () => {
  const RUPEES = { key: 'revenue', label: 'Revenue', format: 'currency' as const, unit: '₹' }
  const PERCENT = { key: 'revenue', label: 'Margin', format: 'percent' as const }

  it('prints the client unit on the value axis and in the tooltip', () => {
    // The formatter bakes in no locale currency, so the unit is the only thing
    // that carries ₹ / $ / AED. The axis stays compact, the tooltip exact.
    render(block('bar', MONTHS, { series: [RUPEES] }))
    expect(tick(one('YAxis'))(1234567)).toBe('1.2M ₹')
    expect(tooltip()(1234567, 'Revenue', { dataKey: 'revenue' })).toBe('1,234,567 ₹')
  })

  it('prints a percent series with its own symbol and no unit', () => {
    // "12% %" would be the alternative, so percent takes the format and skips
    // the unit on both surfaces.
    render(block('bar', [{ month: 'Jan', revenue: 12 }], { series: [PERCENT] }))
    expect(tick(one('YAxis'))(12)).toBe('12%')
    expect(tooltip()(12, 'Margin', { dataKey: 'revenue' })).toBe('12%')
  })

  it('leaves a shared axis bare when the series disagree on the unit', () => {
    // One axis cannot be in two units: "1.2M ₹" would be a false statement
    // about the other series' bars. The tooltip still speaks per series.
    render(
      block('bar', [{ month: 'Jan', revenue: 1234567, orders: 4210 }], {
        series: [RUPEES, { key: 'orders', label: 'Orders' }],
      }),
    )
    expect(tick(one('YAxis'))(1234567)).toBe('1.2M')
    expect(tooltip()(1234567, 'Revenue', { dataKey: 'revenue' })).toBe('1,234,567 ₹')
    expect(tooltip()(4210, 'Orders', { dataKey: 'orders' })).toBe('4,210')
  })

  it('keeps the unit when every series agrees on it', () => {
    render(
      block('bar', [{ month: 'Jan', revenue: 1234567, cost: 900000 }], {
        series: [RUPEES, { key: 'cost', label: 'Cost', format: 'currency', unit: '₹' }],
      }),
    )
    expect(tick(one('YAxis'))(1234567)).toBe('1.2M ₹')
  })

  it('needs no dataKey when there is only one series to be', () => {
    // recharts hands a pie the slice's "value" key, not the measure's, so a
    // lookup would miss and silently drop the client's unit. With one series
    // there is nothing to disambiguate.
    render(block('bar', MONTHS, { series: [RUPEES] }))
    expect(tooltip()(1234567, 'Revenue', { dataKey: 'value' })).toBe('1,234,567 ₹')
    expect(tooltip()(1234567, 'Revenue')).toBe('1,234,567 ₹')
  })

  it('falls back to the plain formatter when several series leave it ambiguous', () => {
    render(
      block('bar', [{ month: 'Jan', revenue: 1234567, orders: 4210 }], {
        series: [RUPEES, { key: 'orders', label: 'Orders' }],
      }),
    )
    expect(tooltip()(1234567, 'Revenue', { dataKey: 'unknown_key' })).toBe('1,234,567')
  })

  it('gives a pie its single series format and unit', () => {
    render(block('donut', MONTHS, { series: [RUPEES] }))
    expect(tooltip()(1234567, 'Revenue')).toBe('1,234,567 ₹')
  })

  it('gives a box plot the unit only when all five quartiles agree', () => {
    // The five series are one measure seen five ways. A disagreement means the
    // payload is inconsistent, and an axis cannot be in two units.
    const agree = ['q_min', 'q1', 'median', 'q3', 'q_max'].map((key) => ({
      key,
      label: key,
      format: 'currency' as const,
      unit: '₹',
    }))
    expect(axisUnitFor(agree)).toBe('₹')
    expect(axisUnitFor([...agree.slice(0, 4), { key: 'q_max', label: 'q_max', unit: '$' }])).toBe(
      undefined,
    )
  })
})

describe('formatSeriesValue', () => {
  it('is compact for a label and exact for a tooltip', () => {
    const field = { key: 'r', label: 'R', format: 'currency' as const, unit: '₹' }
    expect(formatSeriesValue(1234567, field, { compact: true })).toBe('1.2M ₹')
    expect(formatSeriesValue(1234567, field, { compact: false })).toBe('1,234,567 ₹')
  })

  it('defaults an unformatted series to a grouped number', () => {
    const field = { key: 'r', label: 'R' }
    expect(formatSeriesValue(1234567, field, { compact: false })).toBe('1,234,567')
    expect(formatSeriesValue(1234567, field, { compact: true })).toBe('1.2M')
  })

  it('degrades an unusable value instead of printing NaN', () => {
    const field = { key: 'r', label: 'R', unit: '₹' }
    expect(formatSeriesValue(null, field, { compact: false })).toBe('--')
    expect(formatSeriesValue('n/a', field, { compact: true })).toBe('n/a ₹')
  })
})

describe('formatter factories are built once, not per render', () => {
  // The regression this guards: a factory called inline in JSX allocates on
  // every render (the tooltip one builds a Map) and hands recharts a new
  // function identity each time. Three charts did that while three memoized
  // it. useSeriesFormatters is the one place now — this keeps it that way.
  const CHART_DIR = dirname(fileURLToPath(import.meta.url))
  const CHARTS = [
    'bar-chart.tsx',
    'line-chart.tsx',
    'area-chart.tsx',
    'scatter-chart.tsx',
    'pie-chart.tsx',
    'box-plot-chart.tsx',
  ]

  it.each(CHARTS)('%s builds no formatter inside a formatter prop', (file) => {
    // The exact regression: `tickFormatter={makeAxisTickFormatter(series)}`
    // allocates on every render. Scoped to the four props that take one, so a
    // legitimate factory call elsewhere is not caught by accident.
    const source = readFileSync(join(CHART_DIR, file), 'utf8')
    expect(source).not.toMatch(/\b(tickFormatter|formatter|labelFormatter|tick)=\{[a-zA-Z]+\(/)
  })

  it.each(CHARTS)('%s CALLS the shared hook, not merely imports it', (file) => {
    const source = readFileSync(join(CHART_DIR, file), 'utf8')
    expect(source).toMatch(/useSeriesFormatters\(/)
  })

  it.each(CHARTS)('%s asks shouldAnimate() rather than keeping its own cap', (file) => {
    // The cap was hand-copied into three charts, missing from a fourth, and
    // dead in a fifth. One function, asked by all six.
    const source = readFileSync(join(CHART_DIR, file), 'utf8')
    expect(source).toMatch(/shouldAnimate\(/)
    expect(source).not.toContain('ANIMATION_MAX_ROWS')
  })

  it.each(CHARTS)('%s builds no formatter of its own', (file) => {
    // The box plot kept a private useCallback pair over axisFieldFor until the
    // hook grew a `value` formatter for it. Six charts, one source.
    const source = readFileSync(join(CHART_DIR, file), 'utf8')
    expect(source).not.toMatch(/\bformatSeriesValue\(|\baxisFieldFor\(/)
  })
})

describe('scatter — x is a measure, so it carries its own format and unit', () => {
  const POINTS: DataRow[] = [{ spend: 1234567, revenue: 4567890 }]

  function scatter(x: ChartFieldRef, series: ChartFieldRef[]) {
    render({
      type: 'chart',
      chart_type: 'scatter',
      x,
      series,
      data: POINTS,
    })
  }

  const SPEND = { key: 'spend', label: 'Spend', format: 'currency' as const, unit: '₹' }
  const REVENUE = { key: 'revenue', label: 'Revenue', format: 'currency' as const, unit: '$' }

  it('formats the x axis in x\'s own terms', () => {
    // Every other chart's x is a CATEGORY and takes no unit. A scatter's x is a
    // second measure, and it can be in a different unit from y.
    scatter(SPEND, [REVENUE])
    const axes = all('XAxis')
    expect(tick(axes[0].props)(1234567)).toBe('1.2M ₹')
  })

  it('keeps the y axis in the series\' terms, not x\'s', () => {
    scatter(SPEND, [REVENUE])
    expect(tick(one('YAxis'))(4567890)).toBe('4.6M $')
  })

  it('resolves the tooltip across both axes', () => {
    scatter(SPEND, [REVENUE])
    const format = tooltip()
    expect(format(1234567, 'Spend', { dataKey: 'spend' })).toBe('1,234,567 ₹')
    expect(format(4567890, 'Revenue', { dataKey: 'revenue' })).toBe('4,567,890 $')
  })

  it('leaves a bare x axis bare', () => {
    scatter({ key: 'spend', label: 'Spend' }, [{ key: 'revenue', label: 'Revenue' }])
    expect(tick(all('XAxis')[0].props)(1234567)).toBe('1.2M')
  })
})

describe('reduced motion is an instruction, not a hint', () => {
  /** Each chart type and the primitive that carries its animation flag. */
  const MARKS = [
    ['bar', 'Bar'],
    ['line', 'Line'],
    ['area', 'Area'],
    ['pie', 'Pie'],
    ['scatter', 'Scatter'],
  ] as const

  /** Three rows: far under the animation cap, so only the setting can be why. */
  const SMALL: DataRow[] = [
    { month: 'Jan', revenue: 1 },
    { month: 'Feb', revenue: 2 },
    { month: 'Mar', revenue: 3 },
  ]

  it.each(MARKS)('%s animates when the reader has asked for nothing', (chartType, mark) => {
    motion.reduced = false
    render(block(chartType, SMALL))
    expect(one(mark).isAnimationActive).toBe(true)
  })

  it.each(MARKS)('%s refuses to animate under reduced motion', (chartType, mark) => {
    // For a reader with vestibular sensitivity this is not decoration, it is a
    // symptom trigger — and the entrance carries nothing the static chart does
    // not. Three rows, so the row cap cannot be the reason.
    motion.reduced = true
    render(block(chartType, SMALL))
    expect(one(mark).isAnimationActive).toBe(false)
  })

  it('still refuses on row count alone when the setting is off', () => {
    motion.reduced = false
    const dense: DataRow[] = Array.from({ length: 40 }, (_, i) => ({ month: `M${i}`, revenue: i }))
    render(block('bar', dense))
    expect(one('Bar').isAnimationActive).toBe(false)
  })
})

describe('the animation cap counts MARKS, not rows', () => {
  it.each([
    ['bar', 'Bar'],
    ['line', 'Line'],
    ['area', 'Area'],
  ] as const)('%s counts one mark per row per series', (chartType, mark) => {
    // 12 rows is well under the cap; 12 rows x 3 series is 36 rectangles or
    // three 12-point paths, and it is the marks that cost the first frame.
    const rows: DataRow[] = Array.from({ length: 12 }, (_, i) => ({
      month: `M${i}`,
      revenue: i,
      cost: i,
      units: i,
    }))
    const three = [
      { key: 'revenue', label: 'Revenue' },
      { key: 'cost', label: 'Cost' },
      { key: 'units', label: 'Units' },
    ]

    render(block(chartType, rows))
    expect(all(mark)[0].props.isAnimationActive).toBe(true)

    captured.length = 0
    render(block(chartType, rows, { series: three }))
    expect(all(mark)[0].props.isAnimationActive).toBe(false)
  })
})

describe('pie refusal precedence is fixed, not row order', () => {
  it.each([
    ['the bad number first', [{ month: 'A', revenue: 'n/a' }, { month: 'B', revenue: -5 }]],
    ['the negative first', [{ month: 'A', revenue: -5 }, { month: 'B', revenue: 'n/a' }]],
  ])('reports the non-numeric cell with %s', (_name, rows) => {
    // Row order must not decide the message: the same data re-sorted would
    // otherwise be explained two different ways.
    const html = renderHtml(block('pie', rows as DataRow[]))
    expect(html).toContain('data-cxc-empty-reason="pie_non_numeric_values"')
  })

  it('reports the negative share only once every value is a number', () => {
    const html = renderHtml(block('pie', [
      { month: 'A', revenue: 10 },
      { month: 'B', revenue: -5 },
    ]))
    expect(html).toContain('data-cxc-empty-reason="pie_negative_values"')
  })

  it('reports the empty total only once the values are all usable', () => {
    const html = renderHtml(block('pie', [
      { month: 'A', revenue: 0 },
      { month: 'B', revenue: 0 },
    ]))
    expect(html).toContain('data-cxc-empty-reason="pie_zero_total"')
  })
})
