import { useCallback, useEffect, useRef } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import { cn } from '../utils/cn'
import { useChatContext } from '../context/chat-context'
import { useVoiceRecorder, type RecorderStatus } from '../hooks/use-voice-recorder'
import { formatDuration, remainingSeconds } from '../utils/voice'

/** How close to the cap the countdown starts warning. */
const LIMIT_WARNING_SECONDS = 10

/** Button geometry per size. `lg` matches PromptInput's send button. */
const SIZES = {
  sm: { box: 'h-7 w-7', icon: 14 },
  md: { box: 'h-8 w-8', icon: 16 },
  lg: { box: 'h-9 w-9', icon: 18 },
} as const

/** Keeps the recording timer from crowding out the rest of the action row. */
const STATUS_MAX_WIDTH = 132

interface VoiceRecordButtonProps {
  /** Whether the surrounding input is disabled. */
  disabled?: boolean
  /** Diameter of the button. ChatInput's row uses 28px, PromptInput's 36px. */
  size?: 'sm' | 'md' | 'lg'
  /**
   * `outline` is a secondary control sitting among other buttons. `solid` fills
   * the button the way PromptInput's send button is filled, for when the mic
   * occupies the send position and has to read as the primary action.
   */
  appearance?: 'outline' | 'solid'
  /**
   * Fires whenever recording starts, ends or fails. A parent that swaps this
   * button for another one needs it: unmounting mid-recording would stop the
   * capture and silently discard the clip.
   */
  onStatusChange?: (status: RecorderStatus) => void
  className?: string
}

/**
 * Microphone button — tap to record, tap to stop, transcript lands in the input.
 *
 * The transcript is inserted rather than sent: speech recognition is fallible
 * and the user reviews before committing, which also keeps the send path
 * identical to typing.
 *
 * Renders nothing without a ChatConfig.voice handler, so the whole feature
 * stays dark on installs that haven't enabled voice.
 */
export function VoiceRecordButton({
  disabled,
  size = 'md',
  appearance = 'outline',
  onStatusChange,
  className,
}: VoiceRecordButtonProps) {
  const { config, state, setInput, dictate } = useChatContext()
  const voice = config.voice

  // Transcription takes seconds, during which the user may keep typing. The
  // context exposes no functional setter, so read the input at the moment of
  // insertion rather than from the closure that started the request.
  const inputValueRef = useRef(state.inputValue)
  useEffect(() => {
    inputValueRef.current = state.inputValue
  }, [state.inputValue])

  const handleClip = useCallback(
    async (clip: Blob) => {
      if (!voice) return
      // Via the provider rather than voice.transcribe directly, so the selected
      // dictation language is applied and the reply teaches us whether this
      // install can auto-detect at all — in one place, not per input surface.
      const result = await dictate(clip)
      const text = result.text.trim()
      if (!text) return
      // Append to whatever is already typed rather than replacing it, so a
      // dictated clause can extend a half-written question.
      const existing = inputValueRef.current.trimEnd()
      setInput(existing ? `${existing} ${text}` : text)
    },
    [voice, dictate, setInput]
  )

  const { status, error, elapsedSeconds, limitReached, toggle, dismissError } = useVoiceRecorder({
    onClip: handleClip,
  })

  // Through a ref so an unmemoized callback does not re-fire the report every
  // render, and so the unmount reset below can stay a mount-once effect.
  const onStatusChangeRef = useRef(onStatusChange)
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange
  })

  useEffect(() => {
    onStatusChangeRef.current?.(status)
  }, [status])

  // A parent that swaps this button away reads the reported status to know when
  // that is safe. If we vanished while it still believed we were busy, it would
  // wait forever for an end that can no longer come.
  useEffect(() => () => onStatusChangeRef.current?.('idle'), [])

  if (!voice) return null

  const isRecording = status === 'recording'
  const isTranscribing = status === 'transcribing'
  const hasError = status === 'error'
  const isSolid = appearance === 'solid'
  const { box: dimension, icon: iconSize } = SIZES[size]
  const secondsLeft = remainingSeconds(elapsedSeconds)
  const isNearLimit = isRecording && secondsLeft <= LIMIT_WARNING_SECONDS

  const label = isRecording
    ? 'Stop recording'
    : isTranscribing
      ? 'Transcribing'
      : 'Record a voice message'

  // Alert red covers both recording and a failed attempt; the icon is what
  // tells them apart (a stop square versus a mic to retry).
  const alerting = isRecording || hasError

  return (
    <div
      className={cn(
        'flex items-center gap-1.5',
        // Solid means this button is in the send position at the right edge, so
        // the timer has to sit to its LEFT or it runs out of the container.
        isSolid && 'flex-row-reverse',
        className
      )}
    >
      <button
        type="button"
        onClick={hasError ? dismissError : toggle}
        disabled={disabled || isTranscribing || state.isStreaming}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full',
          dimension,
          isSolid ? 'transition-all duration-150 active:scale-[0.96]' : 'transition-colors duration-100',
          'focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-[var(--cxc-border-focus)]',
          'disabled:cursor-not-allowed',
          isSolid ? 'disabled:opacity-30' : 'disabled:opacity-40'
        )}
        style={
          isSolid
            ? {
                backgroundColor: alerting ? 'var(--cxc-error)' : 'var(--cxc-text)',
                color: 'var(--cxc-text-inverse)',
              }
            : {
                color: alerting ? 'var(--cxc-error)' : 'var(--cxc-text-secondary)',
                border: `1px solid ${isRecording ? 'var(--cxc-error)' : 'var(--cxc-border)'}`,
              }
        }
        onMouseOver={(e) => {
          // The solid button is already the loudest thing in the row; the send
          // button it stands in for has no hover tint either.
          if (isSolid || alerting) return
          e.currentTarget.style.backgroundColor = 'var(--cxc-bg-muted)'
          e.currentTarget.style.color = 'var(--cxc-text)'
        }}
        onMouseOut={(e) => {
          if (isSolid || alerting) return
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.color = 'var(--cxc-text-secondary)'
        }}
        aria-label={hasError ? 'Dismiss recording error' : label}
        aria-pressed={isRecording}
        title={hasError ? (error ?? 'Recording failed') : label}
      >
        {isTranscribing ? (
          <Loader2 size={iconSize} className="cxc-spin" aria-hidden="true" />
        ) : isRecording ? (
          <Square size={iconSize - 4} fill="currentColor" aria-hidden="true" />
        ) : (
          <Mic size={iconSize} strokeWidth={1.8} aria-hidden="true" />
        )}
      </button>

      {isRecording && (
        <span
          className="flex items-center gap-1.5 text-[12px] tabular-nums"
          style={{ color: isNearLimit ? 'var(--cxc-error)' : 'var(--cxc-text-secondary)' }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: 'var(--cxc-error)' }}
            aria-hidden="true"
          />
          {formatDuration(elapsedSeconds)}
          {/* Only warn near the cap — a countdown from the first second would
              make every short dictation feel rushed. */}
          {isNearLimit && <span>{secondsLeft}s left</span>}
        </span>
      )}

      {isTranscribing && (
        <span
          className="truncate text-[12px]"
          style={{ color: 'var(--cxc-text-muted)', maxWidth: STATUS_MAX_WIDTH }}
          title={limitReached ? 'Recording limit reached — transcribing...' : undefined}
        >
          {limitReached ? 'Recording limit reached — transcribing...' : 'Transcribing...'}
        </span>
      )}

      {hasError && error && (
        <span
          className="truncate text-[12px]"
          style={{ color: 'var(--cxc-error)', maxWidth: STATUS_MAX_WIDTH }}
          role="alert"
          title={error}
        >
          {error}
        </span>
      )}
    </div>
  )
}
