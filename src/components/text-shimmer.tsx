import type { ElementType, ReactNode, CSSProperties } from 'react'
import { cn } from '../utils/cn'
import type { TextShimmerProps } from '../types'

/**
 * TextShimmer — gradient sweep animation across text.
 *
 * Pure CSS implementation via `background-clip: text` with a sliding
 * linear gradient. No JS animation library required.
 *
 * The gradient has three stops: muted → foreground → muted, sized at
 * 200% width. A single keyframe slides `background-position` from
 * right to left, creating a shimmering highlight effect.
 *
 * Design tokens control the gradient colors (`--cxc-shimmer-*`)
 * so the shimmer adapts to light/dark mode automatically.
 */
export function TextShimmer({
  children,
  as,
  duration = 2,
  spread = 20,
  className,
}: TextShimmerProps) {
  const Component = (as ?? 'span') as ElementType

  const style: CSSProperties = {
    '--cxc-shimmer-duration': `${duration}s`,
  } as CSSProperties

  // Override gradient spread if non-default
  if (spread !== 20) {
    const from = 50 - spread
    const to = 50 + spread
    style.background = `linear-gradient(90deg, var(--cxc-shimmer-from) 0%, var(--cxc-shimmer-from) ${from}%, var(--cxc-shimmer-via) 50%, var(--cxc-shimmer-from) ${to}%, var(--cxc-shimmer-from) 100%)`
    style.backgroundSize = '200% 100%'
    style.WebkitBackgroundClip = 'text'
    style.backgroundClip = 'text'
    style.WebkitTextFillColor = 'transparent'
  }

  return (
    <Component
      className={cn('cxc-text-shimmer', className)}
      style={style}
    >
      {children}
    </Component>
  )
}
