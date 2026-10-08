import { createParser, type EventSourceMessage } from 'eventsource-parser'
import type { ChatEvent, ChatSendFn, SSEStreamConfig } from '../types'
import { defaultParseEvent } from './sse-events'

/** return() must abort a pending read before it queues behind generator.next(). */
export function abortable<T>(iterator: AsyncGenerator<T, void, undefined>, controller: AbortController): AsyncGenerator<T, void, undefined> {
  const originalReturn = iterator.return.bind(iterator)
  iterator.return = value => { controller.abort(); return originalReturn(value) }
  return iterator
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
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read()
          const text = done ? decoder.decode() : decoder.decode(value, { stream: true })
          // The parser defers a trailing CR in case the next chunk starts with LF.
          parser.feed(text + (done && trailingCR ? '\n' : ''))
          if (text) trailingCR = text.endsWith('\r')
          for (const frame of queue.splice(0)) {
            if (controller.signal.aborted) return
            const event = frame.data === '[DONE]' ? { type: 'done' as const } : parseEvent(frame.event ?? 'message', frame.data)
            if (!event) continue
            yield event
            if (event.type === 'done' || event.type === 'error') return
          }
          if (done) break
        }
        if (!controller.signal.aborted) {
          yield { type: 'error', message: 'The connection ended before the answer completed. Please retry.', code: 'INCOMPLETE_STREAM' }
        }
      } catch (error) {
        if (!controller.signal.aborted) yield { type: 'error', message: error instanceof Error ? error.message : 'Chat connection failed' }
      } finally {
        await reader?.cancel().catch(() => {})
        reader?.releaseLock()
        controller.abort()
        if (active === controller) active = null
      }
    }
    return abortable(stream(), controller)
  }
  return { send, abort }
}
