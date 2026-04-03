import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { MessageCircle, X, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '../utils/cn'
import { useChatContext } from '../context/chat-context'
import { MessageList } from './message-list'
import { PromptInput } from './prompt-input'
import { EmptyState } from './empty-state'
import type { ChatWidgetProps } from '../types'

/**
 * ChatWidget v0.2.0 — floating chat panel with FAB trigger.
 *
 * Features:
 * - FAB button at bottom-right/left to open
 * - Fixed panel with configurable width/height
 * - Expand button to go near full-screen
 * - Compact mode when collapsed, full mode when expanded
 * - Escape to close, click outside to close
 */
export function ChatWidget({
  position = 'bottom-right',
  defaultOpen = false,
  width = '420px',
  height = '600px',
  fabIcon,
  fabLabel,
  className,
  emptyState,
  inputAddonSlot,
  headerSlot,
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const { state } = useChatContext()
  const { messages } = state
  const containerRef = useRef<HTMLDivElement>(null)

  const hasMessages = messages.length > 0
  const isRight = position === 'bottom-right'

  const close = useCallback(() => {
    setIsOpen(false)
    setIsExpanded(false)
  }, [])

  const toggle = useCallback(() => setIsOpen((prev) => !prev), [])

  // Fade out → snap dimensions → fade in
  const toggleExpand = useCallback(() => {
    setIsTransitioning(true)
    setTimeout(() => {
      setIsExpanded((prev) => !prev)
      setTimeout(() => setIsTransitioning(false), 50)
    }, 120)
  }, [])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isExpanded) {
          setIsExpanded(false)
        } else {
          setIsOpen(false)
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, isExpanded])

  // Close on click outside (only when not expanded)
  useEffect(() => {
    if (!isOpen || isExpanded) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 50)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [isOpen, isExpanded])

  // Panel dimensions based on expanded state
  const panelStyle = isExpanded
    ? {
        bottom: '20px',
        left: '20px',
        right: '20px',
        top: '20px',
        width: 'auto',
        height: 'auto',
      }
    : {
        bottom: '20px',
        [isRight ? 'right' : 'left']: '20px',
        width,
        height,
      }

  return (
    <div
      ref={containerRef}
      className={cn(
        'fixed z-50',
        isRight ? 'right-5 bottom-5' : 'left-5 bottom-5',
        className
      )}
      style={{ fontFamily: 'var(--cxc-font-sans)' }}
    >
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Overlay when expanded */}
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-40"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                aria-hidden="true"
              />
            )}

            {/* Chat panel */}
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{
                opacity: isTransitioning ? 0 : 1,
                y: 0,
                scale: 1,
              }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="cxc-root cxc-compact fixed z-50 flex flex-col overflow-hidden rounded-[16px]"
              style={{
                backgroundColor: 'var(--cxc-bg)',
                boxShadow: '0 8px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)',
                ...panelStyle,
              }}
              role="dialog"
              aria-label="Chat assistant"
              aria-modal="true"
            >
              <WidgetInner
                hasMessages={hasMessages}
                headerSlot={headerSlot}
                emptyState={emptyState}
                inputAddonSlot={inputAddonSlot}
                close={close}
                isExpanded={isExpanded}
                toggleExpand={toggleExpand}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* FAB button */}
      <motion.button
        animate={{
          scale: isOpen ? 0 : 1,
          opacity: isOpen ? 0 : 1,
        }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        onClick={toggle}
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full',
          'transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          isOpen && 'pointer-events-none',
        )}
        style={{
          backgroundColor: 'var(--cxc-text)',
          color: 'var(--cxc-text-inverse)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}
        aria-label={fabLabel ?? 'Open chat'}
        title={fabLabel ?? 'Open chat'}
        tabIndex={isOpen ? -1 : 0}
      >
        {fabIcon ?? <MessageCircle size={24} />}
      </motion.button>
    </div>
  )
}

/**
 * Header action button helper.
 */
function HeaderButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full',
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
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}

/**
 * Inner content for the widget panel.
 */
function WidgetInner({
  hasMessages,
  headerSlot,
  emptyState,
  inputAddonSlot,
  close,
  isExpanded,
  toggleExpand,
}: {
  hasMessages: boolean
  headerSlot?: React.ReactNode
  emptyState?: React.ReactNode
  inputAddonSlot?: React.ReactNode
  close: () => void
  isExpanded: boolean
  toggleExpand: () => void
}) {
  return (
    <>
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--cxc-border-subtle)' }}
      >
        <div className="flex items-center gap-2">
          {headerSlot ?? (
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--cxc-text)' }}
            >
              Chat
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <HeaderButton
            onClick={toggleExpand}
            label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </HeaderButton>
          <HeaderButton onClick={close} label="Close chat">
            <X size={16} />
          </HeaderButton>
        </div>
      </div>

      {/* Messages */}
      <div className="flex flex-1 flex-col min-h-0">
        {hasMessages ? (
          <MessageList />
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {emptyState ?? <EmptyState />}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0">
        <PromptInput addonSlot={inputAddonSlot} />
      </div>
    </>
  )
}
