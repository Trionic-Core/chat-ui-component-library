import { useMemo } from 'react'
import type { TextBlock as TextBlockType } from '../aui-types'
import { renderInlineMarkdown } from './inline-markdown'

/* ------------------------------------------------------------------
 * Text Block
 *
 * Inline note/caption rendered from sanitized markdown. The XSS-safe
 * renderer lives in ./inline-markdown so the component file stays
 * component-only (React Fast Refresh) and the sanitizer is unit-tested.
 * ----------------------------------------------------------------*/

interface TextBlockProps {
  block: TextBlockType
}

export function TextBlock({ block }: TextBlockProps) {
  const html = useMemo(() => renderInlineMarkdown(block.markdown), [block.markdown])

  return (
    <div
      className="text-sm leading-relaxed"
      style={{ color: 'var(--cx-text-secondary)' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
