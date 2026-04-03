import { useState, useCallback } from 'react'
import { Check, Copy, RotateCcw, Pencil } from 'lucide-react'
import { cn } from '../utils/cn'
import type { MessageActionBarProps, MessageActionItem } from '../types'

/**
 * MessageActionBar — hover-reveal row of action buttons on messages.
 *
 * Design pattern:
 * - Container uses `opacity-0 group-hover/message:opacity-100` so it
 *   only appears when the parent message is hovered.
 * - Each button is a small icon-only circle with tooltip.
 * - Copy button toggles to a checkmark for 2 seconds after copying.
 *
 * The parent ChatMessage must have `group/message` class for this to work.
 */
export function MessageActionBar({
  content,
  actions,
  onCopy,
  onRetry,
  onEdit,
  className,
}: MessageActionBarProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!content) return
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      onCopy?.()
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = content
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      onCopy?.()
      setTimeout(() => setCopied(false), 2000)
    }
  }, [content, onCopy])

  // Build the action list — default actions + custom actions
  const defaultActions: MessageActionItem[] = []

  if (content) {
    defaultActions.push({
      id: 'copy',
      icon: copied ? <Check size={14} /> : <Copy size={14} />,
      label: copied ? 'Copied' : 'Copy',
      onClick: handleCopy,
    })
  }

  if (onRetry) {
    defaultActions.push({
      id: 'retry',
      icon: <RotateCcw size={14} />,
      label: 'Retry',
      onClick: onRetry,
    })
  }

  if (onEdit) {
    defaultActions.push({
      id: 'edit',
      icon: <Pencil size={14} />,
      label: 'Edit',
      onClick: onEdit,
    })
  }

  const allActions = [...defaultActions, ...(actions ?? [])]

  if (allActions.length === 0) return null

  return (
    <div
      className={cn(
        'flex items-center gap-0.5',
        'opacity-0 transition-opacity duration-150',
        'group-hover/message:opacity-100',
        'focus-within:opacity-100',
        className
      )}
      role="toolbar"
      aria-label="Message actions"
    >
      {allActions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={action.onClick}
          className={cn(
            'flex h-7 w-7 items-center justify-center',
            'rounded-[var(--cxc-radius-sm)]',
            'transition-colors duration-100',
            'focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-[var(--cxc-border-focus)]',
          )}
          style={{ color: 'var(--cxc-text-muted)' }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--cxc-bg-muted)'
            e.currentTarget.style.color = 'var(--cxc-text-secondary)'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = 'var(--cxc-text-muted)'
          }}
          aria-label={action.label}
          title={action.label}
        >
          {action.icon}
        </button>
      ))}
    </div>
  )
}
