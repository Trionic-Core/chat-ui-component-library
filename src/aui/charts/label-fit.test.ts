import { describe, expect, it } from 'vitest'
import {
  CHAR_PX,
  MIN_LABEL_WIDTH,
  fitCategoryLabels,
  fitCategoryLabelsReport,
  fitLabel,
  fitLabelBothEnds,
  measureCharPx,
  wrapLabel,
} from './label-fit'

/* ------------------------------------------------------------------
 * Category-label fitting.
 *
 * Moved here from box-plot-geometry.test.ts when the fitter was extracted for
 * the bar chart to share. A fitted label is only worth printing while it still
 * identifies its row, so most of these assert distinguishability, not length.
 * ----------------------------------------------------------------*/

describe('fitLabel', () => {
  it('leaves a short label alone', () => {
    expect(fitLabel('North', 10)).toBe('North')
  })

  it('truncates with an ellipsis inside the budget', () => {
    const fitted = fitLabel('North West Region', 8)
    expect(fitted).toHaveLength(8)
    expect(fitted.endsWith('…')).toBe(true)
  })

  it('degrades to a single character rather than returning nothing', () => {
    expect(fitLabel('North', 1)).toBe('N')
  })
})

describe('fitLabelBothEnds', () => {
  it('keeps the start and the end inside the budget', () => {
    const fitted = fitLabelBothEnds('Outlet Number 30', 6)
    expect(fitted).toHaveLength(6)
    expect(fitted).toBe('Out…30')
  })

  it('leaves a label that already fits alone', () => {
    expect(fitLabelBothEnds('North', 10)).toBe('North')
  })

  it('degrades rather than returning nothing', () => {
    expect(fitLabelBothEnds('North', 2)).toBe('No')
    expect(fitLabelBothEnds('North', 0)).toBe('N')
  })
})

describe('fitCategoryLabels — labels must still identify their box', () => {
  it('keeps the start when that is already distinguishing', () => {
    expect(fitCategoryLabels(['Andheri West', 'Bandra', 'Colaba'], 9)).toEqual([
      'Andheri …',
      'Bandra',
      'Colaba',
    ])
  })

  it('switches to middle truncation when prefixes collide', () => {
    // The real-data failure: "Region 1".."Region 12" all truncate to "Regio…",
    // so six labels print and none of them says which box it belongs to.
    const labels = ['Region 1', 'Region 2', 'Region 12']
    expect(fitCategoryLabels(labels, 6)).toEqual(['Reg… 1', 'Reg… 2', 'Reg…12'])
    expect(new Set(fitCategoryLabels(labels, 6)).size).toBe(3)
  })

  it('preserves genuinely duplicated categories rather than inventing a difference', () => {
    const fitted = fitCategoryLabels(['Region 1', 'Region 1'], 6)
    expect(fitted[0]).toBe(fitted[1])
  })

  it('never exceeds the budget', () => {
    for (const label of fitCategoryLabels(['SKU-000041', 'SKU-000042', 'SKU-000043'], 7)) {
      expect(label.length).toBeLessThanOrEqual(7)
    }
  })
})

describe('fitCategoryLabels — prefix-shared labels stay unique', () => {
  it('keeps 62 variant labels distinguishable at an axis budget', () => {
    // The 2026-08-29 screenshot: every label began "Variant #" and the whole
    // axis printed "Variant #1..." — 18 labels naming nothing.
    const labels = Array.from({ length: 62 }, (_, i) => `Variant #${i + 1} – Red / XL`)
    const fitted = fitCategoryLabels(labels, 20)
    expect(new Set(fitted).size).toBe(labels.length)
    for (const label of fitted) expect(label.length).toBeLessThanOrEqual(20)
  })

  it('keeps SKU codes that differ only in their tail apart', () => {
    const fitted = fitCategoryLabels(['SKU-000041', 'SKU-000042', 'SKU-000043'], 7)
    expect(new Set(fitted).size).toBe(3)
  })
})

describe('fitCategoryLabelsReport — it says when it could not keep them apart', () => {
  it('reports no collision when the budget is enough', () => {
    const report = fitCategoryLabelsReport(['2026-01', '2026-02', '2026-03'], 9)
    expect(report.collided).toBe(false)
    expect(report.labels).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('reports a collision the fallback could not fix', () => {
    // Six characters cannot separate two years of months: keeping the start
    // loses the month, so the set falls back to both ends, whose 3-head/2-tail
    // split at six characters drops the year digit. Neither strategy can
    // invent room, so the caller is told rather than misled — the real fix is
    // a wider stride (verticalCategoryTicks).
    const report = fitCategoryLabelsReport(['2025-01', '2025-02', '2026-01'], 6)
    expect(report.collided).toBe(true)
    expect(report.labels[0]).toBe(report.labels[2])
  })

  it('is quiet about genuinely duplicated categories', () => {
    const report = fitCategoryLabelsReport(['Region 1', 'Region 1'], 6)
    expect(report.collided).toBe(false)
  })
})

describe('wrapLabel — two lines only when they show the whole label', () => {
  it('breaks a label that fits in two lines on a word boundary', () => {
    expect(wrapLabel('Andheri West Outlet', 12)).toEqual(['Andheri West', 'Outlet'])
  })

  it('leaves a label that already fits on one line', () => {
    expect(wrapLabel('Andheri', 12)).toBeNull()
  })

  it('refuses a label too long for the two-line budget', () => {
    // Wrapping this would keep the shared prefix and drop the differing tail —
    // the caller keeps the middle-truncated single line instead.
    expect(wrapLabel('Product Alpha Series Long Name 001', 14)).toBeNull()
  })

  it('refuses a single unbreakable word wider than the budget', () => {
    expect(wrapLabel('Unbreakablewordhere', 10)).toBeNull()
  })

  it('refuses a budget that cannot hold two lines', () => {
    expect(wrapLabel('Andheri West', 12, 1)).toBeNull()
    expect(wrapLabel('Andheri West', 0)).toBeNull()
  })
})

describe('measureCharPx', () => {
  it('falls back to the Latin estimate without a DOM', () => {
    // vitest runs in the node environment: there is no document to measure in,
    // and the estimate is what the SSR render and these tests both use.
    expect(measureCharPx()).toBe(CHAR_PX)
  })

  it('memoizes per font string', () => {
    expect(measureCharPx('11px monospace')).toBe(measureCharPx('11px monospace'))
  })
})

describe('label constants', () => {
  it('keeps a minimum label width the stride math can use', () => {
    expect(MIN_LABEL_WIDTH).toBeGreaterThan(CHAR_PX * 6)
  })
})
