import { motion } from 'motion/react'
import { Sparkles } from 'lucide-react'
import { cn } from '../utils/cn'
import type { EmptyStateProps } from '../types'

/**
 * Welcome screen displayed when there are no messages.
 *
 * CypherX empty state design:
 * - Centered vertically and horizontally
 * - Warm, minimal aesthetic
 * - "How can I help you?" in a warm, confident font
 * - Subtle description text
 * - Suggestion chips: clean rounded pills with hover lift
 * - No heavy icon or ornament -- content-first
 *
 * The sparkles icon is subtle and warm-toned, setting the
 * expectation of an intelligent, helpful assistant.
 */
export function EmptyState({
  icon,
  title = 'How can I help you?',
  description = 'Ask me anything to get started.',
  suggestions,
  onSuggestionClick,
  className,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn(
        'flex flex-1 flex-col items-center justify-center px-6 py-16',
        className
      )}
    >
      {/* Icon */}
      <div
        className="mb-6"
        aria-hidden="true"
      >
        {icon ?? (
          <Sparkles
            size={32}
            strokeWidth={1.5}
            style={{ color: 'var(--cxc-text-muted)' }}
          />
        )}
      </div>

      {/* Title -- warm, serif-like feel via font-weight */}
      <h2
        className="mb-2 text-xl font-medium tracking-tight"
        style={{
          color: 'var(--cxc-text)',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h2>

      {/* Description */}
      <p
        className="mb-8 max-w-sm text-center text-[15px]"
        style={{ color: 'var(--cxc-text-muted)' }}
      >
        {description}
      </p>

      {/* Suggestion chips */}
      {suggestions && suggestions.length > 0 && (
        <div
          className="flex max-w-lg flex-wrap items-center justify-center gap-2.5"
          role="list"
          aria-label="Suggested prompts"
        >
          {suggestions.map((suggestion, index) => (
            <motion.button
              key={suggestion}
              role="listitem"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.3,
                delay: index * 0.05,
                ease: 'easeOut',
              }}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSuggestionClick?.(suggestion)}
              className={cn(
                'rounded-full border px-4 py-2.5 text-[14px]',
                'transition-all duration-150',
              )}
              style={{
                borderColor: 'var(--cxc-border)',
                color: 'var(--cxc-text-secondary)',
                backgroundColor: 'var(--cxc-bg)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--cxc-bg-subtle)'
                e.currentTarget.style.borderColor = 'var(--cxc-border-focus)'
                e.currentTarget.style.color = 'var(--cxc-text)'
                e.currentTarget.style.boxShadow = 'var(--cxc-shadow-sm)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--cxc-bg)'
                e.currentTarget.style.borderColor = 'var(--cxc-border)'
                e.currentTarget.style.color = 'var(--cxc-text-secondary)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {suggestion}
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  )
}
