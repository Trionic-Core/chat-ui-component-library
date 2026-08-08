import { useCallback, useEffect, useRef } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import { cn } from '../utils/cn'
import { useChatContext } from '../context/chat-context'
import { useVoiceRecorder } from '../hooks/use-voice-recorder'
import { formatDuration, remainingSeconds } from '../utils/voice'

/** How close to the cap the countdown starts warning. */
const LIMIT_WARNING_SECONDS = 10

interface VoiceRecordButtonProps {
  /** Whether the surrounding input is disabled. */
  disabled?: boolean
  /** Diameter of the button. PromptInput's row uses 32px, ChatInput's uses 28px. */
  size?: 'sm' | 'md'
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
export function VoiceRecordButton({ disabled, size = 'md', className }: VoiceRecordButtonProps) {
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

  if (!voice) return null

  const isRecording = status === 'recording'
  const isTranscribing = status === 'transcribing'
  const hasError = status === 'error'
  const dimension = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'
  const iconSize = size === 'sm' ? 14 : 16
  const secondsLeft = remainingSeconds(elapsedSeconds)
  const isNearLimit = isRecording && secondsLeft <= LIMIT_WARNING_SECONDS

  const label = isRecording
    ? 'Stop recording'
    : isTranscribing
      ? 'Transcribing'
      : 'Record a voice message'

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <button
        type="button"
        onClick={hasError ? dismissError : toggle}
        disabled={disabled || isTranscribing || state.isStreaming}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full',
          dimension,
          'transition-colors duration-100',
          'focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-[var(--cxc-border-focus)]',
          'disabled:cursor-not-allowed disabled:opacity-40'
        )}
        style={{
          color: isRecording
            ? 'var(--cxc-error)'
            : hasError
              ? 'var(--cxc-error)'
              : 'var(--cxc-text-secondary)',
          border: `1px solid ${isRecording ? 'var(--cxc-error)' : 'var(--cxc-border)'}`,
        }}
        onMouseOver={(e) => {
          if (isRecording || hasError) return
          e.currentTarget.style.backgroundColor = 'var(--cxc-bg-muted)'
          e.currentTarget.style.color = 'var(--cxc-text)'
        }}
        onMouseOut={(e) => {
          if (isRecording || hasError) return
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
        <span className="text-[12px]" style={{ color: 'var(--cxc-text-muted)' }}>
          {limitReached ? 'Recording limit reached — transcribing...' : 'Transcribing...'}
        </span>
      )}

      {hasError && error && (
        <span className="text-[12px]" style={{ color: 'var(--cxc-error)' }} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
