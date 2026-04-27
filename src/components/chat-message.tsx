import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { motion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../utils/cn'
import { renderMarkdown } from '../utils/markdown'
import { ChainOfThought } from './chain-of-thought'
import { ThinkingIndicator } from './thinking-indicator'
import { MessageActionBar } from './message-action-bar'
import { FollowupsCard } from './followups-card'
import { FeedbackPopover } from './feedback-popover'
import { useChatContext } from '../context/chat-context'
import type { ChatMessageProps, FeedbackRating } from '../types'

/**
 * ChatMessage v0.3.0 — CypherX message layout.
 *
 * User messages: Right-aligned dark pill. When `isLast && config.enableRegenerate`,
 * an Edit affordance reveals an inline textarea that submits via editAndRegenerate.
 *
 * Assistant messages: Left-aligned, no bubble. New in v0.3.0:
 * - FollowupsCard renders below content when `message.followups` is set.
 * - MessageActionBar shows like/dislike buttons when ChatConfig.feedback is provided.
 * - Dislike opens a popover for reason category + free text.
 * - When `isLast && config.enableRegenerate`, the bar also exposes Retry which
 *   calls regenerateLast (re-runs the last user prompt with regenerate=true).
 */
export function ChatMessage({
  message,
  isStreaming = false,
  isLast = false,
  onRetry,
  className,
}: ChatMessageProps) {
  const { config, selectFollowup, submitFeedback, removeFeedback, editAndRegenerate, regenerateLast } = useChatContext()

  const [reasoningOpen, setReasoningOpen] = useState(isStreaming)
  const reasoningRef = useRef<HTMLDivElement>(null)
  const [reasoningHeight, setReasoningHeight] = useState(0)

  // Inline edit state for the last user message.
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(message.content)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Feedback popover state (assistant-side dislike).
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const toggleReasoning = useCallback(() => {
    setReasoningOpen((prev) => !prev)
  }, [])

  // Measure reasoning content for smooth collapse
  useEffect(() => {
    const el = reasoningRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setReasoningHeight(el.scrollHeight)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Auto-focus the edit textarea when entering edit mode.
  useEffect(() => {
    if (editing && editTextareaRef.current) {
      editTextareaRef.current.focus()
      // Place cursor at end
      const len = editTextareaRef.current.value.length
      editTextareaRef.current.setSelectionRange(len, len)
    }
  }, [editing])

  const renderedContent = useMemo(() => {
    if (message.role === 'user' || !message.content) return null
    return renderMarkdown(message.content)
  }, [message.role, message.content])

  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const hasContent = message.content.length > 0
  const hasActions = (message.actions?.length ?? 0) > 0
  const hasReasoning = Boolean(message.reasoning)
  const hasFollowups = Boolean(message.followups)
  const showThinking = isStreaming && !hasContent && !hasActions

  const enableEdit = isUser && isLast && config.enableRegenerate === true
  const enableRegenButton = isAssistant && isLast && config.enableRegenerate === true && !isStreaming
  const feedbackEnabled = isAssistant && Boolean(config.feedback) && Boolean(message.backendMessageId) && !isStreaming

  // Wire edit submit
  const handleEditSubmit = useCallback(() => {
    const trimmed = editText.trim()
    if (!trimmed) return
    setEditing(false)
    editAndRegenerate(trimmed)
  }, [editText, editAndRegenerate])

  const handleEditCancel = useCallback(() => {
    setEditing(false)
    setEditText(message.content)
  }, [message.content])

  // Wire feedback rating click. `up` submits immediately; `down` opens the popover.
  const handleFeedbackClick = useCallback(
    (rating: FeedbackRating) => {
      // Toggle off if clicking the same rating already in place.
      if (message.feedback?.rating === rating) {
        void removeFeedback(message.id)
        setFeedbackOpen(false)
        return
      }
      if (rating === 'up') {
        void submitFeedback(message.id, { rating: 'up' })
      } else {
        // Open the reason popover; submit fires from the popover.
        setFeedbackOpen(true)
      }
    },
    [message.feedback?.rating, message.id, submitFeedback, removeFeedback]
  )

  return (
    <motion.div
      role="article"
      aria-label={isUser ? 'Your message' : 'Assistant message'}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn(
        'group/message py-3',
        isUser && !editing && 'flex justify-end',
        className
      )}
    >
      {isUser ? (
        editing ? (
          /* === User Message: Inline Edit Mode === */
          <div className="flex flex-col gap-2 w-full">
            <textarea
              ref={editTextareaRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleEditSubmit()
                }
                if (e.key === 'Escape') handleEditCancel()
              }}
              rows={Math.min(8, Math.max(2, editText.split('\n').length))}
              className={cn(
                'w-full resize-none rounded-[var(--cxc-radius-md)] px-3.5 py-2.5 text-[15px]',
                'outline-none focus-visible:ring-2 focus-visible:ring-[var(--cxc-border-focus)]'
              )}
              style={{
                backgroundColor: 'var(--cxc-bg-subtle)',
                color: 'var(--cxc-text)',
                border: '1px solid var(--cxc-border)',
                lineHeight: '1.55',
              }}
            />
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={handleEditCancel}
                className="rounded-full px-3 py-1.5 text-[13px]"
                style={{ color: 'var(--cxc-text-secondary)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditSubmit}
                disabled={!editText.trim()}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-[13px] font-medium',
                  'transition-opacity duration-100',
                  editText.trim() ? 'opacity-100' : 'opacity-40 cursor-not-allowed'
                )}
                style={{
                  backgroundColor: 'var(--cxc-text)',
                  color: 'var(--cxc-bg)',
                }}
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          /* === User Message: Right-aligned dark pill === */
          <div className="flex flex-col items-end gap-1 max-w-[80%]">
            <div
              className="rounded-[22px] px-5 py-3"
              style={{
                backgroundColor: 'var(--cxc-user-bg)',
                color: 'var(--cxc-user-text)',
                borderBottomRightRadius: 'var(--cxc-radius-sm)',
              }}
            >
              <p className="text-[15px] whitespace-pre-wrap break-words leading-[1.55]">
                {message.content}
              </p>
            </div>
            <MessageActionBar
              content={message.content}
              onEdit={enableEdit ? () => setEditing(true) : undefined}
            />
          </div>
        )
      ) : isAssistant ? (
        /* === Assistant Message: Left-aligned, no bubble === */
        <div className="w-full" style={{ color: 'var(--cxc-assistant-text)' }}>
          {/* Reasoning block (collapsible, CSS transition) */}
          {hasReasoning && (
            <div
              className="mb-3 rounded-[var(--cxc-radius-md)] overflow-hidden"
              style={{
                backgroundColor: 'var(--cxc-bg-subtle)',
                border: '1px solid var(--cxc-border-subtle)',
              }}
            >
              <button
                type="button"
                onClick={toggleReasoning}
                className="flex items-center gap-2 w-full px-3.5 py-2.5 text-left transition-colors duration-150"
                aria-expanded={reasoningOpen}
              >
                <span
                  className="text-xs font-medium tracking-wide uppercase"
                  style={{ color: 'var(--cxc-text-muted)' }}
                >
                  Reasoning
                </span>
                <ChevronDown
                  size={12}
                  className="transition-transform duration-300"
                  style={{
                    color: 'var(--cxc-text-muted)',
                    transform: reasoningOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transitionTimingFunction: 'var(--cxc-ease-accordion)',
                  }}
                />
              </button>
              <div
                className="overflow-hidden transition-all duration-300"
                style={{
                  maxHeight: reasoningOpen ? `${reasoningHeight}px` : '0px',
                  opacity: reasoningOpen ? 1 : 0,
                  transitionTimingFunction: 'var(--cxc-ease-accordion)',
                }}
              >
                <div
                  ref={reasoningRef}
                  className="px-3.5 pb-3 text-[13px]"
                  style={{
                    color: 'var(--cxc-text-secondary)',
                    borderTop: '1px solid var(--cxc-border-subtle)',
                  }}
                >
                  <p className="whitespace-pre-wrap leading-[1.65] pt-2.5">
                    {message.reasoning}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Chain of Thought (replaces ActionIndicator) */}
          {hasActions && message.actions && (
            <ChainOfThought
              actions={message.actions}
              isActive={isStreaming}
            />
          )}

          {/* Thinking indicator */}
          {showThinking && <ThinkingIndicator />}

          {/* Message content */}
          {hasContent && renderedContent && (
            <div
              className="cxc-markdown text-[15px] leading-[1.7]"
              dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
          )}

          {/* Followups MCQ card. Auto-lock once a new turn arrives even if the
              user never picked an option — `lockedSelection={[]}` disables the
              buttons without highlighting any of them. */}
          {hasFollowups && message.followups && !isStreaming && (
            <FollowupsCard
              followups={message.followups}
              lockedSelection={
                message.followupsSelection ?? (isLast ? undefined : [])
              }
              onSelect={(opts) => selectFollowup(message.id, opts)}
            />
          )}

          {/* Error state */}
          {message.error && (
            <div
              className="flex items-center gap-2.5 mt-3 text-[13px]"
              role="alert"
            >
              <span style={{ color: 'var(--cxc-error)' }}>
                {message.content || 'An error occurred'}
              </span>
            </div>
          )}

          {/* Action bar (hover reveal) — copy + retry/regenerate + feedback */}
          {hasContent && !isStreaming && (
            <div className="relative mt-1.5">
              <MessageActionBar
                content={message.content}
                onRetry={
                  message.error
                    ? onRetry
                    : enableRegenButton
                      ? regenerateLast
                      : undefined
                }
                feedback={feedbackEnabled ? message.feedback : null}
                onFeedback={feedbackEnabled ? handleFeedbackClick : undefined}
              />
              {/* Dislike reason popover, anchored above the bar. */}
              {feedbackOpen && feedbackEnabled && (
                <FeedbackPopover
                  rating="down"
                  onSubmit={(reason) => {
                    void submitFeedback(message.id, {
                      rating: 'down',
                      reasonCategory: reason.category,
                      reasonText: reason.text,
                    })
                    setFeedbackOpen(false)
                  }}
                  onDismiss={() => setFeedbackOpen(false)}
                  className="bottom-full left-0 mb-2"
                />
              )}
            </div>
          )}
        </div>
      ) : null}
    </motion.div>
  )
}
