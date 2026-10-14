import { useCallback, useEffect, useRef, useState } from 'react'

/** Follow growing content until the reader scrolls upward; never scroll the host page. */
export function useChatScroll(deps: unknown[], messageCount?: number): {
  scrollRef: React.RefObject<HTMLDivElement | null>
  bottomRef: React.RefObject<HTMLDivElement | null>
  isAtBottom: boolean
  unreadCount: number
  scrollToBottom: (behavior?: ScrollBehavior) => void
} {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const followRef = useRef(true)
  const lastTopRef = useRef(0)
  const frameRef = useRef<number | null>(null)
  const countRef = useRef(messageCount)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = scrollRef.current
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior })
      // Scroll events can be coalesced with the reader's next scroll.
      lastTopRef.current = container.scrollTop
    }
    followRef.current = true
    setUnreadCount(0)
    setIsAtBottom(true)
  }, [])

  const cancelScroll = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }, [])

  const scheduleScroll = useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      if (followRef.current) scrollToBottom('instant')
    })
  }, [scrollToBottom])

  useEffect(() => {
    const container = scrollRef.current
    const sentinel = bottomRef.current
    if (!container || !sentinel) return
    lastTopRef.current = container.scrollTop
    const onScroll = () => {
      const top = container.scrollTop
      const atBottom = container.scrollHeight - container.clientHeight - top <= 100
      if (atBottom) {
        followRef.current = true
        setUnreadCount(0)
      } else if (top < lastTopRef.current) {
        followRef.current = false
      }
      lastTopRef.current = top
      setIsAtBottom(atBottom)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return
      // Observer records can describe an older layout; read the current one.
      const atBottom = container.scrollHeight - container.clientHeight - container.scrollTop <= 100
      setIsAtBottom(atBottom)
      if (atBottom) setUnreadCount(0)
      // Content growth can hide the sentinel without any user scrolling.
    }, { root: container, threshold: 0, rootMargin: '0px 0px 100px 0px' })
    observer.observe(sentinel)
    const resize = new ResizeObserver(() => { if (followRef.current) scheduleScroll() })
    if (sentinel.parentElement) resize.observe(sentinel.parentElement)
    return () => {
      container.removeEventListener('scroll', onScroll)
      observer.disconnect()
      resize.disconnect()
      cancelScroll()
    }
  }, [cancelScroll, scheduleScroll])

  useEffect(() => {
    const container = scrollRef.current
    // A render can arrive before the browser dispatches the reader's scroll.
    if (container && container.scrollTop < lastTopRef.current &&
      container.scrollHeight - container.clientHeight - container.scrollTop > 100) {
      followRef.current = false
    }
    const added = messageCount === undefined ? 1 : Math.max(0, messageCount - (countRef.current ?? messageCount))
    countRef.current = messageCount
    if (messageCount === 0) {
      followRef.current = true
      setUnreadCount(0)
    }
    if (followRef.current) scheduleScroll()
    else if (added) setUnreadCount(count => count + added)
    return cancelScroll
    // Caller-owned dependencies describe content changes; count excludes token updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, messageCount])

  return { scrollRef, bottomRef, isAtBottom, unreadCount, scrollToBottom }
}
