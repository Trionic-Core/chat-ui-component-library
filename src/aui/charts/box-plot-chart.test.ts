import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ChartBlock, ChartFieldRef, DataRow } from '../aui-types'
import { ChartDispatch } from '../chart-dispatch'
import { BOX_PLOT_KEYS } from './box-plot-geometry'

/* ------------------------------------------------------------------
 * Box-plot rendering, driven through the real dispatcher so the wire
 * enum, the dispatcher and the renderer are all covered by one path.
 *
 * The suite runs without a DOM, so these assert on the static markup:
 * the refusal reasons land in `data-cxc-empty-reason`, which is stable
 * even when the human-facing copy is reworded.
 * ----------------------------------------------------------------*/

function boxRow(category: string, values: [number, number, number, number, number]): DataRow {
  return {
    outlet: category,
    q_min: values[0],
    q1: values[1],
    median: values[2],
    q3: values[3],
    q_max: values[4],
  }
}

function block(overrides: Partial<ChartBlock> = {}): ChartBlock {
  return {
    type: 'chart',
    chart_type: 'box_plot',
    x: { key: 'outlet', label: 'Outlet' },
    series: BOX_PLOT_KEYS.map((key) => ({ key, label: key })),
    data: [boxRow('North', [10, 20, 30, 40, 50]), boxRow('South', [5, 15, 25, 35, 45])],
    ...overrides,
  }
}

function render(chart: ChartBlock): string {
  return renderToStaticMarkup(createElement(ChartDispatch, { block: chart }))
}

describe('box_plot — dispatch', () => {
  it('renders a box plot rather than the unsupported-type fallback', () => {
    const html = render(block())
    expect(html).not.toContain('Unsupported chart type')
    expect(html).toContain('Box plot of')
  })

  it('draws one focusable mark per valid category', () => {
    const html = render(block())
    expect(html.match(/class="cxc-boxplot-mark/g) ?? []).toHaveLength(2)
    expect(html.match(/tabindex="0"/g) ?? []).toHaveLength(2)
  })

  it('states all five numbers for assistive tech, not colour alone', () => {
    const html = render(block())
    expect(html).toContain(
      'Outlet North: minimum 10, lower quartile 20, median 30, upper quartile 40, maximum 50',
    )
  })
})

describe('box_plot — refuses to draw a misleading box', () => {
  it('rejects the whole block when a quartile series is missing', () => {
    const html = render(
      block({ series: [{ key: 'q1', label: 'q1' }, { key: 'median', label: 'median' }] }),
    )
    expect(html).toContain('data-cxc-empty-reason="missing_quartile_series"')
    expect(html).toContain('q_min')
  })

  it('rejects five series whose keys are not the quartile names', () => {
    const html = render(
      block({
        series: ['jan', 'feb', 'mar', 'apr', 'may'].map((key) => ({ key, label: key })),
      }),
    )
    expect(html).toContain('data-cxc-empty-reason="missing_quartile_series"')
  })

  it('draws nothing when every row is non-monotonic', () => {
    const html = render(block({ data: [boxRow('North', [50, 40, 30, 20, 10])] }))
    expect(html).toContain('data-cxc-empty-reason="non_monotonic_quartiles"')
    expect(html).not.toContain('cxc-boxplot-mark')
  })

  it('draws nothing when the quartiles are not numeric', () => {
    const html = render(block({ data: [{ outlet: 'North', q_min: 1, q1: 'n/a', median: 3, q3: 4, q_max: 5 }] }))
    expect(html).toContain('data-cxc-empty-reason="non_numeric_quartiles"')
  })

  it('keeps the valid boxes and discloses the dropped ones', () => {
    const html = render(
      block({
        data: [
          boxRow('North', [10, 20, 30, 40, 50]),
          boxRow('South', [50, 40, 30, 20, 10]),
          boxRow('East', [1, 2, 3, 4, 5]),
        ],
      }),
    )
    expect(html.match(/class="cxc-boxplot-mark/g) ?? []).toHaveLength(2)
    expect(html).toContain('data-cxc-omitted="1"')
    expect(html).toContain('1 category not shown')
  })

  it('reports an empty data set without claiming the data was bad', () => {
    const html = render(block({ data: [] }))
    expect(html).toContain('data-cxc-empty-reason="no_rows"')
  })
})

describe('box_plot — presentation', () => {
  it('formats tooltip-grade numbers through the shared formatter', () => {
    // The aria description is the same formatting path the tooltip uses, and it
    // is the only one reachable without a DOM.
    const html = render(
      block({ data: [boxRow('North', [1000, 2000, 1234567, 2000000, 5000000])] }),
    )
    expect(html).toContain('median 1,234,567')
  })

  it('carries a first-frame size so it never paints at zero', () => {
    const html = render(block())
    expect(html).toContain('width="320"')
    expect(html).toContain('height="256"')
  })

  it('draws the median in the text token, never in the series hue', () => {
    // Encoding the median with the same colour as the box would make it a
    // hue-only distinction; it must read as a rule across the box instead.
    expect(render(block())).toContain('stroke="var(--cx-text-primary)"')
  })
})

describe('box_plot — format and unit across the five quartile series', () => {
  /** The five series, each carrying the same format/unit unless overridden. */
  function quartiles(shared: Partial<ChartFieldRef>, last: Partial<ChartFieldRef> = shared) {
    return BOX_PLOT_KEYS.map((key, index) => ({
      key,
      label: key,
      ...(index === BOX_PLOT_KEYS.length - 1 ? last : shared),
    }))
  }

  /** The value-axis tick labels, which the box plot paints itself. */
  function axisTicks(html: string): string[] {
    return [...html.matchAll(/text-anchor="end"[^>]*>([^<]*)</g)].map((m) => m[1])
  }

  it('prints the client unit on the value axis and in the value readout', () => {
    // The aria description shares printValue with the tooltip rows — it is the
    // only one of the two reachable without a DOM.
    const html = render(block({ series: quartiles({ format: 'currency', unit: '₹' }) }))
    expect(axisTicks(html).every((tick) => tick.endsWith(' ₹'))).toBe(true)
    expect(html).toContain(
      'Outlet North: minimum 10 ₹, lower quartile 20 ₹, median 30 ₹, upper quartile 40 ₹, maximum 50 ₹',
    )
  })

  it('leaves the axis bare when the five series disagree on the unit', () => {
    // One axis cannot be in two units, and five quartiles of ONE measure
    // disagreeing means the payload is inconsistent — so it claims neither.
    const html = render(
      block({
        series: quartiles({ format: 'currency', unit: '₹' }, { format: 'currency', unit: '$' }),
      }),
    )
    expect(axisTicks(html).some((tick) => tick.includes('₹') || tick.includes('$'))).toBe(false)
    expect(html).toContain('minimum 10, lower quartile 20, median 30')
  })

  it('prints a percent measure with its symbol and no unit', () => {
    const html = render(block({ series: quartiles({ format: 'percent' }) }))
    expect(axisTicks(html).every((tick) => tick.endsWith('%'))).toBe(true)
    expect(html).toContain('minimum 10%, lower quartile 20%, median 30%')
  })

  it('renders exactly as before when the series carry neither', () => {
    const html = render(block())
    expect(axisTicks(html).some((tick) => /[₹$%]/.test(tick))).toBe(false)
    expect(html).toContain('minimum 10, lower quartile 20, median 30')
  })
})
