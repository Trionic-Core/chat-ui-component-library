/**
 * Pure helpers behind the voice UI. Kept free of React and of direct browser
 * globals (the MediaRecorder probe is injected) so the state machines around
 * recording and audio caching are unit-testable in a node environment.
 */

/**
 * Container preference for MediaRecorder, most-wanted first.
 *
 * Opus in WebM is the smallest and what Chrome/Firefox produce natively;
 * `audio/mp4` is the Safari fallback, which supports neither WebM variant.
 * Azure fast transcription accepts all three, so the choice is purely about
 * what the recording browser can actually produce.
 */
export const VOICE_MIME_PREFERENCE = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
] as const

/**
 * Pick the first container the browser can record.
 *
 * Returns `undefined` when none of the preferred types are supported (or the
 * probe is unavailable), which callers must pass straight through to
 * `new MediaRecorder(stream)` — an explicit unsupported mimeType throws,
 * whereas omitting it lets the browser choose its own default.
 */
export function pickMimeType(
  isSupported?: (type: string) => boolean
): string | undefined {
  if (!isSupported) return undefined
  return VOICE_MIME_PREFERENCE.find((type) => isSupported(type))
}

/** The browser's MediaRecorder support probe, when the API is present. */
export function getMimeSupportProbe(): ((type: string) => boolean) | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return (type: string) => MediaRecorder.isTypeSupported(type)
}

/**
 * Hard cap on a single recording, in seconds.
 *
 * The backend's short-audio STT transport — used on installs whose Azure
 * region has no fast transcription — rejects anything over 60 s outright, so
 * we stop just under it. Losing the last couple of seconds beats losing the
 * whole take.
 */
export const MAX_RECORDING_SECONDS = 58

/** Seconds left before the recording auto-stops. */
export function remainingSeconds(elapsed: number): number {
  return Math.max(0, MAX_RECORDING_SECONDS - Math.floor(elapsed))
}

/** Format elapsed recording seconds as m:ss. */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`
}

/**
 * Fixed-capacity cache of object URLs keyed by backend message id.
 *
 * Object URLs pin their blob in memory until revoked, so every path that drops
 * an entry — eviction, replacement, teardown — must revoke it. Insertion order
 * is the eviction order (oldest out first); re-setting an existing key replaces
 * in place and keeps that key's original position, since the point of the cap
 * is bounding memory, not tracking recency.
 */
export class ObjectUrlCache {
  private readonly urls = new Map<string, string>()

  constructor(
    private readonly capacity = 20,
    private readonly revoke: (url: string) => void = defaultRevoke
  ) {}

  get size(): number {
    return this.urls.size
  }

  get(key: string): string | undefined {
    return this.urls.get(key)
  }

  /** Store a URL, revoking any URL it displaces and evicting past capacity. */
  set(key: string, url: string): void {
    const previous = this.urls.get(key)
    if (previous !== undefined) {
      if (previous === url) return
      this.revoke(previous)
    }
    this.urls.set(key, url)

    while (this.urls.size > this.capacity) {
      const oldest = this.urls.keys().next()
      if (oldest.done) break
      this.delete(oldest.value)
    }
  }

  delete(key: string): void {
    const url = this.urls.get(key)
    if (url === undefined) return
    this.urls.delete(key)
    this.revoke(url)
  }

  /** Revoke every URL and empty the cache. Call on provider unmount. */
  clear(): void {
    for (const url of this.urls.values()) this.revoke(url)
    this.urls.clear()
  }
}

function defaultRevoke(url: string): void {
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url)
  }
}
