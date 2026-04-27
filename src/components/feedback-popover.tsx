import { useState, useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { cn } from '../utils/cn'
import type { FeedbackPopoverProps, FeedbackReasonCategory } from '../types'

const DOWN_REASONS: Array<{ value: FeedbackReasonCategory; label: string }> = [
  { value: 'incorrect', label: 'Incorrect' },
  { value: 'hallucinated', label: 'Made up' },
  { value: 'unhelpful', label: 'Not helpful' },
  { value: 'too_verbose', label: 'Too long' },
  { value: 'too_brief', label: 'Too short' },
  { value: 'unsafe', label: 'Unsafe' },
  { value: 'off_topic', label: 'Off-topic' },
  { value: 'other', label: 'Other' },
]

/**
 * FeedbackPopover — small floating panel that appears after a thumbs-down
 * is clicked. Lets the user pick a reason chip + optionally type a comment.
 *
 * Currently only opens on `down`. Up-feedback submits immediately without
 * a popover (matches claude.ai's pattern).
 *
 * Positioned by the parent (MessageActionBar) — this component is just the
 * panel, not the trigger.
 */
export function FeedbackPopover({
  rating: _rating,
  onSubmit,
  onDismiss,
  className,
}: FeedbackPopoverProps) {
  const [category, setCategory] = useState<FeedbackReasonCategory | undefined>(undefined)
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-focus the comment field on mount.
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Close on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onDismiss()
      }
    }
    // Defer one tick so the click that opened us doesn't close us.
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', handler)
    }
  }, [onDismiss])

  const handleSubmit = () => {
    onSubmit({
      category,
      text: text.trim() || undefined,
    })
  }

  return (
    <motion.div
      ref={containerRef}
      role="dialog"
      aria-label="Provide feedback"
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.14, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn(
        'absolute z-50 w-[300px] rounded-[var(--cxc-radius-lg)] p-3.5 shadow-lg',
        className
      )}
      style={{
        backgroundColor: 'var(--cxc-bg)',
        border: '1px solid var(--cxc-border)',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onDismiss()
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-medium" style={{ color: 'var(--cxc-text)' }}>
          What was wrong?
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="flex h-6 w-6 items-center justify-center rounded-[var(--cxc-radius-sm)]"
          style={{ color: 'var(--cxc-text-muted)' }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--cxc-bg-muted)'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mb-2.5 flex flex-wrap gap-1">
        {DOWN_REASONS.map((r) => {
          const active = category === r.value
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => setCategory(active ? undefined : r.value)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[12px] transition-colors duration-100',
                'outline-none focus-visible:ring-2 focus-visible:ring-[var(--cxc-border-focus)]'
              )}
              style={{
                backgroundColor: active ? 'var(--cxc-text)' : 'var(--cxc-bg)',
                color: active ? 'var(--cxc-bg)' : 'var(--cxc-text-secondary)',
                border: `1px solid ${active ? 'var(--cxc-text)' : 'var(--cxc-border-subtle)'}`,
              }}
            >
              {r.label}
            </button>
          )
        })}
      </div>

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        placeholder="Anything you'd like to add? (optional)"
        rows={2}
        className={cn(
          'w-full resize-none rounded-[var(--cxc-radius-md)] px-2.5 py-2 text-[13px]',
          'outline-none focus-visible:ring-2 focus-visible:ring-[var(--cxc-border-focus)]'
        )}
        style={{
          backgroundColor: 'var(--cxc-bg-subtle)',
          color: 'var(--cxc-text)',
          border: '1px solid var(--cxc-border-subtle)',
        }}
      />

      <div className="mt-2.5 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full px-3 py-1 text-[12px]"
          style={{
            color: 'var(--cxc-text-secondary)',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="rounded-full px-3 py-1 text-[12px] font-medium"
          style={{
            backgroundColor: 'var(--cxc-text)',
            color: 'var(--cxc-bg)',
          }}
        >
          Submit
        </button>
      </div>
    </motion.div>
  )
}
