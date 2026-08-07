import { describe, expect, it, vi } from 'vitest'
import {
  ObjectUrlCache,
  formatDuration,
  pickMimeType,
  remainingSeconds,
  MAX_RECORDING_SECONDS,
  VOICE_MIME_PREFERENCE,
} from './voice'

/* ------------------------------------------------------------------
 * Guards for the two pure state machines behind the voice UI.
 *
 * The mime preference order is load-bearing across browsers: Safari
 * supports NEITHER webm variant, so dropping the audio/mp4 tail would
 * silently break recording there. And every path that drops a cached
 * object URL must revoke it — an unrevoked URL pins its audio blob in
 * memory for the life of the page.
 * ----------------------------------------------------------------*/

describe('pickMimeType', () => {
  it('prefers opus-in-webm when the browser supports everything', () => {
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus')
  })

  it('falls back to plain webm when the opus codec is not advertised', () => {
    const supported = (type: string) => type === 'audio/webm' || type === 'audio/mp4'
    expect(pickMimeType(supported)).toBe('audio/webm')
  })

  it('falls back to audio/mp4 on Safari, which supports no webm variant', () => {
    expect(pickMimeType((type) => type === 'audio/mp4')).toBe('audio/mp4')
  })

  it('returns undefined when nothing is supported, so MediaRecorder picks its own default', () => {
    // An explicitly unsupported mimeType throws in the MediaRecorder ctor,
    // whereas omitting the option does not — undefined is the safe signal.
    expect(pickMimeType(() => false)).toBeUndefined()
  })

  it('returns undefined when the browser exposes no support probe at all', () => {
    expect(pickMimeType(undefined)).toBeUndefined()
  })

  it('keeps audio/mp4 in the preference list for Safari', () => {
    expect(VOICE_MIME_PREFERENCE).toContain('audio/mp4')
  })
})

describe('formatDuration', () => {
  it('pads seconds to two digits', () => {
    expect(formatDuration(5)).toBe('0:05')
    expect(formatDuration(65)).toBe('1:05')
  })

  it('handles multi-minute recordings', () => {
    expect(formatDuration(600)).toBe('10:00')
  })

  it('floors fractional seconds and clamps negatives', () => {
    expect(formatDuration(9.9)).toBe('0:09')
    expect(formatDuration(-3)).toBe('0:00')
  })
})

describe('recording duration cap', () => {
  it('stops strictly under the transport ceiling', () => {
    // The short-audio STT transport rejects clips over 60s outright, so the cap
    // must leave headroom for the stop-and-flush round trip.
    expect(MAX_RECORDING_SECONDS).toBeLessThan(60)
    expect(MAX_RECORDING_SECONDS).toBeGreaterThan(30)
  })

  it('counts down toward the cap', () => {
    expect(remainingSeconds(0)).toBe(MAX_RECORDING_SECONDS)
    expect(remainingSeconds(MAX_RECORDING_SECONDS - 5)).toBe(5)
  })

  it('never reports negative time once the cap is passed', () => {
    expect(remainingSeconds(MAX_RECORDING_SECONDS)).toBe(0)
    expect(remainingSeconds(MAX_RECORDING_SECONDS + 30)).toBe(0)
  })
})

describe('ObjectUrlCache', () => {
  it('returns a stored url so a replayed message never re-hits the backend', () => {
    const cache = new ObjectUrlCache(5, vi.fn())
    cache.set('m1', 'blob:one')
    expect(cache.get('m1')).toBe('blob:one')
  })

  it('revokes the displaced url when a key is overwritten', () => {
    const revoke = vi.fn()
    const cache = new ObjectUrlCache(5, revoke)
    cache.set('m1', 'blob:one')
    cache.set('m1', 'blob:two')

    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:one')
    expect(cache.get('m1')).toBe('blob:two')
    expect(cache.size).toBe(1)
  })

  it('does not revoke when the same url is set again', () => {
    const revoke = vi.fn()
    const cache = new ObjectUrlCache(5, revoke)
    cache.set('m1', 'blob:one')
    cache.set('m1', 'blob:one')

    expect(revoke).not.toHaveBeenCalled()
    expect(cache.get('m1')).toBe('blob:one')
  })

  it('evicts and revokes the oldest entry past capacity', () => {
    const revoke = vi.fn()
    const cache = new ObjectUrlCache(2, revoke)
    cache.set('m1', 'blob:one')
    cache.set('m2', 'blob:two')
    cache.set('m3', 'blob:three')

    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:one')
    expect(cache.get('m1')).toBeUndefined()
    expect(cache.get('m2')).toBe('blob:two')
    expect(cache.get('m3')).toBe('blob:three')
    expect(cache.size).toBe(2)
  })

  it('keeps a replaced key in its original eviction position', () => {
    const revoke = vi.fn()
    const cache = new ObjectUrlCache(2, revoke)
    cache.set('m1', 'blob:one')
    cache.set('m2', 'blob:two')
    // Replacing m1 must not promote it: capacity bounds memory, it is not an LRU.
    cache.set('m1', 'blob:one-again')
    cache.set('m3', 'blob:three')

    expect(cache.get('m1')).toBeUndefined()
    expect(revoke).toHaveBeenCalledWith('blob:one')
    expect(revoke).toHaveBeenCalledWith('blob:one-again')
  })

  it('revokes every url on clear, as the provider does on unmount', () => {
    const revoke = vi.fn()
    const cache = new ObjectUrlCache(5, revoke)
    cache.set('m1', 'blob:one')
    cache.set('m2', 'blob:two')
    cache.clear()

    expect(revoke.mock.calls.map(([url]) => url)).toEqual(['blob:one', 'blob:two'])
    expect(cache.size).toBe(0)
    expect(cache.get('m1')).toBeUndefined()
  })

  it('revokes on explicit delete and ignores unknown keys', () => {
    const revoke = vi.fn()
    const cache = new ObjectUrlCache(5, revoke)
    cache.set('m1', 'blob:one')
    cache.delete('m1')
    cache.delete('missing')

    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:one')
    expect(cache.size).toBe(0)
  })
})
