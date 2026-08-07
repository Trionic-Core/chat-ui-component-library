/**
 * 16 kHz mono WAV encoding for voice input.
 *
 * WHY: the CypherX backend has two speech-to-text transports and they do not
 * accept the same containers. Fast transcription takes the WebM/Opus a browser
 * records natively, but it is not offered in every Azure region; installs in
 * the other regions fall back to the short-audio API, which accepts only WAV
 * and OGG. No MediaRecorder format is available in every browser AND accepted
 * by that fallback (Chrome records only WebM, Safari only MP4), so a recording
 * uploaded as-is fails outright on those installs.
 *
 * Converting every recording to 16 kHz mono PCM removes the guess: both
 * transports accept it from every browser, and it is exactly what the
 * short-audio transport declares it wants. Dictation is seconds long, so the
 * size cost against Opus is bounded.
 *
 * `encodeWav` is deliberately free of Web Audio types so it can be tested
 * against known bytes under the node-environment vitest config; the decoding
 * and resampling that genuinely need a browser live in `blobToWav`.
 */

/** Sample rate the short-audio transport expects. */
export const TARGET_SAMPLE_RATE = 16_000

/** Content type to upload converted audio under. */
export const WAV_CONTENT_TYPE = 'audio/wav'

/**
 * Rate used to decode before resampling. `decodeAudioData` resamples to its
 * context's rate, and Safari historically rejected OfflineAudioContext rates
 * below 44.1 kHz — decoding at a universally supported rate keeps the one
 * 16 kHz context (the render pass, which must run) as the only such risk.
 */
const DECODE_SAMPLE_RATE = 44_100

const WAV_HEADER_BYTES = 44
const BYTES_PER_SAMPLE = 2
const PCM_FORMAT = 1
const MONO = 1

/**
 * Encode mono float samples (-1..1) as a 16-bit PCM WAV.
 *
 * Samples are clamped before scaling: a value outside -1..1 would otherwise
 * wrap around the 16-bit range and turn a loud passage into noise.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataBytes = samples.length * BYTES_PER_SAMPLE
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes)
  const view = new DataView(buffer)

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, WAV_HEADER_BYTES - 8 + dataBytes, true) // size of everything after this field
  writeAscii(8, 'WAVE')

  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM fmt chunk length
  view.setUint16(20, PCM_FORMAT, true)
  view.setUint16(22, MONO, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * MONO * BYTES_PER_SAMPLE, true) // byte rate
  view.setUint16(32, MONO * BYTES_PER_SAMPLE, true) // block align
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true) // bits per sample

  writeAscii(36, 'data')
  view.setUint32(40, dataBytes, true)

  let offset = WAV_HEADER_BYTES
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0))
    // Asymmetric scaling: int16 holds -32768..32767, so the negative side has
    // one more step than the positive.
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += BYTES_PER_SAMPLE
  }

  return buffer
}

/** Whether this browser can run the conversion at all. */
export function canConvertToWav(): boolean {
  return typeof OfflineAudioContext !== 'undefined'
}

/**
 * Decode a recorded blob and re-encode it as 16 kHz mono WAV.
 *
 * Decoding uses the same browser that produced the recording, so its own
 * container is always decodable. Resampling and the downmix to mono are done
 * by an OfflineAudioContext — which, unlike a live AudioContext, needs no user
 * gesture, so it is safe to run after the awaits in the recorder's stop handler.
 *
 * Throws if the browser cannot decode the clip. Callers should fall back to
 * uploading the original blob: fast-transcription installs still accept WebM,
 * making a decode failure degraded rather than broken.
 */
export async function blobToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer()

  // A 1-frame context purely to decode; the real work happens offline below.
  const decodeContext = new OfflineAudioContext(MONO, 1, DECODE_SAMPLE_RATE)
  const decoded = await decodeContext.decodeAudioData(arrayBuffer)

  const frameCount = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE))
  const renderContext = new OfflineAudioContext(MONO, frameCount, TARGET_SAMPLE_RATE)
  const source = renderContext.createBufferSource()
  source.buffer = decoded
  source.connect(renderContext.destination)
  source.start()

  const rendered = await renderContext.startRendering()
  return new Blob([encodeWav(rendered.getChannelData(0), TARGET_SAMPLE_RATE)], {
    type: WAV_CONTENT_TYPE,
  })
}
