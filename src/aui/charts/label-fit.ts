import { CHART_AXIS_FONT_SIZE } from '../chart-theme'

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
 * Approximate advance width of one Latin character at the axis font size,
 * used wherever a real measurement is unavailable (SSR, node tests).
 *
 * A wrong estimate costs an ellipsis, never the truth: the tick's <title> and
 * the tooltip always carry the full label.
 */
export const CHAR_PX = 6.6

/** The axis font size these estimates are calibrated against. */
export { CHART_AXIS_FONT_SIZE }

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

/** Latin letters plus digits — the fallback sample when there are no labels. */
const LATIN_SAMPLE = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** Labels taken into a measurement sample. The longest carry the width. */
const SAMPLE_LABEL_COUNT = 5

/** Last-resort font when no element can be read (SSR, tests). */
export const FALLBACK_FONT = `${CHART_AXIS_FONT_SIZE}px sans-serif`

/**
 * The canvas font string for a chart's axis text, read off a mounted element.
 *
 * The family has to come from the DOM: the axis inherits it, and the host app
 * sets --cxc-font-sans to its own brand face. A literal "sans-serif" here
 * measures a font the client never sees.
 */
export function chartAxisFont(element: Element | null | undefined): string {
  if (!element || typeof window === 'undefined' || !window.getComputedStyle) return FALLBACK_FONT

  const family = window.getComputedStyle(element).fontFamily
  if (!family) return FALLBACK_FONT
  return `${CHART_AXIS_FONT_SIZE}px ${family}`
}

/**
 * A measurement sample built from the labels that will actually be drawn.
 *
 * The longest few, because they are the ones that decide whether the axis
 * fits. Measuring a Latin alphabet while painting Devanagari, Arabic or CJK
 * under-counts every label by a factor the fitter then truncates against.
 */
export function labelSample(labels: string[], count: number = SAMPLE_LABEL_COUNT): string {
  const longest = [...labels]
    .filter((label) => label.length > 0)
    .sort((a, b) => b.length - a.length)
    .slice(0, Math.max(1, count))
  return longest.length > 0 ? longest.join('') : LATIN_SAMPLE
}

const measured = new Map<string, number>()

/**
 * Mean character width of `sample` in `font`, measured on a canvas.
 *
 * Both arguments matter and both are memoized: the font because a client's
 * brand face is not the estimate's face, the sample because a script's mean
 * advance is a property of the script, not of the alphabet this library
 * happens to ship. Without a DOM (server rendering, node tests) the Latin
 * estimate stands — a wrong estimate costs an ellipsis, never the truth,
 * since the tick's <title> and the tooltip always carry the full label.
 */
export function measureCharPx(font: string = FALLBACK_FONT, sample: string = LATIN_SAMPLE): number {
  const key = `${font}\u0000${sample}`
  const cached = measured.get(key)
  if (cached !== undefined) return cached

  const width = measureSample(font, sample)
  measured.set(key, width)
  return width
}

/**
 * Drop every measurement taken in `font`.
 *
 * The cache is permanent by design — a font's metrics do not change — with one
 * exception: a measurement taken BEFORE a web font finished loading was taken
 * in the fallback face, and would otherwise be believed for the life of the
 * page. useCharPx calls this once the document reports its fonts ready.
 */
export function invalidateCharPx(font: string): void {
  for (const key of [...measured.keys()]) {
    if (key.startsWith(`${font}\u0000`)) measured.delete(key)
  }
}

function measureSample(font: string, sample: string): number {
  if (typeof document === 'undefined' || sample.length === 0) return CHAR_PX

  const context = document.createElement('canvas').getContext('2d')
  if (!context) return CHAR_PX

  context.font = font
  const width = context.measureText(sample).width
  if (!Number.isFinite(width) || width <= 0) return CHAR_PX

  return width / sample.length
}
