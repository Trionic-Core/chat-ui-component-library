import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { motion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../utils/cn'
import { renderMarkdown } from '../utils/markdown'
import { ChainOfThought } from './chain-of-thought'
import { ThinkingIndicator } from './thinking-indicator'
import { MessageActionBar } from './message-action-bar'
import type { ChatMessageProps } from '../types'

/**
 * ChatMessage v0.2.0 — CypherX message layout.
 *
 * User messages: Right-aligned dark pill, snug fit, rounded corners.
 * Assistant messages: Left-aligned, no bubble, clean flowing text.
 *
 * New in v0.2.0:
 * - MessageActionBar (copy/retry) appears on hover via group/message.
 * - ChainOfThought replaces ActionIndicator with smooth accordion.
 * - Reasoning block uses CSS max-height transition (no motion dep).
 */
export function ChatMessage({
  message,
  isStreaming = false,
  onRetry,
  className,
}: ChatMessageProps) {
  const [reasoningOpen, setReasoningOpen] = useState(isStreaming)
  const reasoningRef = useRef<HTMLDivElement>(null)
  const [reasoningHeight, setReasoningHeight] = useState(0)

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

  const renderedContent = useMemo(() => {
    if (message.role === 'user' || !message.content) return null
    return renderMarkdown(message.content)
  }, [message.role, message.content])

  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const hasContent = message.content.length > 0
  const hasActions = (message.actions?.length ?? 0) > 0
  const hasReasoning = Boolean(message.reasoning)
  const showThinking = isStreaming && !hasContent && !hasActions

  return (
    <motion.div
      role="article"
      aria-label={isUser ? 'Your message' : 'Assistant message'}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn(
        'group/message py-3',
        isUser && 'flex justify-end',
        className
      )}
    >
      {isUser ? (
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
          {/* Action bar for user messages (copy + edit) */}
          <MessageActionBar content={message.content} />
        </div>
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

          {/* Action bar (hover reveal) */}
          {hasContent && !isStreaming && (
            <div className="mt-1.5">
              <MessageActionBar
                content={message.content}
                onRetry={message.error ? onRetry : undefined}
              />
            </div>
          )}
        </div>
      ) : null}
    </motion.div>
  )
}
