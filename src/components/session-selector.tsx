import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown, Plus, Check } from 'lucide-react'
import { cn } from '../utils/cn'
import { formatRelativeTime } from '../utils/format-time'
import { useChatContext } from '../context/chat-context'
import type { SessionSelectorProps } from '../types'

/**
 * Compact dropdown version of the session list for mobile and header use.
 *
 * Features:
 * - Button showing current session title (or "New Chat")
 * - Dropdown with session list on click
 * - "New Chat" option at top of dropdown
 * - ChevronDown indicator
 * - Click outside to close
 * - Keyboard navigation (Escape to close, ArrowDown/Up to navigate)
 * - Uses the same session data from ChatContext
 */
export function SessionSelector({ className }: SessionSelectorProps) {
  const { state, loadSession, newConversation } = useChatContext()
  const { sessions, activeSessionId } = state
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Find active session title
  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const buttonLabel = activeSession?.title ?? 'New Chat'

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      loadSession(sessionId)
      close()
    },
    [loadSession, close]
  )

  const handleNewChat = useCallback(() => {
    newConversation()
    close()
  }, [newConversation, close])

  // Close dropdown on click outside
  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }

      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setIsOpen(true)
        }
        return
      }

      const items = dropdownRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[data-session-item]'
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
    [isOpen, close]
  )

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger button */}
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
          'transition-colors duration-100',
          'focus-visible:outline-none focus-visible:ring-2',
        )}
        style={{
          backgroundColor: 'var(--cxc-bg-subtle)',
          color: 'var(--cxc-text)',
          border: '1px solid var(--cxc-border)',
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Current session: ${buttonLabel}. Click to switch sessions.`}
      >
        <span className="max-w-[180px] truncate">{buttonLabel}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown
            size={14}
            style={{ color: 'var(--cxc-text-muted)' }}
            aria-hidden="true"
          />
        </motion.span>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={cn(
              'absolute left-0 top-full z-50 mt-1 w-64',
              'max-h-80 overflow-y-auto rounded-lg cxc-scrollbar',
            )}
            style={{
              backgroundColor: 'var(--cxc-bg)',
              border: '1px solid var(--cxc-border)',
              boxShadow: 'var(--cxc-shadow-lg)',
            }}
            role="listbox"
            aria-label="Chat sessions"
          >
            {/* New Chat option */}
            <button
              type="button"
              data-session-item
              onClick={handleNewChat}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2.5 text-sm',
                'transition-colors duration-100',
                'focus-visible:outline-none focus-visible:bg-[var(--cxc-sidebar-hover)]',
              )}
              style={{
                color: 'var(--cxc-accent)',
                borderBottom: '1px solid var(--cxc-border-subtle)',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--cxc-sidebar-hover)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
              role="option"
              aria-selected={!activeSessionId}
            >
              <Plus size={14} />
              <span className="font-medium">New Chat</span>
            </button>

            {/* Session items */}
            {sessions.length === 0 ? (
              <div
                className="px-3 py-4 text-center text-sm"
                style={{ color: 'var(--cxc-text-muted)' }}
              >
                No previous conversations
              </div>
            ) : (
              sessions.map((session) => {
                const isActive = session.id === activeSessionId
                return (
                  <button
                    key={session.id}
                    type="button"
                    data-session-item
                    onClick={() => handleSelectSession(session.id)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm',
                      'transition-colors duration-100',
                      'focus-visible:outline-none',
                    )}
                    style={{
                      backgroundColor: isActive
                        ? 'var(--cxc-sidebar-active)'
                        : 'transparent',
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
                    role="option"
                    aria-selected={isActive}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate font-medium"
                        style={{
                          color: isActive ? 'var(--cxc-accent)' : 'var(--cxc-text)',
                        }}
                      >
                        {session.title}
                      </p>
                      <span
                        className="text-xs"
                        style={{ color: 'var(--cxc-text-muted)' }}
                      >
                        {formatRelativeTime(session.updatedAt)}
                      </span>
                    </div>

                    {isActive && (
                      <Check
                        size={14}
                        className="shrink-0"
                        style={{ color: 'var(--cxc-accent)' }}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                )
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
