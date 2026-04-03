import { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react'
import { cn } from '../utils/cn'
import { useChatContext } from '../context/chat-context'
import { MessageList } from './message-list'
import { PromptInput } from './prompt-input'
import { SessionList } from './session-list'
import { SessionSelector } from './session-selector'
import { EmptyState } from './empty-state'
import type { ChatContainerProps } from '../types'

/**
 * ChatContainer v0.2.0 — main layout shell.
 *
 * Design:
 * - Content-first, borderless feel
 * - Messages centered at 720px max-width
 * - Floating PromptInput at bottom with breathing room
 * - Subtle gradient fade at input/message boundary
 * - Sidebar slides in/out with spring animation
 */
export function ChatContainer({
  showSessions = false,
  sessionPosition = 'left',
  emptyState,
  className,
  headerSlot,
  inputAddonSlot,
  suggestions,
  onSuggestionClick,
  allowAttachments,
}: ChatContainerProps & {
  suggestions?: string[]
  onSuggestionClick?: (s: string) => void
  allowAttachments?: boolean
}) {
  const { state } = useChatContext()
  const { messages } = state
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev)
  }, [])

  const hasMessages = messages.length > 0
  const shouldShowSidebar = showSessions && sidebarOpen

  const sidebarPanel = showSessions ? (
    <AnimatePresence mode="wait">
      {shouldShowSidebar && (
        <motion.div
          key="sidebar"
          initial={{
            opacity: 0,
            x: sessionPosition === 'left' ? -20 : 20,
          }}
          animate={{ opacity: 1, x: 0 }}
          exit={{
            opacity: 0,
            x: sessionPosition === 'left' ? -20 : 20,
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="hidden h-full shrink-0 md:block"
          style={{
            borderRight:
              sessionPosition === 'left'
                ? '1px solid var(--cxc-border-subtle)'
                : undefined,
            borderLeft:
              sessionPosition === 'right'
                ? '1px solid var(--cxc-border-subtle)'
                : undefined,
          }}
        >
          <SessionList />
        </motion.div>
      )}
    </AnimatePresence>
  ) : null

  return (
    <div
      className={cn(
        'cxc-root flex h-full w-full flex-col overflow-hidden',
        className
      )}
      style={{
        backgroundColor: 'var(--cxc-bg)',
        fontFamily: 'var(--cxc-font-sans)',
      }}
      role="region"
      aria-label="Chat"
    >
      {/* Header bar */}
      {(showSessions || headerSlot) && (
        <div
          className="flex shrink-0 items-center gap-2 px-4 py-2.5"
          style={{
            borderBottom: '1px solid var(--cxc-border-subtle)',
          }}
        >
          {showSessions && (
            <button
              type="button"
              onClick={toggleSidebar}
              className={cn(
                'hidden md:flex h-8 w-8 items-center justify-center rounded-[var(--cxc-radius-md)]',
                'transition-colors duration-100',
                'focus-visible:outline-none focus-visible:ring-2',
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
              aria-label={sidebarOpen ? 'Close session sidebar' : 'Open session sidebar'}
            >
              {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
          )}

          {showSessions && (
            <div className="md:hidden">
              <SessionSelector />
            </div>
          )}

          <div className="flex-1" />

          {headerSlot && (
            <div className="flex items-center gap-2">{headerSlot}</div>
          )}
        </div>
      )}

      {/* Main content: sidebar + chat */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {sessionPosition === 'left' && sidebarPanel}

        <div className="flex flex-1 flex-col min-h-0 min-w-0">
          {/* Message area */}
          {hasMessages ? (
            <MessageList />
          ) : (
            <div className="flex flex-1 overflow-hidden">
              {emptyState ?? <EmptyState />}
            </div>
          )}

          {/* Input area with gradient fade */}
          <div className="shrink-0 relative" style={{ backgroundColor: 'var(--cxc-bg)' }}>
            {/* Subtle gradient fade at top edge for depth */}
            {hasMessages && (
              <div
                className="absolute top-0 left-0 right-0 h-6 -translate-y-full pointer-events-none"
                style={{
                  background: `linear-gradient(to bottom, transparent, var(--cxc-bg))`,
                }}
                aria-hidden="true"
              />
            )}
            <div className="mx-auto" style={{ maxWidth: 'var(--cxc-content-max-width)' }}>
              <PromptInput
                addonSlot={inputAddonSlot}
                suggestions={!hasMessages ? suggestions : undefined}
                onSuggestionClick={onSuggestionClick}
                allowAttachments={allowAttachments}
              />
            </div>
          </div>
        </div>

        {sessionPosition === 'right' && sidebarPanel}
      </div>
    </div>
  )
}
