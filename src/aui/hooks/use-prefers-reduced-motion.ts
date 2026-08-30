import { useEffect, useState } from 'react'

/** The media query the OS accessibility setting drives. */
const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Whether the reader has asked their system for reduced motion.
 *
 * A chart's entrance animation is decoration: it carries no information the
 * static chart does not. For a reader with vestibular sensitivity it is not
 * decoration, it is a symptom trigger — so the setting is an instruction, not
 * a hint. Charts gate `isAnimationActive` on it.
 *
 * Starts false so server rendering and the first client frame agree, then
 * corrects on mount and follows the setting if it changes mid-session.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const query = window.matchMedia(QUERY)
    setReduced(query.matches)

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduced
}
