import type { FC } from 'react'
import type { Block, BlockType } from './aui-types'
import { MetricGroupBlock } from './blocks/metric-group-block'
import { ChartBlock } from './blocks/chart-block'
import { TableBlock } from './blocks/table-block'
import { TextBlock } from './blocks/text-block'
import { ActionsBlock } from './blocks/actions-block'

/* ------------------------------------------------------------------
 * AUI block registry
 *
 * Maps each block `type` to its renderer. Every renderer takes the
 * same uniform props (the discriminated block + the send-message
 * callback for the action loop) so the view can render any block
 * without a per-type switch. resolveBlock() returns the renderer or
 * null for unknown/invalid types — the caller skips a null block.
 * ----------------------------------------------------------------*/

/** Uniform props passed to every registered block renderer. */
export interface BlockRendererProps {
  block: Block
  onSendMessage: (message: string) => void
}

type BlockRenderer = FC<BlockRendererProps>

/**
 * The registry. Each entry narrows the union for its own type — the
 * key guarantees the runtime type matches, and resolveBlock is only
 * called after isValidBlock has confirmed the shape.
 */
const REGISTRY: Record<BlockType, BlockRenderer> = {
  metric_group: ({ block }) =>
    block.type === 'metric_group' ? <MetricGroupBlock block={block} /> : null,
  chart: ({ block }) => (block.type === 'chart' ? <ChartBlock block={block} /> : null),
  table: ({ block }) => (block.type === 'table' ? <TableBlock block={block} /> : null),
  text: ({ block }) => (block.type === 'text' ? <TextBlock block={block} /> : null),
  actions: ({ block, onSendMessage }) =>
    block.type === 'actions' ? (
      <ActionsBlock block={block} onSendMessage={onSendMessage} />
    ) : null,
}

/** Resolve a block to its renderer, or null (logged) for an unknown type. */
export function resolveBlock(block: Block): BlockRenderer | null {
  const renderer = REGISTRY[block.type]
  if (!renderer) {
    console.warn('[aui] no renderer for block type:', (block as { type?: string }).type)
    return null
  }
  return renderer
}
