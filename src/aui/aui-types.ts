/* ------------------------------------------------------------------
 * AUI (Agentic UI) types — the EMITTED ViewSpec contract.
 *
 * Mirrors the Pydantic models the agent's render_ui_view tool emits
 * and the ui_block SSE event carries (see DESIGN_AGENTIC_UI.md §1).
 * The frontend-facing block embeds the already-resolved, policy-filtered
 * data — there are no result_id refs on the wire by the time these reach
 * the client.
 *
 * Each block is discriminated by `type`. The runtime guards at the
 * bottom are the third reliability layer (after agent constraint and
 * server validation): a malformed block is skipped client-side rather
 * than crashing the message.
 * ----------------------------------------------------------------*/

/** Display/format hint shared by metrics and table columns. */
export type ValueFormat = 'number' | 'currency' | 'percent' | 'compact' | 'raw'

/**
 * Closed chart-type enum (mirrors the backend ChartSpec).
 *
 * `box_plot` compares the distribution of one measure across categories: `x` is
 * the category and `series` carries exactly the five keys q_min / q1 / median /
 * q3 / q_max, matched BY NAME rather than by position.
 */
export type ChartType =
  | 'bar'
  | 'bar_horizontal'
  | 'bar_grouped'
  | 'bar_stacked'
  | 'line'
  | 'area'
  | 'area_stacked'
  | 'pie'
  | 'donut'
  | 'scatter'
  | 'box_plot'

/** A scalar cell value as it travels on the wire. */
export type CellValue = string | number | null

/** A data row keyed by field name. */
export type DataRow = Record<string, CellValue>

/* ----------------------------- Metric ---------------------------- */

export interface MetricDelta {
  // Scalar wire value — matches the backend CellValue (a resolved cell can be
  // null when the source value is missing); renderers degrade null to '--'.
  value: CellValue
  direction: 'up' | 'down' | 'flat'
  label?: string
}

export interface Metric {
  id: string
  label: string
  // Scalar wire value — matches the backend CellValue (null when the resolved
  // result cell is missing); the metric card formats null as '--'.
  value: CellValue
  unit?: string
  format?: ValueFormat
  delta?: MetricDelta
  spark?: number[]
}

export interface MetricGroupBlock {
  type: 'metric_group'
  metrics: Metric[]
}

/* ------------------------------ Chart ---------------------------- */

export interface ChartFieldRef {
  key: string
  label: string
  // The same format/unit pair TableColumn carries, so one measure renders
  // identically in a KPI card, a table cell and a chart. Meaningful on a
  // SERIES; the x axis never carries them — the builder does not write them
  // there, and the renderer ignores them if a producer ever does.
  format?: ValueFormat
  // Currency/measure symbol or code (₹, $, AED). The formatter bakes in no
  // locale currency, so the unit is the only thing that carries it.
  unit?: string
}

export interface ChartBlockOptions {
  stacked?: boolean
  show_legend?: boolean
  orientation?: 'vertical' | 'horizontal'
}

export interface ChartBlock {
  type: 'chart'
  chart_type: ChartType
  title?: string
  data: DataRow[]
  x: ChartFieldRef
  series: ChartFieldRef[]
  options?: ChartBlockOptions
  /**
   * Rows the query produced, when that is more than the rows embedded here.
   *
   * Mirrors TableBlock.total_count. Today the producer always sets it equal to
   * the embedded row count — the execution row guard bounds the read before the
   * count is taken, and a governed shape refuses an overflow rather than
   * truncating — so "(N total)" is a contract for a future producer, not
   * something a client can observe yet. The renderer prints it only when it
   * genuinely exceeds the embedded rows.
   */
  total_count?: number
}

/* ------------------------------ Table ---------------------------- */

export interface TableColumn {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  format?: ValueFormat
  // Currency/measure symbol or code (e.g. ₹, $, AED). Mirrors Metric.unit so a
  // currency column renders the same symbol a KPI card would — the formatter
  // never bakes in a locale currency, the unit carries it.
  unit?: string
}

export interface TableBlock {
  type: 'table'
  title?: string
  columns: TableColumn[]
  rows: DataRow[]
  total_count?: number
  page_size?: number
}

/* ------------------------------ Text ----------------------------- */

export interface TextBlock {
  type: 'text'
  markdown: string
}

/* ----------------------------- Actions --------------------------- */

export interface ActionItem {
  id: string
  label: string
  style?: 'primary' | 'secondary'
  on_click: { send_message: string }
}

export interface ActionsBlock {
  type: 'actions'
  actions: ActionItem[]
}

/* --------------------------- Union + spec ------------------------ */

export type Block =
  | MetricGroupBlock
  | ChartBlock
  | TableBlock
  | TextBlock
  | ActionsBlock

export type BlockType = Block['type']

export interface ViewSpec {
  surface_id: string
  version: '1'
  title?: string
  blocks: Block[]
}

/* ------------------------------------------------------------------
 * Runtime validation (type guards)
 *
 * The agent or transport could yield a partially malformed block;
 * these guards let the renderer skip a bad block while still drawing
 * the rest of the surface. They check the load-bearing shape only —
 * presentation-optional fields are validated leniently by the blocks.
 * ----------------------------------------------------------------*/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFieldRef(value: unknown): value is ChartFieldRef {
  return isRecord(value) && typeof value.key === 'string' && typeof value.label === 'string'
}

// Per-type shape checks. They validate the load-bearing fields only; the
// caller (isValidBlock) has already matched the discriminant, so each runs
// on a record of the corresponding type and returns a plain boolean.
function hasMetricGroupShape(block: Record<string, unknown>): boolean {
  return Array.isArray(block.metrics)
}

function hasChartShape(block: Record<string, unknown>): boolean {
  return (
    typeof block.chart_type === 'string' &&
    Array.isArray(block.data) &&
    isFieldRef(block.x) &&
    Array.isArray(block.series) &&
    block.series.every(isFieldRef)
  )
}

function hasTableShape(block: Record<string, unknown>): boolean {
  return Array.isArray(block.columns) && Array.isArray(block.rows)
}

function hasTextShape(block: Record<string, unknown>): boolean {
  return typeof block.markdown === 'string'
}

function hasActionsShape(block: Record<string, unknown>): boolean {
  return Array.isArray(block.actions)
}

/** True when `value` is a renderable block of a known type with its required shape. */
export function isValidBlock(value: unknown): value is Block {
  if (!isRecord(value)) return false
  switch (value.type) {
    case 'metric_group':
      return hasMetricGroupShape(value)
    case 'chart':
      return hasChartShape(value)
    case 'table':
      return hasTableShape(value)
    case 'text':
      return hasTextShape(value)
    case 'actions':
      return hasActionsShape(value)
    default:
      return false
  }
}

/** True when `value` is a structurally valid ViewSpec (blocks array present). */
export function isValidViewSpec(value: unknown): value is ViewSpec {
  return isRecord(value) && Array.isArray(value.blocks)
}
