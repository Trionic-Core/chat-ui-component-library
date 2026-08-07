import { describe, expect, it } from 'vitest'
import { encodeWav, TARGET_SAMPLE_RATE, WAV_CONTENT_TYPE } from './wav'

/* ------------------------------------------------------------------
 * Byte-level guard on the WAV encoder.
 *
 * These bytes are a wire contract, not an implementation detail: the
 * backend's short-audio STT transport parses this header, and it is
 * the ONLY transport available on installs whose Azure region has no
 * fast transcription. A wrong byte order or a stale size field is
 * silently accepted by most local players and rejected by Azure, so
 * the header is asserted field by field rather than round-tripped.
 * ----------------------------------------------------------------*/

const HEADER_BYTES = 44

function ascii(view: DataView, offset: number, length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(offset + i))
  return out
}

describe('encodeWav', () => {
  it('writes a RIFF/WAVE header of the canonical 44 bytes', () => {
    const buffer = encodeWav(new Float32Array([0, 0]), TARGET_SAMPLE_RATE)
    const view = new DataView(buffer)

    expect(ascii(view, 0, 4)).toBe('RIFF')
    expect(ascii(view, 8, 4)).toBe('WAVE')
    expect(ascii(view, 12, 4)).toBe('fmt ')
    expect(ascii(view, 36, 4)).toBe('data')
    expect(buffer.byteLength).toBe(HEADER_BYTES + 2 * 2)
  })

  it('declares 16-bit mono PCM at the requested rate', () => {
    const view = new DataView(encodeWav(new Float32Array([0]), TARGET_SAMPLE_RATE))

    expect(view.getUint32(16, true)).toBe(16) // fmt chunk length
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(1) // mono
    expect(view.getUint32(24, true)).toBe(TARGET_SAMPLE_RATE)
    expect(view.getUint16(34, true)).toBe(16) // bits per sample
  })

  it('derives byte rate and block align from the mono 16-bit layout', () => {
    const view = new DataView(encodeWav(new Float32Array([0]), TARGET_SAMPLE_RATE))

    expect(view.getUint32(28, true)).toBe(TARGET_SAMPLE_RATE * 2) // byte rate
    expect(view.getUint16(32, true)).toBe(2) // block align
  })

  it('writes size fields that match the payload', () => {
    const samples = new Float32Array(8)
    const view = new DataView(encodeWav(samples, TARGET_SAMPLE_RATE))
    const dataBytes = samples.length * 2

    expect(view.getUint32(40, true)).toBe(dataBytes) // data chunk size
    expect(view.getUint32(4, true)).toBe(HEADER_BYTES - 8 + dataBytes) // RIFF size
  })

  it('encodes samples as little-endian int16', () => {
    const view = new DataView(encodeWav(new Float32Array([0, 1, -1]), TARGET_SAMPLE_RATE))

    expect(view.getInt16(HEADER_BYTES, true)).toBe(0)
    expect(view.getInt16(HEADER_BYTES + 2, true)).toBe(32767)
    // int16 is asymmetric: the negative side reaches one step further.
    expect(view.getInt16(HEADER_BYTES + 4, true)).toBe(-32768)
  })

  it('clamps out-of-range samples instead of letting them wrap', () => {
    // Without the clamp these would wrap around int16 and turn a loud passage
    // into noise — the failure mode is audible garbage, not a crash.
    const view = new DataView(encodeWav(new Float32Array([4, -4]), TARGET_SAMPLE_RATE))

    expect(view.getInt16(HEADER_BYTES, true)).toBe(32767)
    expect(view.getInt16(HEADER_BYTES + 2, true)).toBe(-32768)
  })

  it('handles an empty sample array as a valid header-only file', () => {
    const buffer = encodeWav(new Float32Array(0), TARGET_SAMPLE_RATE)
    const view = new DataView(buffer)

    expect(buffer.byteLength).toBe(HEADER_BYTES)
    expect(view.getUint32(40, true)).toBe(0)
    expect(view.getUint32(4, true)).toBe(HEADER_BYTES - 8)
  })

  it('honors a non-default sample rate in both rate fields', () => {
    const view = new DataView(encodeWav(new Float32Array([0]), 8_000))

    expect(view.getUint32(24, true)).toBe(8_000)
    expect(view.getUint32(28, true)).toBe(16_000)
  })
})

describe('voice upload constants', () => {
  it('targets the 16 kHz mono the short-audio transport expects', () => {
    expect(TARGET_SAMPLE_RATE).toBe(16_000)
  })

  it('uploads under the audio/wav content type', () => {
    expect(WAV_CONTENT_TYPE).toBe('audio/wav')
  })
})
