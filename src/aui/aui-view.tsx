import { useMemo } from 'react'
import type { Block, ViewSpec } from './aui-types'
import { isValidBlock } from './aui-types'
import { resolveBlock } from './registry'
import { BlockErrorBoundary } from './block-error-boundary'

/* ------------------------------------------------------------------
 * AUI View
 *
 * Renders one ViewSpec surface: an optional title above an ordered
 * stack of blocks. Each block is validated (skipped if malformed),
 * resolved via the registry (skipped if unknown), and wrapped in an
 * error boundary so a single bad block never breaks the message.
 *
 * `onSendMessage` threads the action loop: an actions-block button
 * sends its `send_message` as a new chat turn via the host's send path.
 * ----------------------------------------------------------------*/

export interface AuiViewProps {
  spec: ViewSpec
  onSendMessage: (message: string) => void
}

export function AuiView({ spec, onSendMessage }: AuiViewProps) {
  // Drop malformed blocks once, up front (the third reliability layer).
  const blocks = useMemo<Block[]>(
    () => (Array.isArray(spec.blocks) ? spec.blocks.filter(isValidBlock) : []),
    [spec.blocks],
  )

  if (blocks.length === 0) return null

  return (
    <section
      className="space-y-3 rounded-lg border p-3"
      style={{ borderColor: 'var(--cx-border-subtle)', backgroundColor: 'var(--cx-canvas-subtle)' }}
      aria-label={spec.title || 'Data view'}
    >
      {spec.title && (
        <h3 className="text-sm font-semibold" style={{ color: 'var(--cx-text-primary)' }}>
          {spec.title}
        </h3>
      )}

      {blocks.map((block, index) => {
        const Renderer = resolveBlock(block)
        if (!Renderer) return null
        return (
          <BlockErrorBoundary key={`${block.type}-${index}`} blockType={block.type}>
            <Renderer block={block} onSendMessage={onSendMessage} />
          </BlockErrorBoundary>
        )
      })}
    </section>
  )
}
