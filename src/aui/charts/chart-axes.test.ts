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
