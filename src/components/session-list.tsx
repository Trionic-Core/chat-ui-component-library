import { useCallback, useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Plus, Trash2, MessageSquare } from 'lucide-react'
import { cn } from '../utils/cn'
import { formatRelativeTime } from '../utils/format-time'
import { useChatContext } from '../context/chat-context'
import type { SessionListProps, ChatSession } from '../types'

/**
 * Renders a single session row in the sidebar list.
 */
function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
}: {
  session: ChatSession
  isActive: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [showDelete, setShowDelete] = useState(false)

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDelete(session.id)
    },
    [onDelete, session.id]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        onDelete(session.id)
      }
    },
    [onDelete, session.id]
  )

  return (
    <motion.button
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8, height: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      type="button"
      onClick={() => onSelect(session.id)}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
      onFocus={() => setShowDelete(true)}
      onBlur={() => setShowDelete(false)}
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left',
        'transition-colors duration-100',
        'focus-visible:outline-none focus-visible:ring-2',
      )}
      style={{
        backgroundColor: isActive ? 'var(--cxc-sidebar-active)' : 'transparent',
        color: 'var(--cxc-text)',
      }}
      onMouseOver={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'var(--cxc-sidebar-hover)'
        }
      }}
      onMouseOut={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'transparent'
        }
      }}
      aria-label={`Session: ${session.title}`}
      aria-current={isActive ? 'true' : undefined}
    >
      <div className="min-w-0 flex-1">
        {/* Title -- truncated to 1 line */}
        <p
          className="truncate text-sm font-medium"
          style={{
            color: isActive ? 'var(--cxc-accent)' : 'var(--cxc-text)',
          }}
        >
          {session.title}
        </p>

        {/* Metadata row: relative time + message count */}
        <div className="mt-0.5 flex items-center gap-2">
          <span
            className="text-xs"
            style={{ color: 'var(--cxc-text-muted)' }}
          >
            {formatRelativeTime(session.updatedAt)}
          </span>

          {session.messageCount > 0 && (
            <span
              className="flex items-center gap-0.5 text-xs"
              style={{ color: 'var(--cxc-text-muted)' }}
            >
              <MessageSquare size={10} />
              {session.messageCount}
            </span>
          )}
        </div>
      </div>

      {/* Delete button -- appears on hover */}
      <AnimatePresence>
        {showDelete && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.1 }}
            role="button"
            tabIndex={0}
            onClick={handleDelete}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onDelete(session.id)
              }
            }}
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded',
              'transition-colors duration-100',
              'hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-1',
            )}
            style={{ color: 'var(--cxc-text-muted)' }}
            onMouseOver={(e) => {
              e.currentTarget.style.color = 'var(--cxc-error)'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = 'var(--cxc-text-muted)'
            }}
            aria-label={`Delete session: ${session.title}`}
          >
            <Trash2 size={14} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

/**
 * Loading skeleton for the session list while sessions are being fetched.
 */
function SessionSkeleton() {
  return (
    <div className="space-y-1 px-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 animate-pulse"
        >
          <div className="min-w-0 flex-1 space-y-2">
            <div
              className="h-3.5 rounded"
              style={{
                backgroundColor: 'var(--cxc-border)',
                width: `${60 + i * 10}%`,
              }}
            />
            <div
              className="h-2.5 rounded"
              style={{
                backgroundColor: 'var(--cxc-border-subtle)',
                width: '40%',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Session sidebar panel showing chat history.
 *
 * Features:
 * - "New Chat" button at top with Plus icon
 * - Scrollable list of sessions sorted by updatedAt descending
 * - Each session shows: title (truncated), relative time, message count badge
 * - Active session highlighted with accent background
 * - Delete button appears on hover
 * - Animated list with AnimatePresence for add/remove transitions
 * - Loading skeleton while sessions are being fetched
 * - Empty state when no sessions exist
 * - Keyboard navigation: Arrow Up/Down, Enter to select, Delete to remove
 *
 * Data source: Reads from ChatContext (sessions array from useSessionManager).
 */
export function SessionList({
  onSelectSession,
  onNewConversation,
  className,
}: SessionListProps) {
  const { state, loadSession, deleteSession, newConversation } = useChatContext()
  const { sessions, activeSessionId } = state
  const listRef = useRef<HTMLDivElement>(null)

  const handleSelect = useCallback(
    (sessionId: string) => {
      onSelectSession?.(sessionId)
      loadSession(sessionId)
    },
    [onSelectSession, loadSession]
  )

  const handleDelete = useCallback(
    (sessionId: string) => {
      deleteSession(sessionId)
    },
    [deleteSession]
  )

  const handleNewChat = useCallback(() => {
    onNewConversation?.()
    newConversation()
  }, [onNewConversation, newConversation])

  // Keyboard navigation within the session list
  const handleListKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const items = listRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="button"], button[aria-label^="Session"]'
      )
      if (!items?.length) return

      const currentIndex = Array.from(items).findIndex(
        (item) => item === document.activeElement
      )

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0
        items[next].focus()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1
        items[prev].focus()
      }
    },
    []
  )

  return (
    <nav
      className={cn(
        'flex h-full flex-col',
        className
      )}
      style={{
        backgroundColor: 'var(--cxc-sidebar-bg)',
        width: 'var(--cxc-sidebar-width)',
      }}
      aria-label="Chat sessions"
    >
      {/* New Chat button */}
      <div
        className="shrink-0 p-3"
        style={{ borderBottom: '1px solid var(--cxc-border-subtle)' }}
      >
        <button
          type="button"
          onClick={handleNewChat}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium',
            'transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2',
          )}
          style={{
            backgroundColor: 'var(--cxc-accent)',
            color: 'var(--cxc-text-inverse)',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--cxc-accent-hover)'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--cxc-accent)'
          }}
          aria-label="Start a new conversation"
        >
          <Plus size={16} />
          New Chat
        </button>
      </div>

      {/* Session list */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto cxc-scrollbar p-2"
        onKeyDown={handleListKeyDown}
      >
        {sessions.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center px-4 py-8">
            <MessageSquare
              size={32}
              style={{ color: 'var(--cxc-text-muted)' }}
              aria-hidden="true"
            />
            <p
              className="mt-3 text-sm text-center"
              style={{ color: 'var(--cxc-text-muted)' }}
            >
              No previous conversations
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                onSelect={handleSelect}
                onDelete={handleDelete}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </nav>
  )
}
