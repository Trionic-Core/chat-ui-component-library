import { useCallback, useEffect, useRef, type KeyboardEvent, type ChangeEvent } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowUp, Square } from 'lucide-react'
import { cn } from '../utils/cn'
import { useChatContext } from '../context/chat-context'
import type { ChatInputProps } from '../types'

/**
 * CypherX floating input bar.
 *
 * Design:
 * - Centered, max-width constrained (not full-width)
 * - Rounded pill shape with large border-radius (24px)
 * - Subtle shadow for floating depth (shadow-input token)
 * - Clean placeholder text in muted color
 * - Send button: dark circle with ArrowUp icon, right-aligned
 * - Stop button: replaces send when streaming (Square icon)
 * - Generous internal padding for comfortable typing
 *
 * The input floats above the content visually due to the shadow,
 * creating a layered, premium feel like a messaging app.
 */
export function ChatInput({
  placeholder,
  disabled,
  maxRows = 6,
  addonSlot,
  className,
}: ChatInputProps) {
  const { state, config, send, stop, setInput } = useChatContext()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const resolvedPlaceholder = placeholder ?? config.placeholder ?? 'Reply...'
  const maxLength = config.maxInputLength ?? 10000
  const isStreaming = state.isStreaming
  const inputValue = state.inputValue
  const isDisabled = disabled || false
  const canSend = inputValue.trim().length > 0 && !isStreaming && !isDisabled

  // Show character count when within 10% of max length
  const showCharCount = inputValue.length > maxLength * 0.9
  const isOverLimit = inputValue.length > maxLength

  // Auto-resize the textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    // Reset to single line to get the correct scrollHeight
    textarea.style.height = 'auto'

    // Calculate max height based on maxRows
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 24
    const maxHeight = lineHeight * maxRows
    const newHeight = Math.min(textarea.scrollHeight, maxHeight)

    textarea.style.height = `${newHeight}px`
  }, [maxRows])

  useEffect(() => {
    adjustHeight()
  }, [inputValue, adjustHeight])

  // Auto-focus on mount
  useEffect(() => {
    if (config.autoFocus !== false) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [config.autoFocus])

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value)
    },
    [setInput]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (canSend) {
          send(inputValue)
        }
      }
      // Escape during streaming stops generation
      if (e.key === 'Escape' && isStreaming) {
        stop()
      }
    },
    [canSend, inputValue, isStreaming, send, stop]
  )

  const handleSendClick = useCallback(() => {
    if (isStreaming) {
      stop()
    } else if (canSend) {
      send(inputValue)
      textareaRef.current?.focus()
    }
  }, [isStreaming, canSend, inputValue, send, stop])

  return (
    <div
      className={cn(
        'relative mx-auto flex w-full flex-col gap-1 px-5 pb-4 pt-2 sm:px-8',
        className
      )}
    >
      {/* Floating pill input container */}
      <div
        className="flex items-end gap-2 rounded-[var(--cxc-radius-xl)] px-4 py-3 transition-all duration-200"
        style={{
          backgroundColor: 'var(--cxc-input-bg)',
          boxShadow: 'var(--cxc-shadow-input)',
        }}
      >
        {/* Addon slot (left side -- e.g. attach button) */}
        {addonSlot && (
          <div className="flex shrink-0 items-center pb-0.5">
            {addonSlot}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={resolvedPlaceholder}
          disabled={isDisabled || isStreaming}
          rows={1}
          aria-label="Message input"
          aria-multiline="true"
          className={cn(
            'flex-1 resize-none bg-transparent text-[15px] leading-6 outline-none',
            'placeholder:text-[var(--cxc-text-muted)]',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
          style={{
            color: 'var(--cxc-text)',
            fontFamily: 'var(--cxc-font-sans)',
          }}
        />

        {/* Send / Stop button -- circular, integrated */}
        <AnimatePresence mode="wait">
          <motion.button
            key={isStreaming ? 'stop' : 'send'}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={handleSendClick}
            disabled={!isStreaming && !canSend}
            aria-label={isStreaming ? 'Stop generating' : 'Send message'}
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              'transition-all duration-150',
              'disabled:cursor-not-allowed disabled:opacity-25',
            )}
            style={{
              backgroundColor: (isStreaming || canSend)
                ? 'var(--cxc-text)'
                : 'var(--cxc-border)',
              color: 'var(--cxc-text-inverse)',
            }}
          >
            {isStreaming ? (
              <Square size={12} fill="currentColor" />
            ) : (
              <ArrowUp size={16} strokeWidth={2.5} />
            )}
          </motion.button>
        </AnimatePresence>
      </div>

      {/* Character count (near limit) */}
      {showCharCount && (
        <div
          className="px-2 text-right text-xs"
          style={{
            color: isOverLimit ? 'var(--cxc-error)' : 'var(--cxc-text-muted)',
          }}
        >
          {inputValue.length.toLocaleString()} / {maxLength.toLocaleString()}
        </div>
      )}
    </div>
  )
}
