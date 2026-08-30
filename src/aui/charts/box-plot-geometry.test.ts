import { describe, expect, it } from 'vitest'
import type { ChartFieldRef, DataRow } from '../aui-types'
import {
  BOX_PLOT_KEYS,
  MAX_BOX_WIDTH,
  MIN_BOX_WIDTH,
  bandCenter,
  boxPlotDomain,
  computeBoxPlotLayout,
  makeValueScale,
  parseBoxPlotRows,
  resolveBoxPlotSeries,
  valueAxisTicks,
} from './box-plot-geometry'

const field = (key: string): ChartFieldRef => ({ key, label: key })
const FIVE = BOX_PLOT_KEYS.map(field)

/** A well-formed row: q_min <= q1 <= median <= q3 <= q_max. */
function row(category: string, values: [number, number, number, number, number]): DataRow {
  return {
    category,
    q_min: values[0],
    q1: values[1],
    median: values[2],
    q3: values[3],
    q_max: values[4],
  }
}

describe('resolveBoxPlotSeries — matches by key name, not position', () => {
  it('resolves the five fields regardless of array order', () => {
    const shuffled = [field('median'), field('q_max'), field('q1'), field('q_min'), field('q3')]
    const { fields, missing } = resolveBoxPlotSeries(shuffled)

    expect(missing).toEqual([])
    // The point of the contract: a reordered array must still bind each name to
    // its own field, never to whatever happened to sit at that index.
    expect(fields?.q_min.key).toBe('q_min')
    expect(fields?.median.key).toBe('median')
    expect(fields?.q_max.key).toBe('q_max')
  })

  it('reports every missing key rather than binding a wrong one', () => {
    const { fields, missing } = resolveBoxPlotSeries([field('q1'), field('median'), field('q3')])
    expect(fields).toBeNull()
    expect(missing).toEqual(['q_min', 'q_max'])
  })

  it('rejects a five-series block whose keys are not the quartile names', () => {
    const wrong = ['jan', 'feb', 'mar', 'apr', 'may'].map(field)
    expect(resolveBoxPlotSeries(wrong).fields).toBeNull()
    expect(resolveBoxPlotSeries(wrong).missing).toEqual([...BOX_PLOT_KEYS])
  })
})

describe('parseBoxPlotRows — refuses to draw an inconsistent box', () => {
  it('accepts ordered rows, including ties at every boundary', () => {
    const { boxes, omitted, rejection } = parseBoxPlotRows(
      [row('A', [1, 2, 3, 4, 5]), row('B', [7, 7, 7, 7, 7])],
      'category',
    )
    expect(boxes).toHaveLength(2)
    expect(omitted).toBe(0)
    expect(rejection).toBeNull()
    expect(boxes[0]).toMatchObject({ category: 'A', q_min: 1, median: 3, q_max: 5 })
  })

  it('drops a row whose quartiles are out of order', () => {
    // median above q3 — a box drawn from this would put the median line outside
    // its own box and still look like a distribution.
    const { boxes, omitted, rejection } = parseBoxPlotRows([row('A', [1, 2, 9, 4, 5])], 'category')
    expect(boxes).toEqual([])
    expect(omitted).toBe(1)
    expect(rejection).toBe('non_monotonic_quartiles')
  })

  it.each([
    ['inverted whiskers', [9, 2, 3, 4, 5]],
    ['q1 above q3', [1, 8, 3, 4, 9]],
    ['q_max below q3', [1, 2, 3, 4, 3]],
  ] as const)('drops %s', (_name, values) => {
    const parsed = parseBoxPlotRows(
      [row('A', values as unknown as [number, number, number, number, number])],
      'category',
    )
    expect(parsed.boxes).toEqual([])
    expect(parsed.rejection).toBe('non_monotonic_quartiles')
  })

  it.each(BOX_PLOT_KEYS)('drops a row missing %s', (key) => {
    const incomplete = row('A', [1, 2, 3, 4, 5])
    delete incomplete[key]
    const parsed = parseBoxPlotRows([incomplete], 'category')
    expect(parsed.boxes).toEqual([])
    expect(parsed.rejection).toBe('non_numeric_quartiles')
  })

  it.each([
    ['a null', null],
    ['a non-numeric string', 'n/a'],
    ['an empty string', ''],
  ] as const)('drops a row whose median is %s', (_name, value) => {
    const bad = { ...row('A', [1, 2, 3, 4, 5]), median: value }
    const parsed = parseBoxPlotRows([bad], 'category')
    expect(parsed.boxes).toEqual([])
    expect(parsed.rejection).toBe('non_numeric_quartiles')
  })

  it('accepts numeric strings, which the wire allows', () => {
    const stringy: DataRow = {
      category: 'A',
      q_min: '1',
      q1: '2',
      median: '3',
      q3: '4',
      q_max: '5',
    }
    expect(parseBoxPlotRows([stringy], 'category').boxes[0]).toMatchObject({ q_min: 1, q_max: 5 })
  })

  it('keeps the valid rows and counts the dropped ones', () => {
    const { boxes, omitted, rejection } = parseBoxPlotRows(
      [row('A', [1, 2, 3, 4, 5]), row('B', [5, 4, 3, 2, 1]), row('C', [0, 1, 2, 3, 4])],
      'category',
    )
    expect(boxes.map((b) => b.category)).toEqual(['A', 'C'])
    expect(omitted).toBe(1)
    expect(rejection).toBe('non_monotonic_quartiles')
  })

  it('reports an empty data set distinctly from a rejected one', () => {
    expect(parseBoxPlotRows([], 'category').rejection).toBe('no_rows')
  })

  it('stringifies a missing category label instead of throwing', () => {
    const noLabel = { ...row('A', [1, 2, 3, 4, 5]) }
    delete noLabel.category
    expect(parseBoxPlotRows([noLabel], 'category').boxes[0].category).toBe('')
  })
})

describe('boxPlotDomain', () => {
  it('spans the extreme whiskers with padding, not the quartiles', () => {
    const { boxes } = parseBoxPlotRows(
      [row('A', [10, 20, 30, 40, 50]), row('B', [5, 6, 7, 8, 9])],
      'category',
    )
    const [min, max] = boxPlotDomain(boxes)
    expect(min).toBeLessThan(5)
    expect(max).toBeGreaterThan(50)
  })

  it('is not forced to zero — a distribution is compared by shape', () => {
    const { boxes } = parseBoxPlotRows([row('A', [100, 110, 120, 130, 140])], 'category')
    expect(boxPlotDomain(boxes)[0]).toBeGreaterThan(0)
  })

  it('opens a window when every value is identical', () => {
    const { boxes } = parseBoxPlotRows([row('A', [7, 7, 7, 7, 7])], 'category')
    const [min, max] = boxPlotDomain(boxes)
    expect(max).toBeGreaterThan(min)
  })
})

describe('valueAxisTicks', () => {
  it('produces round, ascending, in-range values', () => {
    const ticks = valueAxisTicks([0, 100])
    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b))
    expect(ticks[0]).toBeGreaterThanOrEqual(0)
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(100)
  })

  it('does not leak floating-point noise into tick labels', () => {
    for (const tick of valueAxisTicks([0, 1])) {
      expect(String(tick)).not.toMatch(/\d{8,}/)
    }
  })

  it('terminates on a degenerate domain', () => {
    expect(valueAxisTicks([5, 5])).toEqual([5])
  })
})

describe('makeValueScale', () => {
  it('inverts the domain so larger values sit higher', () => {
    const scale = makeValueScale([0, 100], 10, 200)
    expect(scale(100)).toBe(10)
    expect(scale(0)).toBe(210)
    expect(scale(50)).toBeCloseTo(110)
  })

  it('centres a zero-width domain instead of dividing by zero', () => {
    expect(makeValueScale([5, 5], 10, 200)(5)).toBe(110)
  })
})

describe('computeBoxPlotLayout — readable at phone width', () => {
  const NARROW = 360

  it('keeps the box inside the sane width band at 360px', () => {
    for (const count of [1, 3, 8, 20, 60]) {
      const layout = computeBoxPlotLayout(NARROW, 256, count, ['1.2M'])
      expect(layout.boxWidth).toBeGreaterThanOrEqual(MIN_BOX_WIDTH)
      expect(layout.boxWidth).toBeLessThanOrEqual(MAX_BOX_WIDTH)
    }
  })

  it('keeps boxes inside the plot area', () => {
    const count = 7
    const layout = computeBoxPlotLayout(NARROW, 256, count, ['1.2M'])
    const firstLeft = bandCenter(layout, 0) - layout.boxWidth / 2
    const lastRight = bandCenter(layout, count - 1) + layout.boxWidth / 2
    expect(firstLeft).toBeGreaterThanOrEqual(layout.plotLeft)
    expect(lastRight).toBeLessThanOrEqual(layout.plotLeft + layout.plotWidth + 0.001)
  })

  it('sizes the value-axis column to the widest tick label', () => {
    const narrowTicks = computeBoxPlotLayout(NARROW, 256, 4, ['12'])
    const wideTicks = computeBoxPlotLayout(NARROW, 256, 4, ['1,234,567'])
    expect(wideTicks.plotLeft).toBeGreaterThan(narrowTicks.plotLeft)
  })

  it('never lets the axis column eat the plot', () => {
    const layout = computeBoxPlotLayout(NARROW, 256, 4, ['x'.repeat(200)])
    expect(layout.plotWidth).toBeGreaterThan(0)
    expect(layout.plotLeft).toBeLessThanOrEqual(NARROW * 0.4)
  })

  it('prints every label while they still fit', () => {
    expect(computeBoxPlotLayout(NARROW, 256, 4, ['12']).labelStride).toBe(1)
  })

  it('thins dense labels out instead of colliding them', () => {
    // 40 categories across ~340px is ~8px per band; printing all of them would
    // overlap every label into a smear.
    const dense = computeBoxPlotLayout(NARROW, 256, 40, ['12'])
    expect(dense.labelStride).toBeGreaterThan(1)
    expect(dense.bandWidth * dense.labelStride).toBeGreaterThanOrEqual(44)
  })

  it('keeps a printed label long enough to identify a category', () => {
    // The failure this guards: a budget of two or three characters printed
    // "Ou…" under ten consecutive outlets — labels that distinguish nothing.
    for (const count of [4, 12, 30, 60, 200]) {
      expect(computeBoxPlotLayout(NARROW, 256, count, ['12']).labelMaxChars).toBeGreaterThanOrEqual(
        6,
      )
    }
  })

  it('survives a zero-sized host without producing NaN', () => {
    const layout = computeBoxPlotLayout(0, 0, 3, ['12'])
    for (const value of Object.values(layout)) {
      expect(Number.isFinite(value)).toBe(true)
    }
    expect(layout.plotWidth).toBe(0)
  })
})
