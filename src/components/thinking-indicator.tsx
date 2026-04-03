import { motion, AnimatePresence } from 'motion/react'
import { cn } from '../utils/cn'
import { TextShimmer } from './text-shimmer'
import type { ThinkingIndicatorProps } from '../types'

/**
 * ThinkingIndicator v0.2.0 — TextShimmer-based thinking state.
 *
 * Renders the label text (default "Thinking...") with a gradient
 * shimmer sweep animation. Clean, minimal, no extra chrome.
 *
 * The gradient colors adapt to light/dark mode via CSS tokens.
 * Fades in/out via AnimatePresence for smooth mount/unmount.
 */
export function ThinkingIndicator({
  label = 'Thinking',
  className,
}: ThinkingIndicatorProps) {
  return (
    <AnimatePresence>
      <motion.div
        role="status"
        aria-label="AI is thinking"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={cn('py-2', className)}
      >
        <TextShimmer duration={1.5} className="text-[13px] font-medium">
          {label}...
        </TextShimmer>
      </motion.div>
    </AnimatePresence>
  )
}
