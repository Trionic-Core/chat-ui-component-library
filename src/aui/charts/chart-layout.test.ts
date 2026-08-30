import { describe, expect, it } from 'vitest'
import type { DataRow } from '../aui-types'
import {
  ANIMATION_MAX_ROWS,
  AXIS_MAX_WIDTH_RATIO,
  AXIS_MIN_WIDTH_PX,
  BAND_PX,
  CHART_CHROME_PX,
  EQUIDISTANT_INTERVAL,
  GROUPED_BAND_MAX_PX,
  INLINE_MAX_CATEGORIES,
  INLINE_MIN_HEIGHT_PX,
  LABEL_MAX_CHARS,
  MAX_SLICES,
  MIN_VISIBLE_TICKS,
  axisIntervalFor,
  bandHeight,
  categoryLayout,
  collapseSlices,
  deriveTitle,
  hasMixedSigns,
  isOrderedAxis,
  planBarLayout,
  shouldFlipToHorizontal,
  valueLabelAnchor,
  valueLabelReservePx,
  valueSigns,
  verticalCategoryTicks,
  verticalValueLabelsFit,
} from './chart-layout'
import { CHAR_PX, fitCategoryLabelsReport } from './label-fit'

/* ------------------------------------------------------------------
 * The Chart Legibility Policy.
 *
 * These are the numbers the renderer paints with, so they are asserted as
 * numbers rather than as pixels: a node test cannot see a chart, but it can see
 * that 62 categories no longer get a 3px band.
 * ----------------------------------------------------------------*/

/** The three real hosts: the 420px widget, the chat column, the expand dialog. */
const WIDTHS = [324, 600, 984] as const

const single = (rows: number, width: number, mode: 'inline' | 'expanded') =>
  categoryLayout({ rows, width, mode, seriesCount: 1, stacked: false, longestLabelChars: 22 })

describe('host height follows the category count', () => {
  it.each(WIDTHS)('inline never grows past the 12-category cap (width %i)', (width) => {
    // A chat message must not become a page: past the cap the chart shows the
    // first rows in wire order and prints "Showing 12 of 62".
    expect(single(1, width, 'inline').hostHeight).toBe(INLINE_MIN_HEIGHT_PX)
    expect(single(5, width, 'inline').hostHeight).toBe(INLINE_MIN_HEIGHT_PX)
    expect(single(12, width, 'inline').hostHeight).toBe(382)
    expect(single(13, width, 'inline').hostHeight).toBe(382)
    expect(single(62, width, 'inline').hostHeight).toBe(382)
    expect(single(100, width, 'inline').hostHeight).toBe(382)
  })

  it.each(WIDTHS)('expanded fits every row at a full band (width %i)', (width) => {
    // No upper clamp: the dialog body scrolls, and the whole ranking at a
    // readable band is the reason the reader opened it.
    expect(single(1, width, 'expanded').hostHeight).toBe(1 * BAND_PX + CHART_CHROME_PX)
    expect(single(5, width, 'expanded').hostHeight).toBe(186)
    expect(single(12, width, 'expanded').hostHeight).toBe(382)
    expect(single(13, width, 'expanded').hostHeight).toBe(410)
    expect(single(62, width, 'expanded').hostHeight).toBe(1782)
    expect(single(100, width, 'expanded').hostHeight).toBe(2846)
  })

  it('shows every row expanded and at most the cap inline', () => {
    expect(single(62, 600, 'inline').shownRows).toBe(INLINE_MAX_CATEGORIES)
    expect(single(62, 600, 'expanded').shownRows).toBe(62)
    expect(single(4, 600, 'inline').shownRows).toBe(4)
  })

  it('survives a zero-row block without producing a negative height', () => {
    const layout = single(0, 600, 'expanded')
    expect(layout.shownRows).toBe(0)
    expect(layout.hostHeight).toBe(CHART_CHROME_PX)
  })
})

describe('band height', () => {
  it('gives one bar per category the base band', () => {
    expect(bandHeight(1, false)).toBe(BAND_PX)
  })

  it('grows the band with each grouped series', () => {
    expect(bandHeight(2, false)).toBe(36)
    expect(bandHeight(3, false)).toBe(44)
  })

  it('caps the grouped band before a group becomes its own panel', () => {
    expect(bandHeight(5, false)).toBe(GROUPED_BAND_MAX_PX)
    expect(bandHeight(20, false)).toBe(GROUPED_BAND_MAX_PX)
  })

  it('charges nothing for stacking — a stack is still one bar', () => {
    expect(bandHeight(4, true)).toBe(BAND_PX)
  })

  it('sizes a grouped host from the grown band', () => {
    const grouped = categoryLayout({
      rows: 9,
      width: 600,
      mode: 'inline',
      seriesCount: 3,
      stacked: false,
    })
    expect(grouped.bandPx).toBe(44)
    expect(grouped.hostHeight).toBe(9 * 44 + CHART_CHROME_PX)
  })
})

describe('category axis width and label budget', () => {
  it('sizes the axis from the longest label', () => {
    const layout = categoryLayout({
      rows: 12,
      width: 600,
      mode: 'inline',
      seriesCount: 1,
      stacked: false,
      longestLabelChars: 22,
    })
    expect(layout.axisWidth).toBe(Math.round(22 * CHAR_PX + 12))
    expect(layout.axisWidth).toBeGreaterThanOrEqual(AXIS_MIN_WIDTH_PX)
    expect(layout.axisWidth).toBeLessThanOrEqual(AXIS_MAX_WIDTH_RATIO * 600)
  })

  it('never drops below the floor, however short the labels', () => {
    const layout = single(12, 600, 'inline')
    expect(
      categoryLayout({ rows: 12, width: 600, mode: 'inline', seriesCount: 1, stacked: false })
        .axisWidth,
    ).toBe(AXIS_MIN_WIDTH_PX)
    expect(layout.axisWidth).toBeGreaterThanOrEqual(AXIS_MIN_WIDTH_PX)
  })

  it('never eats more than 40% of the chart, however long the labels', () => {
    for (const width of WIDTHS) {
      const layout = categoryLayout({
        rows: 12,
        width,
        mode: 'inline',
        seriesCount: 1,
        stacked: false,
        longestLabelChars: 120,
      })
      expect(layout.axisWidth).toBe(Math.round(AXIS_MAX_WIDTH_RATIO * width))
    }
  })

  it('budgets fewer characters in the widget than in the chat column', () => {
    expect(single(12, 324, 'inline').maxChars).toBe(17)
    expect(single(12, 600, 'inline').maxChars).toBe(LABEL_MAX_CHARS)
    expect(single(12, 984, 'inline').maxChars).toBe(LABEL_MAX_CHARS)
  })

  it('keeps at least one character on an absurdly narrow host', () => {
    expect(single(12, 10, 'inline').maxChars).toBe(1)
  })

})

describe('tick interval', () => {
  it('prints every tick while the band can hold a label', () => {
    expect(axisIntervalFor(BAND_PX)).toBe(0)
    expect(axisIntervalFor(16)).toBe(0)
    expect(single(62, 600, 'inline').interval).toBe(0)
  })

  it('degrades to regular thinning below the band floor', () => {
    // Unreachable through categoryLayout today; this is the guard that a future
    // caller with its own band overlaps nothing.
    expect(axisIntervalFor(12)).toBe(EQUIDISTANT_INTERVAL)
    expect(axisIntervalFor(0)).toBe(EQUIDISTANT_INTERVAL)
  })
})

describe('value labels and animation', () => {
  it('prints the number on the bar once the band and width allow', () => {
    expect(single(12, 600, 'inline').showValueLabels).toBe(true)
    expect(single(62, 984, 'expanded').showValueLabels).toBe(true)
  })

  it('drops the label in the narrow widget, where it has nowhere to go', () => {
    expect(single(12, 324, 'inline').showValueLabels).toBe(false)
    expect(single(12, 360, 'inline').showValueLabels).toBe(true)
  })

  it('refuses a stacked chart, whose segments would print over each other', () => {
    const stacked = categoryLayout({
      rows: 6,
      width: 600,
      mode: 'inline',
      seriesCount: 3,
      stacked: true,
    })
    expect(stacked.showValueLabels).toBe(false)
  })

  it('fits a vertical value label to the band WIDTH, not the band height', () => {
    // 24 months across 552px is a 23px band; "750.6K" is 38px wide, so the
    // labels printed over one another (browser-verified, 2026-08-29).
    expect(verticalValueLabelsFit(552, 24, 6)).toBe(false)
    expect(verticalValueLabelsFit(936, 24, 6)).toBe(true)
    // A grouped chart divides one band between its series.
    expect(verticalValueLabelsFit(936, 24 * 3, 6)).toBe(false)
  })

  it('prints no vertical value label it cannot measure', () => {
    expect(verticalValueLabelsFit(936, 12, 0)).toBe(false)
    expect(verticalValueLabelsFit(936, 0, 6)).toBe(false)
  })

  it('animates a short chart and refuses a long one', () => {
    // 100 rectangles at 800ms delay the first readable frame on a phone.
    expect(single(62, 600, 'inline').animate).toBe(true)
    expect(single(ANIMATION_MAX_ROWS, 600, 'expanded').animate).toBe(true)
    expect(single(ANIMATION_MAX_ROWS + 1, 600, 'expanded').animate).toBe(false)
  })
})

describe('auto-orientation', () => {
  const flip = (over: Partial<Parameters<typeof shouldFlipToHorizontal>[0]> = {}) =>
    shouldFlipToHorizontal({
      chartType: 'bar',
      rows: 5,
      longestLabelChars: 6,
      width: 600,
      ordered: false,
      ...over,
    })

  it('flips past the category cap', () => {
    expect(flip({ rows: 13 })).toBe(true)
    expect(flip({ rows: 12 })).toBe(false)
  })

  it('flips sooner when the labels are long', () => {
    expect(flip({ rows: 8, longestLabelChars: 20 })).toBe(true)
    expect(flip({ rows: 6, longestLabelChars: 20 })).toBe(false)
  })

  it('flips a text axis sooner still in the narrow widget', () => {
    expect(flip({ rows: 8, width: 324 })).toBe(true)
    expect(flip({ rows: 8, width: 600 })).toBe(false)
  })

  it('never flips an ordered axis, however many categories', () => {
    // A monthly bar chart must read left to right; its density problem is
    // solved with tick thinning, not by turning time on its side.
    expect(flip({ rows: 24, ordered: true })).toBe(false)
    expect(flip({ rows: 60, ordered: true, longestLabelChars: 30 })).toBe(false)
  })

  it('only applies to the bar family', () => {
    for (const chartType of ['line', 'area', 'pie', 'scatter', 'box_plot'] as const) {
      expect(flip({ chartType, rows: 40 })).toBe(false)
    }
    expect(flip({ chartType: 'bar_grouped', rows: 13 })).toBe(true)
    expect(flip({ chartType: 'bar_stacked', rows: 13 })).toBe(true)
  })

  it('leaves an already-horizontal chart alone', () => {
    expect(flip({ chartType: 'bar_horizontal', rows: 40 })).toBe(false)
  })
})

describe('isOrderedAxis — judged on the values, never on the column name', () => {
  it.each([
    ['ISO dates', ['2026-01-15', '2026-02-15', '2026-03-15']],
    ['ISO timestamps', ['2026-01-15T09:30:00Z', '2026-01-16T09:30:00Z']],
    ['year-months', ['2026-01', '2026-02', '2026-03']],
    ['years', ['2024', '2025', '2026']],
    ['numbers', [1, 2, 3, 4]],
    ['numeric strings', ['1', '2', '3']],
    ['quarters', ['2026-Q1', '2026-Q2', '2026 Q3']],
    ['quarters first', ['Q1 2026', 'Q2 2026']],
    ['month names with a year', ['Jan 2026', 'Feb 2026', 'March-2026']],
    ['years with a month name', ['2026 Jan', '2026 Feb']],
    ['dates', [new Date('2026-01-15'), new Date('2026-02-15')]],
  ])('accepts %s', (_name, values) => {
    expect(isOrderedAxis(values as unknown[])).toBe(true)
  })

  it.each([
    ['outlet names', ['Andheri West', 'Bandra', 'Colaba']],
    ['variant labels', ['Variant #12 – Red / XL', 'Variant #13 – Blue / S']],
    ['bare month names', ['Jan', 'Feb', 'Mar']],
    ['booleans', [true, false]],
    ['nothing at all', []],
    ['only nulls', [null, undefined, '']],
  ])('rejects %s', (_name, values) => {
    expect(isOrderedAxis(values as unknown[])).toBe(false)
  })

  it('treats bare period labels as text and bare numbers as ordered', () => {
    // "Q1".."Q4" without a year is a text category set: nothing fixes its
    // direction, so a 40-row version of it is free to flip. Store numbers are
    // ordered — 101, 102, 103 must stay in that order.
    expect(isOrderedAxis(['Q1', 'Q2', 'Q3', 'Q4'])).toBe(false)
    expect(isOrderedAxis([101, 102, 103])).toBe(true)
  })

  it('accepts a mostly-date axis and rejects a mostly-text one', () => {
    const dates = Array.from({ length: 8 }, (_, i) => `2026-0${i + 1}-01`)
    expect(isOrderedAxis([...dates, 'Unknown', 'N/A'])).toBe(true)
    expect(isOrderedAxis([...dates.slice(0, 7), 'A', 'B', 'C'])).toBe(false)
  })

  it('ignores blanks when judging the sample', () => {
    expect(isOrderedAxis(['2026-01', null, '2026-02', '', '2026-03'])).toBe(true)
  })
})

describe('value label anchoring', () => {
  it('hangs a positive label off the right end of the bar', () => {
    expect(valueLabelAnchor(1200)).toEqual({ side: 'end', textAnchor: 'start', dx: 6 })
  })

  it('hangs a negative label off the left end, away from the zero line', () => {
    // recharts positions labels relative to the RECTANGLE, so "right" on a
    // negative bar lands on the zero line, over the next bar's label.
    expect(valueLabelAnchor(-1234567)).toEqual({ side: 'start', textAnchor: 'end', dx: -6 })
  })

  it('treats zero as positive', () => {
    expect(valueLabelAnchor(0).side).toBe('end')
  })
})

describe('hasMixedSigns — the zero line only appears when zero is crossed', () => {
  const rows: DataRow[] = [
    { margin: -120, units: 4 },
    { margin: -8, units: 9 },
  ]

  it('is false when every value shares a sign', () => {
    expect(hasMixedSigns(rows, ['margin'])).toBe(false)
    expect(hasMixedSigns(rows, ['units'])).toBe(false)
  })

  it('is true once one series straddles zero', () => {
    expect(hasMixedSigns([...rows, { margin: 40 }], ['margin'])).toBe(true)
  })

  it('is true when two series disagree in sign', () => {
    expect(hasMixedSigns(rows, ['margin', 'units'])).toBe(true)
  })

  it('ignores unusable cells rather than reading them as zero', () => {
    expect(hasMixedSigns([{ margin: -5 }, { margin: null }, { margin: 'n/a' }], ['margin'])).toBe(
      false,
    )
  })
})

describe('valueSigns and the label reserve', () => {
  it('reports each side of zero separately', () => {
    // An all-negative ranking hangs every label to the LEFT, so "mixed" is not
    // the question the margin needs answered.
    expect(valueSigns([{ m: -5 }, { m: -1 }], ['m'])).toEqual({ positive: false, negative: true })
    expect(valueSigns([{ m: 5 }, { m: 0 }], ['m'])).toEqual({ positive: true, negative: false })
    expect(valueSigns([{ m: 5 }, { m: -1 }], ['m'])).toEqual({ positive: true, negative: true })
    expect(valueSigns([], ['m'])).toEqual({ positive: false, negative: false })
  })

  it('reserves room from the text that will print', () => {
    // "-1.2M" is 5 characters at the 11px label font, plus the 6px gap.
    expect(valueLabelReservePx(5)).toBe(37)
    expect(valueLabelReservePx(0)).toBe(0)
  })
})

describe('deriveTitle', () => {
  const x = { key: 'variant', label: 'Product Variant' }

  it('names the measure and the dimension', () => {
    expect(deriveTitle(x, [{ key: 'm', label: 'Gross Margin' }])).toBe(
      'Gross Margin by Product Variant',
    )
  })

  it('joins several measures', () => {
    expect(
      deriveTitle(x, [
        { key: 'a', label: 'Revenue' },
        { key: 'b', label: 'Cost' },
      ]),
    ).toBe('Revenue, Cost by Product Variant')
  })

  it('falls back to whichever half it has', () => {
    expect(deriveTitle(x, [])).toBe('Product Variant')
    expect(deriveTitle({ key: 'x', label: '' }, [{ key: 'm', label: 'Revenue' }])).toBe('Revenue')
  })

  it('returns nothing when the wire carries no labels at all', () => {
    expect(deriveTitle({ key: 'x', label: '' }, [{ key: 'm', label: '  ' }])).toBe('')
  })
})

describe('collapseSlices', () => {
  const slices = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ name: `Cat ${i + 1}`, value: count - i }))

  it('leaves a chart at or under the cap untouched', () => {
    expect(collapseSlices(slices(MAX_SLICES))).toHaveLength(MAX_SLICES)
    expect(collapseSlices(slices(3))).toEqual(slices(3))
  })

  it('keeps the largest slices and names the remainder', () => {
    const collapsed = collapseSlices(slices(11))
    expect(collapsed).toHaveLength(MAX_SLICES)
    expect(collapsed[collapsed.length - 1]).toEqual({ name: 'Other (4 categories)', value: 1 + 2 + 3 + 4 })
  })

  it('keeps the surviving slices in wire order, not in size order', () => {
    const collapsed = collapseSlices(
      [
        { name: 'Small', value: 1 },
        { name: 'Big', value: 100 },
        { name: 'Mid', value: 50 },
        { name: 'Tiny', value: 2 },
      ],
      3,
    )
    expect(collapsed.map((slice) => slice.name)).toEqual(['Big', 'Mid', 'Other (2 categories)'])
    expect(collapsed[2].value).toBe(3)
  })

  it('sums the collapsed tail exactly', () => {
    const rows = slices(20)
    const total = rows.reduce((sum, slice) => sum + slice.value, 0)
    const collapsed = collapseSlices(rows)
    expect(collapsed.reduce((sum, slice) => sum + slice.value, 0)).toBe(total)
  })
})

describe('planBarLayout — one decision the block and the chart share', () => {
  const xValues = (count: number, make: (i: number) => unknown) =>
    Array.from({ length: count }, (_, i) => make(i))

  it('sizes and slices a 62-row ranking inline', () => {
    const plan = planBarLayout({
      chartType: 'bar_horizontal',
      xValues: xValues(62, (i) => `Variant #${i + 1} – Red / XL`),
      orientation: 'vertical',
      width: 600,
      mode: 'inline',
      seriesCount: 1,
      stacked: false,
    })
    expect(plan.horizontal).toBe(true)
    expect(plan.flipped).toBe(false)
    expect(plan.layout.shownRows).toBe(12)
    expect(plan.layout.hostHeight).toBe(382)
    expect(plan.categories[0]).toBe('Variant #1 – Red / XL')
  })

  it('flips 13 text categories and reports it', () => {
    const plan = planBarLayout({
      chartType: 'bar',
      xValues: xValues(13, (i) => `Outlet ${i + 1}`),
      width: 600,
      mode: 'inline',
      seriesCount: 1,
      stacked: false,
    })
    expect(plan.horizontal).toBe(true)
    expect(plan.flipped).toBe(true)
  })

  it('leaves 24 months upright', () => {
    const plan = planBarLayout({
      chartType: 'bar',
      xValues: xValues(24, (i) => `2025-${String((i % 12) + 1).padStart(2, '0')}`),
      width: 600,
      mode: 'inline',
      seriesCount: 1,
      stacked: false,
    })
    expect(plan.horizontal).toBe(false)
    expect(plan.flipped).toBe(false)
  })

  it('stringifies null categories instead of dropping the row', () => {
    const plan = planBarLayout({
      chartType: 'bar',
      xValues: [null, 'Bandra'],
      width: 600,
      mode: 'inline',
      seriesCount: 1,
      stacked: false,
    })
    expect(plan.categories).toEqual(['', 'Bandra'])
  })
})

describe('verticalCategoryTicks — the stride comes from the longest label', () => {
  /** The defect fixture: two years of months, seven characters each. */
  const MONTHS = Array.from({ length: 24 }, (_, i) =>
    `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
  )
  const LONGEST = 7

  /** What the axis actually prints, in the order recharts prints it. */
  function printed(plotWidth: number, labels: string[] = MONTHS) {
    const longestLabelChars = labels.reduce((n, label) => Math.max(n, label.length), 0)
    const ticks = verticalCategoryTicks({ plotWidth, rows: labels.length, longestLabelChars })
    const fit = fitCategoryLabelsReport(labels, ticks.maxChars)
    const shown = labels.filter((_, index) => index % ticks.stride === 0)
    return {
      ...ticks,
      collided: fit.collided,
      labels: shown.map((label) => fit.labels[labels.indexOf(label)]),
    }
  }

  it.each([
    [264, 5],
    [540, 3],
    [924, 2],
  ])('keeps 24 months unique at plot width %i', (plotWidth, stride) => {
    const result = printed(plotWidth)
    expect(result.stride).toBe(stride)
    expect(result.interval).toBe(stride - 1)
    expect(result.collided).toBe(false)
    expect(new Set(result.labels).size).toBe(result.labels.length)
    expect(result.labels.length).toBeGreaterThanOrEqual(MIN_VISIBLE_TICKS)
  })

  it.each([540, 924])('prints them WHOLE at plot width %i', (plotWidth) => {
    const result = printed(plotWidth)
    expect(result.maxChars).toBeGreaterThanOrEqual(LONGEST)
    for (const label of result.labels) expect(label).not.toContain('…')
  })

  it('caps the stride so one long label cannot empty the axis', () => {
    // A 40-character outlier would ask for a stride of 13. The cap holds it to
    // rows / MIN_VISIBLE_TICKS, so that label truncates and the axis still
    // names four places — the documented trade-off.
    const labels = MONTHS.map((label, i) => (i === 0 ? 'Consolidated Head Office Warehouse 01' : label))
    const result = printed(540, labels)
    expect(result.stride).toBe(24 / MIN_VISIBLE_TICKS)
    expect(result.labels.length).toBe(MIN_VISIBLE_TICKS)
    expect(result.labels[0]).toContain('…')
  })

  it('never thins an axis with fewer rows than it must name', () => {
    for (const rows of [1, 2, 3]) {
      const ticks = verticalCategoryTicks({ plotWidth: 60, rows, longestLabelChars: 40 })
      expect(ticks.stride).toBe(1)
      expect(ticks.interval).toBe(0)
    }
  })

  it('never budgets more than the one-line maximum, however wide the band', () => {
    const ticks = verticalCategoryTicks({ plotWidth: 4000, rows: 3, longestLabelChars: 4 })
    expect(ticks.maxChars).toBe(LABEL_MAX_CHARS)
  })

  it('survives a zero-width host without producing a zero stride', () => {
    const ticks = verticalCategoryTicks({ plotWidth: 0, rows: 24, longestLabelChars: 7 })
    expect(ticks.stride).toBeGreaterThanOrEqual(1)
    expect(ticks.maxChars).toBeGreaterThanOrEqual(1)
  })
})
