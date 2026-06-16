// ---------------------------------------------------------------------------
// Chart Data Color Palette — themeable per client.
//
// Series colors are driven by CSS custom properties (--cxc-chart-1 …
// --cxc-chart-N), defined in src/styles/globals.css. A client brands every
// chart simply by overriding those variables — no code changes. SVG
// fill/stroke/stopColor all resolve CSS variables, so returning a `var()`
// reference is safe for every Recharts consumer.
//
// CHART_FALLBACKS are the SAME defaults as globals.css and are emitted as the
// var() fallback, so charts still render with the default palette even if a
// consumer forgets to import the library stylesheet.
// ---------------------------------------------------------------------------

/** Default palette — must stay in sync with the --cxc-chart-* tokens in globals.css. */
export const CHART_FALLBACKS = [
  '#E76E50', // 1 — warm coral / terracotta
  '#2A9D8F', // 2 — teal
  '#E9C46A', // 3 — soft gold
  '#264653', // 4 — dark teal
  '#F4A261', // 5 — sandy orange
  '#7C3AED', // 6 — violet
  '#059669', // 7 — emerald
  '#E11D48', // 8 — rose
] as const

/** Number of palette slots (matches the --cxc-chart-* token count). */
export const CHART_COLOR_COUNT = CHART_FALLBACKS.length

/**
 * Get a themeable color for series `index`, wrapping around the palette.
 * Returns a `var(--cxc-chart-N, <default>)` reference: clients override the
 * token to rebrand; the hex fallback guarantees a color if the stylesheet
 * isn't loaded.
 */
export function getChartColor(index: number): string {
  const slot = ((index % CHART_COLOR_COUNT) + CHART_COLOR_COUNT) % CHART_COLOR_COUNT
  return `var(--cxc-chart-${slot + 1}, ${CHART_FALLBACKS[slot]})`
}
