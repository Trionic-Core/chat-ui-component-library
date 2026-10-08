import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSEClient } from './sse'
import type { ChatEvent, SSEStreamConfig } from '../types'

afterEach(() => vi.unstubAllGlobals())

function mockStream(text: string, chunkSize = 7) {
  const bytes = new TextEncoder().encode(text)
  const cancel = vi.fn()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize))
      controller.close()
    }, cancel,
  })
  const fetch = vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } }))
  vi.stubGlobal('fetch', fetch)
  return { fetch, cancel }
}
async function collect(config: Partial<SSEStreamConfig> = {}) {
  const events: ChatEvent[] = []
  for await (const event of createSSEClient(() => ({ url: '/chat', ...config })).send('hello', 'session')) events.push(event)
  return events
}

describe('shared SSE transport', () => {
  it.each(['\n', '\r\n', '\r'])('parses frames separated by %j across individual UTF-8 bytes', async newline => {
    mockStream([': heartbeat', 'event: token', 'data: {"text":"नमस्ते 🌍"}', '', 'event: done', 'data: {"session_id":"abc"}', '', ''].join(newline), 1)
    expect(await collect()).toEqual([{ type: 'token', text: 'नमस्ते 🌍' }, { type: 'done', sessionId: 'abc', messageId: undefined }])
  })
  it('combines multiple data lines before parsing JSON and ignores comments', async () => {
    mockStream('event: token\ndata: {\ndata: "text": "hello"\ndata: }\n\n: keepalive\n\ndata: [DONE]\n\n')
    expect(await collect()).toEqual([{ type: 'token', text: 'hello' }, { type: 'done' }])
  })
  it('preserves spaces in raw tokens', async () => {
    mockStream('data:  hello \n\ndata: [DONE]\n\n')
    expect((await collect())[0]).toEqual({ type: 'token', text: ' hello ' })
  })
  it('passes custom adapters, session, headers, credentials and metadata', async () => {
    const { fetch } = mockStream('event: custom\ndata: example\n\ndata: [DONE]\n\n')
    const client = createSSEClient(() => ({ url: '/custom', credentials: 'include', headers: async () => ({ 'X-CSRF': 'test' }),
      buildBody: (message, sessionId) => ({ prompt: message, sessionId }),
      parseEvent: (event, data) => ({ type: 'token', text: `${event}:${data}` }),
    }))
    const events = []
    for await (const event of client.send('question', 's1', { regenerate: true })) events.push(event)
    expect(events[0]).toEqual({ type: 'token', text: 'custom:example' })
    expect(fetch).toHaveBeenCalledWith('/custom', expect.objectContaining({ credentials: 'include', body: JSON.stringify({ prompt: 'question', sessionId: 's1', regenerate: true }), headers: expect.objectContaining({ 'X-CSRF': 'test' }) }))
  })
  it('reports early EOF and never silently accepts a truncated answer', async () => {
    mockStream('event: token\ndata: {"text":"partial"}\n\n')
    expect(await collect()).toEqual([{ type: 'token', text: 'partial' }, expect.objectContaining({ type: 'error', code: 'INCOMPLETE_STREAM' })])
  })
  it('rejects HTML login responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>login</html>')))
    expect(await collect()).toEqual([expect.objectContaining({ type: 'error', code: 'INVALID_CONTENT_TYPE' })])
  })
  it('does not expose an HTTP error response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private stack trace', { status: 403 })))
    expect(await collect()).toEqual([{ type: 'error', code: '403', message: 'Chat request failed (HTTP 403)' }])
  })
  it('aborts a waiting request immediately when return is called', async () => {
    let signal: AbortSignal
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => {
      signal = init.signal as AbortSignal
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
    }))
    const iterator = createSSEClient(() => ({ url: '/chat' })).send('hi', null)
    const pending = iterator.next()
    const closed = iterator.return(undefined)
    expect(signal!.aborted).toBe(true)
    expect(await pending).toEqual({ done: true, value: undefined })
    await closed
  })
  it('cancels the body reader on terminal events', async () => {
    const cancel = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: [DONE]\n\n')) }, cancel }), { headers: { 'content-type': 'text/event-stream' } })))
    await collect()
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('skips malformed structured surfaces without crashing', async () => {
    mockStream('event: ui_block\ndata: {"bad":true}\n\nevent: token\ndata: null\n\ndata: [DONE]\n\n')
    expect(await collect()).toEqual([{ type: 'done' }])
  })
})
