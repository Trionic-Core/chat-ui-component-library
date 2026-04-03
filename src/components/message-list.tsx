import { forwardRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowDown } from 'lucide-react'
import { cn } from '../utils/cn'
import { useChatContext } from '../context/chat-context'
import { useChatScroll } from '../hooks/use-chat-scroll'
import { ChatMessage } from './chat-message'
import { ThinkingIndicator } from './thinking-indicator'
import { EmptyState } from './empty-state'
import type { MessageListProps } from '../types'

/**
 * Scrollable message container.
 *
 * CypherX chat layout:
 * - Content centered at max-width 720px with auto margins
 * - Generous horizontal padding (24px mobile, 32px desktop)
 * - Generous vertical padding
 * - Near-invisible custom scrollbar
 * - Scroll-to-bottom button: minimal pill floating at bottom center
 *
 * Features:
 * - Smart auto-scrolling with user override detection
 * - Thinking indicator appears for empty streaming messages
 * - Optional custom message renderer
 * - Screen reader announcements for new messages
 */
export const MessageList = forwardRef<HTMLDivElement, MessageListProps>(
  function MessageList({ renderMessage, className }, ref) {
    const { state } = useChatContext()
    const { messages, isStreaming } = state

    const {
      scrollRef,
      bottomRef,
      isAtBottom,
      unreadCount,
      scrollToBottom,
    } = useChatScroll([messages.length, messages[messages.length - 1]?.content.length])

    const handleScrollToBottom = useCallback(() => {
      scrollToBottom('smooth')
    }, [scrollToBottom])

    // Show thinking indicator when streaming with empty assistant message
    const lastMessage = messages[messages.length - 1]
    const showThinking =
      isStreaming &&
      lastMessage?.role === 'assistant' &&
      lastMessage.content === '' &&
      !lastMessage.actions?.length

    if (messages.length === 0) {
      return (
        <div
          ref={ref}
          className={cn('flex flex-1 overflow-hidden', className)}
          role="log"
          aria-label="Messages"
          aria-live="polite"
          aria-relevant="additions"
        >
          <EmptyState />
        </div>
      )
    }

    return (
      <div
        ref={ref}
        className={cn('relative flex flex-1 flex-col overflow-hidden', className)}
      >
        {/* Scrollable message area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden cxc-scrollbar"
          role="log"
          aria-label="Messages"
          aria-live="polite"
          aria-relevant="additions"
          style={{ scrollBehavior: 'smooth' }}
        >
          {/* Centered content column */}
          <div
            className="mx-auto w-full px-5 py-6 sm:px-8"
            style={{ maxWidth: 'var(--cxc-content-max-width)' }}
          >
            <AnimatePresence initial={false}>
              {messages.map((message, index) => {
                // Empty streaming assistant messages show thinking indicator
                if (
                  message.role === 'assistant' &&
                  message.isStreaming &&
                  message.content === '' &&
                  !message.actions?.length
                ) {
                  return (
                    <div key={message.id} className="py-3">
                      <ThinkingIndicator />
                    </div>
                  )
                }

                if (renderMessage) {
                  return (
                    <div key={message.id}>
                      {renderMessage(message, index)}
                    </div>
                  )
                }

                return (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    isStreaming={message.isStreaming}
                  />
                )
              })}
            </AnimatePresence>

            {/* Bottom sentinel for IntersectionObserver */}
            <div ref={bottomRef} className="h-px w-full" aria-hidden="true" />
          </div>
        </div>

        {/* Scroll to bottom button -- minimal floating pill */}
        <AnimatePresence>
          {!isAtBottom && (
            <motion.button
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={handleScrollToBottom}
              className={cn(
                'absolute bottom-4 left-1/2 -translate-x-1/2',
                'flex items-center gap-1.5 rounded-full px-3.5 py-2',
                'transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2',
              )}
              style={{
                backgroundColor: 'var(--cxc-bg)',
                border: '1px solid var(--cxc-border)',
                color: 'var(--cxc-text-secondary)',
                boxShadow: 'var(--cxc-shadow-md)',
              }}
              aria-label={
                unreadCount > 0
                  ? `Scroll to latest messages (${unreadCount} new)`
                  : 'Scroll to latest messages'
              }
            >
              <ArrowDown size={14} />
              {unreadCount > 0 && (
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--cxc-accent)',
                    color: 'var(--cxc-text-inverse)',
                  }}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </motion.button>
          )}
        </AnimatePresence>

        {/* Screen reader announcement for new messages */}
        <div className="sr-only" aria-live="polite" aria-atomic="false">
          {lastMessage?.role === 'assistant' && !lastMessage.isStreaming && lastMessage.content && (
            <span>New message from assistant</span>
          )}
        </div>
      </div>
    )
  }
)
