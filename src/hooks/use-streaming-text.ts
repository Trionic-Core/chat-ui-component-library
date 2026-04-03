import { useCallback, useEffect, useRef, useState } from 'react'

interface UseStreamingTextOptions {
  /** Characters revealed per animation frame. Default: 2. */
  charsPerFrame?: number
  /** Whether animation is enabled. Default: true. */
  enabled?: boolean
}

/**
 * Character-by-character text animation using requestAnimationFrame.
 *
 * Tracks a cursor position within the full text. Each animation frame
 * advances the cursor by `charsPerFrame` characters. When the full text
 * grows (streaming), the animation smoothly catches up from the current
 * cursor position.
 *
 * When `enabled` is false, returns the full text immediately with no animation.
 */
export function useStreamingText(
  fullText: string,
  options?: UseStreamingTextOptions
): {
  displayedText: string
  isAnimating: boolean
} {
  const { charsPerFrame = 2, enabled = true } = options ?? {}

  const [displayedText, setDisplayedText] = useState(enabled ? '' : fullText)
  const [isAnimating, setIsAnimating] = useState(false)

  const cursorRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const fullTextRef = useRef(fullText)

  // Keep fullText ref in sync
  fullTextRef.current = fullText

  const animate = useCallback(() => {
    const target = fullTextRef.current
    if (cursorRef.current >= target.length) {
      setIsAnimating(false)
      rafRef.current = null
      return
    }

    cursorRef.current = Math.min(cursorRef.current + charsPerFrame, target.length)
    setDisplayedText(target.slice(0, cursorRef.current))

    rafRef.current = requestAnimationFrame(animate)
  }, [charsPerFrame])

  useEffect(() => {
    if (!enabled) {
      // When animation is disabled, show full text immediately
      cursorRef.current = fullText.length
      setDisplayedText(fullText)
      setIsAnimating(false)
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      return
    }

    // If the text grew and we're not already animating, start animation
    if (fullText.length > cursorRef.current && rafRef.current === null) {
      setIsAnimating(true)
      rafRef.current = requestAnimationFrame(animate)
    }

    // Cleanup on unmount
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [fullText, enabled, animate])

  return {
    displayedText: enabled ? displayedText : fullText,
    isAnimating,
  }
}
