import { useCallback, useRef, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { cn } from '../utils/cn'

/**
 * CypherX Mode Switch.
 *
 * Design:
 * - Compact pill-shaped toggle with sliding indicator
 * - Uses design tokens for consistent theming (light + dark)
 * - Smooth spring animation on the active indicator
 * - Each option has an icon + label
 * - Active state: filled background with inverse text
 * - Inactive state: transparent with muted text
 */

export interface ModeSwitchOption {
  /** Unique value for this option */
  value: string
  /** Display label */
  label: string
  /** Optional icon (React node, e.g., lucide-react icon) */
  icon?: React.ReactNode
}

export interface ModeSwitchProps {
  /** The available options (2-4 items) */
  options: ModeSwitchOption[]
  /** Currently active value */
  value: string
  /** Called when the user selects a different option */
  onChange: (value: string) => void
  /** Additional CSS class */
  className?: string
}

export function ModeSwitch({ options, value, onChange, className }: ModeSwitchProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })

  // Measure the active button and position the sliding indicator
  const updateIndicator = useCallback(() => {
    const activeBtn = buttonRefs.current.get(value)
    const container = containerRef.current
    if (!activeBtn || !container) return

    const containerRect = container.getBoundingClientRect()
    const btnRect = activeBtn.getBoundingClientRect()

    setIndicatorStyle({
      left: btnRect.left - containerRect.left,
      width: btnRect.width,
    })
  }, [value])

  useEffect(() => {
    updateIndicator()
    // Re-measure on resize
    window.addEventListener('resize', updateIndicator)
    return () => window.removeEventListener('resize', updateIndicator)
  }, [updateIndicator])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex items-center gap-0.5 rounded-full p-[3px]',
        className,
      )}
      style={{
        backgroundColor: 'var(--cxc-bg-muted)',
      }}
    >
      {/* Sliding indicator */}
      <motion.div
        className="absolute top-[3px] bottom-[3px] rounded-full"
        style={{
          backgroundColor: 'var(--cxc-text)',
        }}
        animate={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
        }}
        transition={{
          type: 'spring',
          stiffness: 500,
          damping: 35,
          mass: 0.8,
        }}
      />

      {/* Option buttons */}
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            ref={(el) => {
              if (el) buttonRefs.current.set(option.value, el)
            }}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5',
              'text-xs font-medium transition-colors duration-150',
              'outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
            )}
            style={{
              color: isActive
                ? 'var(--cxc-text-inverse)'
                : 'var(--cxc-text-muted)',
              fontFamily: 'var(--cxc-font-sans)',
              letterSpacing: 'var(--cxc-letter-spacing)',
            }}
            aria-pressed={isActive}
          >
            {option.icon && (
              <span className="flex shrink-0 items-center">{option.icon}</span>
            )}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
