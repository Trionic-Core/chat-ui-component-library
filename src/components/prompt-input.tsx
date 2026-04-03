import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowUp, Square, Plus, Paperclip, X } from 'lucide-react'
import { cn } from '../utils/cn'
import { useChatContext } from '../context/chat-context'
import type { PromptInputProps, FileAttachment } from '../types'

let fileIdCounter = 0
function createFileAttachment(file: File): FileAttachment {
  return {
    id: `file_${Date.now()}_${++fileIdCounter}`,
    file,
    name: file.name,
    size: file.size,
    type: file.type,
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

/**
 * PromptInput v0.2.0 — ChatGPT/PromptKit-style two-row input.
 *
 * Layout:
 * ┌────────────────────────────────────────────┐
 * │  [textarea - full width]                    │
 * │                                             │
 * │  [+] [addon slots]  ·············  [send]   │
 * └────────────────────────────────────────────┘
 *
 * - Textarea on top, takes full width.
 * - Action bar on bottom: attach (+), addon buttons on left, send on right.
 * - Rounded container with subtle border + shadow.
 * - File attachment previews between textarea and action bar.
 * - Suggestion chips rendered above the container.
 */
export function PromptInput({
  placeholder,
  disabled,
  maxRows = 6,
  maxHeight = 240,
  allowAttachments = false,
  acceptFileTypes,
  onFilesAttached,
  suggestions,
  onSuggestionClick,
  addonSlot,
  className,
}: PromptInputProps) {
  const { state, config, send, stop, setInput } = useChatContext()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const resolvedPlaceholder = placeholder ?? config.placeholder ?? 'Message...'
  const maxLength = config.maxInputLength ?? 10000
  const isStreaming = state.isStreaming
  const inputValue = state.inputValue
  const isDisabled = disabled || false
  const canSend = inputValue.trim().length > 0 && !isStreaming && !isDisabled
  const showCharCount = inputValue.length > maxLength * 0.9
  const isOverLimit = inputValue.length > maxLength
  const showSuggestions = suggestions && suggestions.length > 0 && !inputValue && !isStreaming

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 24
    const maxByRows = lineHeight * maxRows
    const limit = Math.min(maxByRows, maxHeight)
    textarea.style.height = `${Math.min(textarea.scrollHeight, limit)}px`
  }, [maxRows, maxHeight])

  useEffect(() => {
    adjustHeight()
  }, [inputValue, adjustHeight])

  // Auto-focus
  useEffect(() => {
    if (config.autoFocus !== false) {
      const timer = setTimeout(() => textareaRef.current?.focus(), 100)
      return () => clearTimeout(timer)
    }
  }, [config.autoFocus])

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value),
    [setInput]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (canSend) send(inputValue)
      }
      if (e.key === 'Escape' && isStreaming) stop()
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

  // --- File attachment handlers ---
  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const newAttachments = Array.from(files).map(createFileAttachment)
      setAttachments((prev) => [...prev, ...newAttachments])
      onFilesAttached?.(newAttachments)
    },
    [onFilesAttached]
  )

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const handleFileClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        addFiles(e.target.files)
        e.target.value = ''
      }
    },
    [addFiles]
  )

  // Drag and drop
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current = 0
      setIsDragging(false)
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
    },
    [addFiles]
  )

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      if (onSuggestionClick) {
        onSuggestionClick(suggestion)
      } else {
        setInput(suggestion)
        setTimeout(() => send(suggestion), 50)
      }
    },
    [onSuggestionClick, setInput, send]
  )

  return (
    <div
      className={cn(
        'cxc-prompt-input-wrap relative mx-auto flex w-full flex-col gap-2 px-5 pb-4 pt-2 sm:px-8',
        className
      )}
    >
      {/* Suggestion chips */}
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="flex flex-wrap gap-2 pb-1"
          >
            {suggestions!.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className={cn(
                  'px-3.5 py-1.5 text-[13px]',
                  'rounded-[var(--cxc-radius-full)]',
                  'transition-colors duration-100',
                  'focus-visible:outline-none focus-visible:ring-2',
                  'focus-visible:ring-[var(--cxc-border-focus)]',
                )}
                style={{
                  backgroundColor: 'var(--cxc-bg-subtle)',
                  color: 'var(--cxc-text-secondary)',
                  border: '1px solid var(--cxc-border-subtle)',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--cxc-bg-muted)'
                  e.currentTarget.style.borderColor = 'var(--cxc-border)'
                  e.currentTarget.style.color = 'var(--cxc-text)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--cxc-bg-subtle)'
                  e.currentTarget.style.borderColor = 'var(--cxc-border-subtle)'
                  e.currentTarget.style.color = 'var(--cxc-text-secondary)'
                }}
              >
                {suggestion}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Two-row input container */}
      <div
        className={cn(
          'relative flex flex-col rounded-[20px]',
          'transition-all duration-200',
          isDragging && 'ring-2 ring-[var(--cxc-border-focus)]',
        )}
        style={{
          backgroundColor: 'var(--cxc-input-bg)',
          border: '1px solid var(--cxc-input-border)',
          boxShadow: 'var(--cxc-shadow-sm)',
        }}
        onDragEnter={allowAttachments ? handleDragEnter : undefined}
        onDragLeave={allowAttachments ? handleDragLeave : undefined}
        onDragOver={allowAttachments ? handleDragOver : undefined}
        onDrop={allowAttachments ? handleDrop : undefined}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-[20px]"
            style={{ backgroundColor: 'var(--cxc-bg-overlay)' }}
          >
            <span className="text-sm font-medium" style={{ color: 'var(--cxc-text-inverse)' }}>
              Drop files here
            </span>
          </div>
        )}

        {/* File attachment previews (above textarea, like prompt-kit) */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-2 px-3 py-2 rounded-[var(--cxc-radius-md)] text-sm"
                style={{
                  backgroundColor: 'var(--cxc-bg-muted)',
                  color: 'var(--cxc-text-secondary)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <Paperclip size={14} style={{ color: 'var(--cxc-text-muted)' }} />
                <span className="truncate max-w-[120px]">{attachment.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  className="rounded-full p-1 transition-colors duration-100"
                  style={{ color: 'var(--cxc-text-muted)' }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.color = 'var(--cxc-text)'
                    e.currentTarget.style.backgroundColor = 'var(--cxc-bg-subtle)'
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.color = 'var(--cxc-text-muted)'
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                  aria-label={`Remove ${attachment.name}`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea (full width) */}
        <div
          className={cn('px-4 pb-1', attachments.length > 0 ? 'pt-2' : 'pt-3.5')}
          onClick={() => textareaRef.current?.focus()}
        >
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
              'w-full resize-none bg-transparent text-[15px] leading-6 outline-none',
              'placeholder:text-[var(--cxc-text-muted)]',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
            style={{
              color: 'var(--cxc-text)',
              fontFamily: 'var(--cxc-font-sans)',
            }}
          />
        </div>

        {/* Row 2: Action bar (buttons left, send right) */}
        <div className="flex items-center justify-between px-3 pb-3 pt-1">
          {/* Left side: action buttons */}
          <div className="flex items-center gap-1">
            {/* Attach button (+) */}
            {allowAttachments && (
              <button
                type="button"
                onClick={handleFileClick}
                className={cn(
                  'flex h-8 w-8 items-center justify-center',
                  'rounded-full',
                  'transition-colors duration-100',
                  'focus-visible:outline-none focus-visible:ring-2',
                  'focus-visible:ring-[var(--cxc-border-focus)]',
                )}
                style={{
                  color: 'var(--cxc-text-secondary)',
                  border: '1px solid var(--cxc-border)',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--cxc-bg-muted)'
                  e.currentTarget.style.color = 'var(--cxc-text)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = 'var(--cxc-text-secondary)'
                }}
                aria-label="Attach files"
              >
                <Plus size={16} strokeWidth={1.8} />
              </button>
            )}

            {/* Addon slot (custom action buttons) */}
            {addonSlot && (
              <div className="flex items-center gap-1">
                {addonSlot}
              </div>
            )}

            {/* Hidden file input */}
            {allowAttachments && (
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={acceptFileTypes}
                onChange={handleFileChange}
                className="hidden"
                aria-hidden="true"
              />
            )}
          </div>

          {/* Right side: send/stop button */}
          <AnimatePresence mode="wait">
            <motion.button
              key={isStreaming ? 'stop' : 'send'}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              onClick={handleSendClick}
              disabled={!isStreaming && !canSend}
              aria-label={isStreaming ? 'Stop generating' : 'Send message'}
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                'transition-all duration-150',
                'active:scale-[0.96]',
                'disabled:cursor-not-allowed disabled:opacity-30',
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
                <ArrowUp size={18} strokeWidth={2.5} />
              )}
            </motion.button>
          </AnimatePresence>
        </div>
      </div>

      {/* Character count */}
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
