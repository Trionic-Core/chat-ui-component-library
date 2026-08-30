/* ------------------------------------------------------------------
 * Category-label fitting — shared by every chart that prints a category axis.
 *
 * Extracted from box-plot-geometry.ts so the box plot and the bar/line/area
 * axes fit their labels the same way. A truncated label is only useful while it
 * still IDENTIFIES its row, so the rules here are about distinguishability, not
 * about saving pixels.
 *
 * Everything is pure except measureCharPx(), which reads the DOM once per font
 * and falls back to the Latin estimate when there is no DOM (SSR, tests).
 * ----------------------------------------------------------------*/

/**
 * Approximate advance width of one character at the axis font size (12px),
 * used wherever a real measurement is unavailable (SSR, node tests).
 *
 * A wrong estimate costs an ellipsis, never the truth: the tick's <title> and
 * the tooltip always carry the full label.
 */
export const CHAR_PX = 6.6

/**
 * Narrowest category label worth printing: about six characters plus air.
 *
 * Set from what a label has to *do*, not from what fits. A three-character
 * budget printed "Ou…" under ten consecutive outlets — ten labels carrying no
 * information at all. Demanding six characters raises the stride instead, so
 * fewer labels print and each one says something.
 */
export const MIN_LABEL_WIDTH = 44

/** Truncate a category label to the band's budget, keeping the start. */
export function fitLabel(label: string, maxChars: number): string {
  if (label.length <= maxChars) return label
  if (maxChars <= 1) return label.slice(0, 1)
  return `${label.slice(0, maxChars - 1)}…`
}

/** Truncate from the middle, keeping both ends. */
export function fitLabelBothEnds(label: string, maxChars: number): string {
  if (label.length <= maxChars) return label
  if (maxChars <= 2) return label.slice(0, Math.max(1, maxChars))
  const keep = maxChars - 1
  const tail = Math.floor(keep / 2)
  return `${label.slice(0, keep - tail)}…${label.slice(label.length - tail)}`
}

export interface CategoryLabelFit {
  labels: string[]
  /**
   * Two different categories still print identically.
   *
   * Neither strategy can invent room: at six characters "2025-01" and "2026-01"
   * collapse whichever end is kept. The honest fix is upstream — give the
   * labels more characters (a wider stride, see verticalCategoryTicks) — so
   * this is reported rather than papered over, and asserted in the tests.
   */
  collided: boolean
}

/**
 * Fit a set of category labels to `maxChars`, keeping them distinguishable.
 *
 * Keeping the start reads best and is what the other charts do, so it is the
 * default. It fails badly on the label shapes real client data is full of —
 * "Outlet Number 1..30", "SKU-00041", "Variant #12 – Red / XL" — where every
 * label shares a prefix and truncation collapses them all to the same string.
 * When that happens the labels stop identifying anything, so the whole set
 * falls back to middle truncation, which keeps the part that actually differs.
 */
export function fitCategoryLabelsReport(labels: string[], maxChars: number): CategoryLabelFit {
  const distinct = new Set(labels).size
  const fromStart = labels.map((label) => fitLabel(label, maxChars))
  if (new Set(fromStart).size === distinct) return { labels: fromStart, collided: false }

  const bothEnds = labels.map((label) => fitLabelBothEnds(label, maxChars))
  return { labels: bothEnds, collided: new Set(bothEnds).size !== distinct }
}

/** As fitCategoryLabelsReport, for callers that only paint the labels. */
export function fitCategoryLabels(labels: string[], maxChars: number): string[] {
  return fitCategoryLabelsReport(labels, maxChars).labels
}

/**
 * Break a label across up to `maxLines` lines of `maxChars`, or refuse.
 *
 * Refusing is the point. Two lines only help when they show the label WHOLE:
 * a wrapped-and-still-truncated label keeps its prefix and loses its tail, so
 * "Product Alpha Series 001" and "… 002" would print identically — exactly the
 * collision fitCategoryLabels() exists to prevent. When this returns null the
 * caller keeps the single fitted line, whose set is guaranteed distinguishable.
 */
export function wrapLabel(label: string, maxChars: number, maxLines = 2): string[] | null {
  if (maxChars < 1 || maxLines < 2) return null
  if (label.length <= maxChars) return null
  if (label.length > maxChars * maxLines) return null

  const lines: string[] = []
  let current = ''
  for (const word of label.split(/\s+/).filter(Boolean)) {
    // One unbreakable word longer than the budget can only be shown truncated,
    // and a truncated wrap is the collision case above — hand it back instead.
    if (word.length > maxChars) return null
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxChars) {
      current = candidate
      continue
    }
    lines.push(current)
    if (lines.length >= maxLines) return null
    current = word
  }
  if (current) lines.push(current)

  return lines.length > 1 && lines.length <= maxLines ? lines : null
}

/* --------------------------- Text measurement --------------------------- */

/** Latin letters plus digits: the alphabet client labels are mostly made of. */
const MEASUREMENT_SAMPLE = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** Matches the axis font in chart-theme.ts (12px, inherited family). */
export const AXIS_FONT = '12px sans-serif'

const measured = new Map<string, number>()

/**
 * Average character width for `font`, measured in the browser.
 *
 * Devanagari, Arabic and CJK run far wider than the Latin estimate, so a fixed
 * 6.6px either clips a Hindi outlet name or wastes a third of a phone-width
 * chart on an English one. Measuring costs one canvas per font for the life of
 * the page; without a DOM (SSR, node tests) the estimate stands.
 */
export function measureCharPx(font: string = AXIS_FONT): number {
  const cached = measured.get(font)
  if (cached !== undefined) return cached

  const width = measureSample(font)
  measured.set(font, width)
  return width
}

function measureSample(font: string): number {
  if (typeof document === 'undefined') return CHAR_PX

  const context = document.createElement('canvas').getContext('2d')
  if (!context) return CHAR_PX

  context.font = font
  const width = context.measureText(MEASUREMENT_SAMPLE).width
  if (!Number.isFinite(width) || width <= 0) return CHAR_PX

  return width / MEASUREMENT_SAMPLE.length
}
