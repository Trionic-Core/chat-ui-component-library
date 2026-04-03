import { useStreamingText } from '../hooks/use-streaming-text'
import { cn } from '../utils/cn'
import type { StreamingTextProps } from '../types'

/**
 * Token-by-token text reveal animation component.
 *
 * Uses requestAnimationFrame-based animation via the useStreamingText hook.
 * Renders text as a <span> with whitespace preservation.
 *
 * When streaming is active (animate=true), shows a blinking cursor
 * after the last revealed character using the .cxc-cursor CSS class.
 */
export function StreamingText({
  text,
  charsPerFrame = 2,
  animate = true,
  onComplete,
  className,
}: StreamingTextProps) {
  const { displayedText, isAnimating } = useStreamingText(text, {
    charsPerFrame,
    enabled: animate,
  })

  // Call onComplete when animation finishes
  if (onComplete && !isAnimating && displayedText === text && animate) {
    // Schedule callback to avoid calling during render
    queueMicrotask(onComplete)
  }

  return (
    <span className={cn('whitespace-pre-wrap', className)}>
      {displayedText}
      {isAnimating && (
        <span
          className="cxc-cursor inline-block w-0.5 align-text-bottom"
          style={{
            height: '1.1em',
            backgroundColor: 'var(--cxc-text)',
            marginLeft: '1px',
          }}
          aria-hidden="true"
        />
      )}
    </span>
  )
}
