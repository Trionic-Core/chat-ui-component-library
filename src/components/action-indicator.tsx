import { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  ChevronDown,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Circle,
  Clock,
} from 'lucide-react'
import { cn } from '../utils/cn'
import type { ActionIndicatorProps, ChatAction } from '../types'

/**
 * Maps action status to the appropriate timeline icon.
 *
 * Design language:
 * - Running: Clock icon with soft pulse animation
 * - Completed: Green checkmark
 * - Error: Red alert circle
 * - Pending: Muted empty circle
 */
function StatusIcon({ status }: { status: ChatAction['status'] }) {
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
    case 'pending':
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
 * Renders a single action item within the vertical timeline.
 *
 * Each item has:
 * - A status icon (left side, overlaying the vertical line)
 * - Label text in secondary color
 * - Optional detail text in muted, truncated
 *
 * The vertical timeline line is rendered as a left border
 * on the parent container, with the icon positioned to
 * overlap it, creating the "timeline node" effect.
 */
function ActionItem({
  action,
  depth = 0,
  isLast = false,
}: {
  action: ChatAction
  depth?: number
  isLast?: boolean
}) {
  return (
    <div style={{ paddingLeft: depth > 0 ? `${depth * 16}px` : undefined }}>
      <div className="flex items-center gap-2.5 py-2 relative">
        {/* Timeline vertical line segment */}
        {!isLast && (
          <div
            className="absolute left-[6px] top-[22px] bottom-0 w-px"
            style={{ backgroundColor: 'var(--cxc-action-line)' }}
            aria-hidden="true"
          />
        )}

        {/* Status icon (positioned over the timeline line) */}
        <div
          className="shrink-0 relative z-10 flex items-center justify-center"
          style={{
            /* Small bg circle behind icon to mask the line */
            backgroundColor: 'var(--cxc-bg)',
          }}
        >
          <StatusIcon status={action.status} />
        </div>

        {/* Content */}
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

      {/* Nested children (sub-agent pattern) */}
      {action.children && action.children.length > 0 && (
        <div
          className="ml-2"
          style={{ borderLeft: '1px solid var(--cxc-action-line)' }}
        >
          {action.children.map((child, i) => (
            <ActionItem
              key={child.id}
              action={child}
              depth={depth + 1}
              isLast={i === action.children!.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Builds a summary string for the collapsed view.
 * Groups completed actions by label and shows counts.
 * e.g., "Searched database, Ran query (2x)"
 */
function buildSummary(actions: ChatAction[]): string {
  const labelCounts = new Map<string, number>()
  for (const action of actions) {
    const label = action.label
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1)
  }

  const parts: string[] = []
  for (const [label, count] of labelCounts) {
    parts.push(count > 1 ? `${label} (${count}x)` : label)
  }

  return parts.join(', ')
}

/**
 * CypherX collapsible action/thinking section.
 *
 * Design:
 * - Collapsed: Single-line header with summary text, chevron, and status icon.
 *   Clean and unobtrusive -- just a subtle gray text line.
 * - Expanded: Vertical timeline with status dots/icons for each step.
 *   Running steps show a pulsing clock icon.
 *   Completed steps show a green checkmark.
 *   "Done" indicator at the bottom when all complete.
 *
 * Behavior:
 * - Auto-expands while actions are running (isActive=true).
 * - Collapses to summary once all actions complete.
 * - Click to toggle when not actively running.
 *
 * The section has NO background color or border -- it flows
 * naturally within the message content.
 */
export function ActionIndicator({
  actions,
  isActive = false,
  className,
}: ActionIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // When active, always show expanded; when not active, use toggle state
  const showExpanded = isActive || isExpanded

  const summary = useMemo(() => buildSummary(actions), [actions])
  const actionId = useMemo(
    () => `actions-${actions[0]?.id ?? 'unknown'}`,
    [actions]
  )

  const handleToggle = useCallback(() => {
    if (!isActive) {
      setIsExpanded((prev) => !prev)
    }
  }, [isActive])

  if (actions.length === 0) return null

  const allCompleted = actions.every(
    (a) => a.status === 'completed' || a.status === 'error'
  )
  const hasErrors = actions.some((a) => a.status === 'error')

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn('overflow-hidden my-2', className)}
    >
      <div className="overflow-hidden">
        {/* Collapse toggle header -- clean, no background */}
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            'flex items-center gap-2 w-full py-1.5 text-left',
            'transition-colors duration-150',
            !isActive && 'cursor-pointer',
          )}
          style={{
            backgroundColor: 'transparent',
          }}
          aria-expanded={showExpanded}
          aria-controls={actionId}
          aria-label={`Actions: ${summary}`}
        >
          {/* Status icon */}
          {isActive ? (
            <Loader2
              size={13}
              className="cxc-spin shrink-0"
              style={{ color: 'var(--cxc-thinking-color)' }}
              aria-hidden="true"
            />
          ) : allCompleted && !hasErrors ? (
            <CheckCircle2
              size={13}
              className="shrink-0"
              style={{ color: 'var(--cxc-success)' }}
              aria-hidden="true"
            />
          ) : hasErrors ? (
            <AlertCircle
              size={13}
              className="shrink-0"
              style={{ color: 'var(--cxc-error)' }}
              aria-hidden="true"
            />
          ) : null}

          <span
            className="flex-1 text-[13px] truncate"
            style={{ color: 'var(--cxc-text-muted)' }}
          >
            {summary}
          </span>

          <motion.span
            animate={{ rotate: showExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0"
          >
            <ChevronDown
              size={13}
              style={{ color: 'var(--cxc-text-muted)' }}
              aria-hidden="true"
            />
          </motion.span>
        </button>

        {/* Expandable timeline content */}
        <AnimatePresence initial={false}>
          {showExpanded && (
            <motion.div
              id={actionId}
              role="list"
              aria-label="Action details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="pl-1 pb-1">
                {actions.map((action, i) => (
                  <ActionItem
                    key={action.id}
                    action={action}
                    isLast={i === actions.length - 1}
                  />
                ))}

                {/* "Done" indicator at the bottom */}
                {allCompleted && !hasErrors && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="flex items-center gap-2 pt-1.5 pl-0.5"
                  >
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
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
