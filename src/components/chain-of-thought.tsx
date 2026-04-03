import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { ChevronDown, CheckCircle2, Clock, AlertCircle, Circle } from 'lucide-react'
import { cn } from '../utils/cn'
import { TextShimmer } from './text-shimmer'
import type { ChainOfThoughtProps, ChatAction } from '../types'

/**
 * Status dot icon for each step in the timeline.
 */
function StepIcon({ status }: { status: ChatAction['status'] }) {
  switch (status) {
    case 'completed':
      return (
        <CheckCircle2
          size={14}
          style={{ color: 'var(--cxc-success)' }}
          aria-hidden="true"
        />
      )
    case 'running':
      return (
        <Clock
          size={14}
          className="cxc-thinking-pulse"
          style={{ color: 'var(--cxc-thinking-color)' }}
          aria-hidden="true"
        />
      )
    case 'error':
      return (
        <AlertCircle
          size={14}
          style={{ color: 'var(--cxc-error)' }}
          aria-hidden="true"
        />
      )
    default:
      return (
        <Circle
          size={14}
          style={{ color: 'var(--cxc-text-muted)' }}
          aria-hidden="true"
        />
      )
  }
}

/**
 * Single step in the timeline with vertical connector line.
 */
function Step({
  action,
  isLast,
  depth = 0,
}: {
  action: ChatAction
  isLast: boolean
  depth?: number
}) {
  return (
    <div style={{ paddingLeft: depth > 0 ? `${depth * 16}px` : undefined }}>
      <div className="flex items-start gap-2.5 py-1.5 relative">
        {/* Vertical connector line */}
        {!isLast && (
          <div
            className="absolute left-[6px] top-[20px] bottom-0 w-px"
            style={{ backgroundColor: 'var(--cxc-action-line)' }}
            aria-hidden="true"
          />
        )}

        {/* Status icon with bg mask */}
        <div
          className="mt-0.5 shrink-0 relative z-10 flex items-center justify-center"
          style={{ backgroundColor: 'var(--cxc-bg)' }}
        >
          <StepIcon status={action.status} />
        </div>

        {/* Label + detail */}
        <div className="min-w-0 flex-1">
          <span
            className="text-[13px]"
            style={{
              color:
                action.status === 'error'
                  ? 'var(--cxc-error)'
                  : action.status === 'running'
                    ? 'var(--cxc-text)'
                    : 'var(--cxc-text-secondary)',
            }}
          >
            {action.label}
          </span>
          {action.detail && (
            <p
              className="mt-0.5 text-xs truncate"
              style={{ color: 'var(--cxc-text-muted)' }}
              title={action.detail}
            >
              {action.detail}
            </p>
          )}
        </div>
      </div>

      {/* Nested children */}
      {action.children && action.children.length > 0 && (
        <div className="ml-2" style={{ borderLeft: '1px solid var(--cxc-action-line)' }}>
          {action.children.map((child, i) => (
            <Step
              key={child.id}
              action={child}
              isLast={i === action.children!.length - 1}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Summary text for the collapsed header.
 */
function buildSummary(actions: ChatAction[]): string {
  const counts = new Map<string, number>()
  for (const a of actions) {
    counts.set(a.label, (counts.get(a.label) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, n]) => (n > 1 ? `${label} (${n}x)` : label))
    .join(', ')
}

/**
 * ChainOfThought — CypherX collapsible accordion with timeline.
 *
 * Replaces ActionIndicator in v0.2.0.
 *
 * Design:
 * - Collapsed: single-line header with shimmer text (active) or summary (done).
 * - Expanded: vertical timeline with step dots and connector lines.
 * - Auto-expands during streaming, auto-collapses when done.
 * - Smooth expand/collapse using max-height + ResizeObserver
 *   with cubic-bezier(0.165, 0.85, 0.45, 1) easing.
 * - No background, no border — flows naturally in the message.
 */
export function ChainOfThought({
  actions,
  isActive = false,
  thinkingLabel = 'Thinking',
  className,
}: ChainOfThoughtProps) {
  const [userToggled, setUserToggled] = useState(false)
  const [userWantsOpen, setUserWantsOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)

  // Expanded logic: auto-open when active, respect user toggle when not active
  const isExpanded = isActive ? !userToggled || userWantsOpen : userToggled && userWantsOpen

  // Measure content height with ResizeObserver for smooth animation
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setContentHeight(el.scrollHeight)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Reset user toggle when isActive changes
  useEffect(() => {
    if (!isActive) {
      setUserToggled(false)
      setUserWantsOpen(false)
    }
  }, [isActive])

  const handleToggle = useCallback(() => {
    setUserToggled(true)
    setUserWantsOpen((prev) => !prev)
  }, [])

  if (actions.length === 0) return null

  const allDone = actions.every((a) => a.status === 'completed' || a.status === 'error')
  const hasErrors = actions.some((a) => a.status === 'error')
  const summary = buildSummary(actions)

  return (
    <div className={cn('my-2', className)}>
      {/* Accordion header */}
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'flex items-center gap-2 w-full min-w-0 py-1.5 text-left',
          'transition-colors duration-150 cursor-pointer',
          'rounded-[var(--cxc-radius-sm)]',
        )}
        aria-expanded={isExpanded}
      >
        {/* Status indicator */}
        {isActive ? (
          <TextShimmer duration={1.5} className="text-[13px] font-medium flex-1 min-w-0">
            {thinkingLabel}...
          </TextShimmer>
        ) : allDone && !hasErrors ? (
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <CheckCircle2
              size={13}
              className="shrink-0"
              style={{ color: 'var(--cxc-success)' }}
              aria-hidden="true"
            />
            <span
              className="text-[13px] truncate"
              style={{ color: 'var(--cxc-text-muted)' }}
            >
              {summary}
            </span>
          </div>
        ) : hasErrors ? (
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <AlertCircle
              size={13}
              className="shrink-0"
              style={{ color: 'var(--cxc-error)' }}
              aria-hidden="true"
            />
            <span
              className="text-[13px] truncate"
              style={{ color: 'var(--cxc-text-muted)' }}
            >
              {summary}
            </span>
          </div>
        ) : (
          <span
            className="text-[13px] truncate flex-1 min-w-0"
            style={{ color: 'var(--cxc-text-muted)' }}
          >
            {summary}
          </span>
        )}

        {/* Chevron */}
        <ChevronDown
          size={13}
          className="shrink-0 transition-transform duration-300"
          style={{
            color: 'var(--cxc-text-muted)',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transitionTimingFunction: 'var(--cxc-ease-accordion)',
          }}
          aria-hidden="true"
        />
      </button>

      {/* Expandable timeline content */}
      <div
        className="overflow-hidden transition-all duration-300"
        style={{
          maxHeight: isExpanded ? `${contentHeight}px` : '0px',
          opacity: isExpanded ? 1 : 0,
          transitionTimingFunction: 'var(--cxc-ease-accordion)',
        }}
      >
        <div ref={contentRef} className="pl-1 pb-1 pt-1" role="list" aria-label="Action steps">
          {actions.map((action, i) => (
            <Step
              key={action.id}
              action={action}
              isLast={i === actions.length - 1}
            />
          ))}

          {/* Done indicator */}
          {allDone && !hasErrors && (
            <div className="flex items-center gap-2 pt-1.5 pl-0.5">
              <CheckCircle2
                size={12}
                style={{ color: 'var(--cxc-success)' }}
                aria-hidden="true"
              />
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--cxc-success)' }}
              >
                Done
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
