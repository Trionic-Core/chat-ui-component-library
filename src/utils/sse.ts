import { createParser, type EventSourceMessage } from 'eventsource-parser'
import type { ChatEvent, ChatSendFn, SSEStreamConfig } from '../types'
import { defaultParseEvent } from './sse-events'

/** return() must abort a pending read before it queues behind generator.next(). */
export function abortable<T>(iterator: AsyncGenerator<T, void, undefined>, controller: AbortController): AsyncGenerator<T, void, undefined> {
  const originalReturn = iterator.return.bind(iterator)
  iterator.return = value => { controller.abort(); return originalReturn(value) }
  return iterator
}

/** A frame's data is whole when it is the `[DONE]` marker or valid JSON. */
function isWholeFrame(data: string): boolean {
  if (data === '[DONE]') return true
  try {
    JSON.parse(data)
    return true
  } catch {
    return false
  }
}

export function createSSEClient(getConfig: () => SSEStreamConfig) {
  let active: AbortController | null = null
  const abort = () => active?.abort()
  const send: ChatSendFn = (message, sessionId, metadata) => {
    abort()
    const controller = new AbortController()
    active = controller
    async function* stream(): AsyncGenerator<ChatEvent, void, undefined> {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      try {
        const config = getConfig()
        const method = config.method ?? 'POST'
        const body = (config.buildBody ?? ((message, sessionId) => ({ message, session_id: sessionId })))(message, sessionId)
        const headers = typeof config.headers === 'function' ? await config.headers() : config.headers
        const response = await fetch(config.url, {
          method,
          credentials: config.credentials ?? 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...headers },
          body: method === 'POST' ? JSON.stringify(metadata && body && typeof body === 'object' ? { ...body, ...metadata } : body) : undefined,
          signal: controller.signal,
        })
        if (!response.ok) {
          // Do not render a login page, stack trace or proxy error body as chat content.
          yield { type: 'error', message: `Chat request failed (HTTP ${response.status})`, code: String(response.status) }
          return
        }
        if (!response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) {
          yield { type: 'error', message: 'Expected a text/event-stream response from the chat endpoint', code: 'INVALID_CONTENT_TYPE' }
          return
        }
        if (!response.body) throw new Error('Chat response has no body')
        reader = response.body.getReader()
        const decoder = new TextDecoder()
        const queue: EventSourceMessage[] = []
        const parser = createParser({ onEvent: event => queue.push(event) })
        const parseEvent = config.parseEvent ?? defaultParseEvent
        let trailingCR = false
        // A server `error` event is not terminal: the backend reports a failed
        // tool call as `error` with `recoverable: true` and keeps streaming the
        // answer, then sends `done`. Only `done` ends a stream; a stream that
        // closes after an error without `done` already explained itself.
        let serverErrorSeen = false
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read()
          const text = done ? decoder.decode() : decoder.decode(value, { stream: true })
          // The parser defers a trailing CR in case the next chunk starts with LF.
          parser.feed(text + (done && trailingCR ? '\n' : ''))
          if (text) trailingCR = text.endsWith('\r')
          if (done) {
            // A server may end the body without the last frame's blank line.
            // The spec drops that frame; keep it only when it is whole, so a
            // frame cut mid-JSON never renders as text and still reads as an
            // incomplete stream below.
            const settled = queue.length
            parser.feed('\n\n')
            queue.push(...queue.splice(settled).filter(frame => isWholeFrame(frame.data)))
          }
          for (const frame of queue.splice(0)) {
            if (controller.signal.aborted) return
            const event = frame.data === '[DONE]' ? { type: 'done' as const } : parseEvent(frame.event ?? 'message', frame.data)
            if (!event) continue
            yield event
            if (event.type === 'done') return
            if (event.type === 'error') serverErrorSeen = true
          }
          if (done) break
        }
        if (!controller.signal.aborted && !serverErrorSeen) {
          yield { type: 'error', message: 'The connection ended before the answer completed. Please retry.', code: 'INCOMPLETE_STREAM' }
        }
      } catch (error) {
        if (!controller.signal.aborted) yield { type: 'error', message: error instanceof Error ? error.message : 'Chat connection failed' }
      } finally {
        // Abort first: it is what closes the socket. Do not await cancel();
        // on WebKit for Linux the cancel promise of an open event-stream body
        // never settles, and a generator held open here keeps the provider in
        // its streaming state after done.
        controller.abort()
        void reader?.cancel().catch(() => {})
        if (active === controller) active = null
      }
    }
    return abortable(stream(), controller)
  }
  return { send, abort }
}
