/* ------------------------------------------------------------------
 * AUI (Agentic UI) module — public surface.
 *
 * Renders ui_block ViewSpecs (metric groups, charts, tables, text,
 * actions) emitted by the enterprise agent. The host wires AuiView
 * below an assistant message's prose; action buttons call onSendMessage
 * to drive a new chat turn.
 * ----------------------------------------------------------------*/

export { AuiView } from './aui-view'
export type { AuiViewProps } from './aui-view'

export { isValidBlock, isValidViewSpec } from './aui-types'
export type {
  ViewSpec,
  Block,
  BlockType,
  MetricGroupBlock,
  ChartBlock,
  TableBlock,
  TextBlock,
  ActionsBlock,
  Metric,
  MetricDelta,
  ChartType,
  ChartFieldRef,
  ChartBlockOptions,
  TableColumn,
  ActionItem,
  ValueFormat,
  CellValue,
  DataRow,
} from './aui-types'
