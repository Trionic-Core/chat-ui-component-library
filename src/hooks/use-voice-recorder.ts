import { useCallback, useEffect, useRef, useState } from 'react'
import { getMimeSupportProbe, pickMimeType, MAX_RECORDING_SECONDS } from '../utils/voice'
import { blobToWav, canConvertToWav } from '../utils/wav'

export type RecorderStatus = 'idle' | 'recording' | 'transcribing' | 'error'

interface UseVoiceRecorderOptions {
  /** Called with the recorded clip once the user stops. */
  onClip: (clip: Blob) => Promise<void>
}

interface UseVoiceRecorderResult {
  status: RecorderStatus
  /** Failure reason to surface inline. Only set when status is 'error'. */
  error: string | null
  /** Whole seconds elapsed in the current recording. */
  elapsedSeconds: number
  /** True when the last recording ended by hitting the duration cap. */
  limitReached: boolean
  /** Start recording, or stop and transcribe if already recording. */
  toggle: () => void
  /** Clear an error back to the resting state. */
  dismissError: () => void
}

/**
 * MediaRecorder lifecycle for the mic button: tap to start, tap to stop,
 * hand the clip to `onClip`.
 *
 * The clip is converted to 16 kHz mono WAV before `onClip` sees it. That is a
 * library concern rather than a consumer one: we own the MediaRecorder, and
 * which container the backend accepts depends on the install's Azure region,
 * so leaving it to consumers would mean every client reimplements the same
 * conversion or mysteriously fails on single-region installs.
 *
 * Recording auto-stops at MAX_RECORDING_SECONDS, just under the short-audio
 * transport's 60 s ceiling — a clip over the cap is rejected outright, so
 * stopping early loses a moment of speech instead of the whole take.
 *
 * Microphone tracks are stopped on every exit path — normal stop, recorder
 * error, and unmount — because a live track keeps the browser's recording
 * indicator on and holds the device open. Permission denial surfaces as an
 * error string rather than throwing, so the button can stay put and be retried.
 */
/**
 * Convert a recording to the container both STT transports accept, falling
 * back to the original blob if this browser cannot decode it. The fallback is
 * degraded rather than broken: fast-transcription installs still take WebM,
 * and an install on the short-audio path answers 422 with a clear reason.
 */
async function convertForUpload(clip: Blob): Promise<Blob> {
  if (!canConvertToWav()) return clip
  try {
    return await blobToWav(clip)
  } catch {
    return clip
  }
}

export function useVoiceRecorder({ onClip }: UseVoiceRecorderOptions): UseVoiceRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [limitReached, setLimitReached] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  // Guards state updates fired from recorder callbacks after teardown.
  const mountedRef = useRef(true)

  // `onstop` is registered when recording starts but runs seconds later, so it
  // must reach the CURRENT callback — capturing it would discard anything the
  // user typed while recording.
  const onClipRef = useRef(onClip)
  useEffect(() => {
    onClipRef.current = onClip
  }, [onClip])

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    recorderRef.current = null
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Stopping mid-recording fires onstop, but the component is already gone;
      // the mountedRef guard makes that callback a no-op and this releases the
      // device either way.
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      releaseStream()
    }
  }, [releaseStream])

  // Recording timer, which also enforces the duration cap so there is a single
  // clock rather than a separate timeout that could drift from the display.
  // The interval lives with the recording state and can never outlive it.
  useEffect(() => {
    if (status !== 'recording') return
    const startedAt = Date.now()
    setElapsedSeconds(0)
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      setElapsedSeconds(elapsed)
      if (elapsed >= MAX_RECORDING_SECONDS) {
        // onstop runs the normal convert-and-transcribe path; the flag only
        // tells the UI why recording ended.
        setLimitReached(true)
        recorderRef.current?.stop()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [status])

  const start = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Recording is not supported in this browser')
      setStatus('error')
      return
    }

    setError(null)
    setLimitReached(false)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      // Denial, no device, and an insecure origin all land here and are all
      // fixed by the user, not by a retry — one message covers them.
      setError('Microphone unavailable. Check your browser permissions.')
      setStatus('error')
      return
    }

    // Unmounted while the permission prompt was open.
    if (!mountedRef.current) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }

    const mimeType = pickMimeType(getMimeSupportProbe())
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    } catch {
      stream.getTracks().forEach((track) => track.stop())
      setError('Recording is not supported in this browser')
      setStatus('error')
      return
    }

    streamRef.current = stream
    recorderRef.current = recorder
    chunksRef.current = []

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }

    recorder.onerror = () => {
      releaseStream()
      if (!mountedRef.current) return
      setError('Recording failed. Please try again.')
      setStatus('error')
    }

    recorder.onstop = () => {
      const chunks = chunksRef.current
      chunksRef.current = []
      // The clip's type must come from the recorder, not our preference list:
      // the browser may have ignored an unsupported mimeType and used its own.
      const clip = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' })
      releaseStream()
      if (!mountedRef.current) return

      if (clip.size === 0) {
        setError('Nothing was recorded. Please try again.')
        setStatus('error')
        return
      }

      setStatus('transcribing')
      void convertForUpload(clip)
        .then((upload) => onClipRef.current(upload))
        .then(() => {
          if (mountedRef.current) setStatus('idle')
        })
        .catch((err: unknown) => {
          if (!mountedRef.current) return
          setError(err instanceof Error ? err.message : 'Transcription failed')
          setStatus('error')
        })
    }

    recorder.start()
    setStatus('recording')
  }, [releaseStream])

  const toggle = useCallback(() => {
    if (status === 'recording') {
      recorderRef.current?.stop()
      return
    }
    if (status === 'transcribing') return
    void start()
  }, [status, start])

  const dismissError = useCallback(() => {
    setError(null)
    setStatus('idle')
  }, [])

  return { status, error, elapsedSeconds, limitReached, toggle, dismissError }
}
