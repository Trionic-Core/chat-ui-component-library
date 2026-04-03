import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Smart auto-scroll hook with user override detection.
 *
 * Uses IntersectionObserver on a sentinel element at the bottom of the scroll
 * container for efficient bottom detection, avoiding expensive scroll event
 * calculations on every frame.
 *
 * Algorithm:
 * 1. Observes a sentinel div at the bottom of the scroll container.
 * 2. If the sentinel is visible, the user is "at the bottom."
 * 3. On dependency change (new message), if at bottom, auto-scroll. Otherwise increment unreadCount.
 * 4. scrollToBottom() scrolls and resets unreadCount.
 */
export function useChatScroll(
  deps: unknown[]
): {
  scrollRef: React.RefObject<HTMLDivElement | null>
  bottomRef: React.RefObject<HTMLDivElement | null>
  isAtBottom: boolean
  unreadCount: number
  scrollToBottom: (behavior?: ScrollBehavior) => void
} {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  // Track whether we should auto-scroll (user hasn't scrolled up)
  const isAtBottomRef = useRef(true)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior, block: 'end' })
    }
    setUnreadCount(0)
    setIsAtBottom(true)
    isAtBottomRef.current = true
  }, [])

  // IntersectionObserver for efficient bottom detection
  useEffect(() => {
    const sentinel = bottomRef.current
    const container = scrollRef.current
    if (!sentinel || !container) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry) {
          const atBottom = entry.isIntersecting
          isAtBottomRef.current = atBottom
          setIsAtBottom(atBottom)
          if (atBottom) {
            setUnreadCount(0)
          }
        }
      },
      {
        root: container,
        // Threshold of 0 means "any part of the sentinel is visible"
        threshold: 0,
        // Small margin at the bottom to trigger slightly before the exact bottom
        rootMargin: '0px 0px 100px 0px',
      }
    )

    observer.observe(sentinel)

    return () => {
      observer.disconnect()
    }
  }, [])

  // Auto-scroll when dependencies change (typically messages.length)
  useEffect(() => {
    if (isAtBottomRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated before scrolling
      requestAnimationFrame(() => {
        scrollToBottom('smooth')
      })
    } else {
      // User has scrolled up, increment unread count
      setUnreadCount((prev) => prev + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return {
    scrollRef,
    bottomRef,
    isAtBottom,
    unreadCount,
    scrollToBottom,
  }
}
