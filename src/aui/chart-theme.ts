// ---------------------------------------------------------------------------
// Recharts Theme Constants — Evil Charts / shadcn-inspired
// Clean, minimal styling: no axis lines, no tick lines, soft grid.
// All colors read cx-* tokens, which the library bridges onto its native
// --cxc-* tokens (see src/styles/globals.css "AUI token bridge").
// ---------------------------------------------------------------------------

/**
 * XAxis props — clean labels, no clutter.
 */
export const CHART_X_AXIS = {
  tickLine: false,
  axisLine: false,
  tickMargin: 10,
  fontSize: 12,
  fontFamily: 'inherit',
  stroke: 'var(--cx-text-muted)',
} as const

/**
 * YAxis props — minimal, or hidden for simple charts.
 */
export const CHART_Y_AXIS = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
  fontSize: 12,
  fontFamily: 'inherit',
  stroke: 'var(--cx-text-muted)',
} as const

/**
 * Cartesian grid — horizontal only, very subtle.
 */
export const CHART_GRID_STYLE = {
  vertical: false,
  stroke: 'var(--cx-border-subtle)',
  strokeDasharray: '3 3',
  strokeOpacity: 0.6,
} as const

/**
 * Tooltip — clean floating card, no cursor highlight.
 */
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--cx-canvas)',
  border: '1px solid var(--cx-border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--cx-text-primary)',
  // Theme-aware depth (flips for light/dark) instead of a fixed light-mode rgba.
  boxShadow: 'var(--cxc-shadow-md)',
} as const

/**
 * Default animation config for chart entrance transitions.
 */
export const CHART_ANIMATION = {
  duration: 800,
  easing: 'ease-out',
} as const

/**
 * Positive first-frame dimensions for ResponsiveContainer.
 *
 * Recharts otherwise starts at -1 × -1 until ResizeObserver runs. That creates
 * a broken first render when a chart mounts inside the animated chat widget or
 * a just-opened history session. The observer replaces these with the real host
 * dimensions immediately afterwards.
 */
export const CHART_INITIAL_DIMENSION = {
  width: 320,
  height: 256,
} as const

/** Positive first-frame dimensions for the compact KPI sparkline host. */
export const SPARKLINE_INITIAL_DIMENSION = {
  width: 80,
  height: 28,
} as const

/**
 * Legend text styles.
 */
export const CHART_LEGEND_STYLE = {
  fontSize: 12,
  color: 'var(--cx-text-secondary)',
} as const
