import { useCallback, useRef } from 'react'
import type { ChatEvent, ChatSendFn, SSEStreamConfig } from '../types'

/**
 * Default body builder: wraps message + sessionId in a JSON object.
 */
function defaultBuildBody(message: string, sessionId: string | null): unknown {
  return { message, session_id: sessionId }
}

/**
 * Default event parser: expects JSON in the SSE data field.
 * Maps event types to ChatEvent discriminated union members.
 */
function defaultParseEvent(eventType: string, data: string): ChatEvent | null {
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>

    switch (eventType) {
      case 'token':
        return { type: 'token', text: String(parsed.text ?? '') }

      case 'thinking':
        return { type: 'thinking', active: parsed.active !== false }

      case 'reasoning':
        return { type: 'reasoning', text: String(parsed.text ?? '') }

      case 'action':
        return {
          type: 'action',
          action: {
            id: String(parsed.id ?? crypto.randomUUID()),
            type: String(parsed.action_type ?? parsed.type ?? 'unknown'),
            label: String(parsed.label ?? ''),
            status: (['pending', 'running', 'completed', 'error'].includes(String(parsed.status))
              ? String(parsed.status) as 'pending' | 'running' | 'completed' | 'error'
              : 'running'),
            detail: parsed.detail != null ? String(parsed.detail) : undefined,
            timestamp: new Date(),
          },
        }

      case 'action_update':
        return {
          type: 'action_update',
          actionId: String(parsed.action_id ?? parsed.actionId ?? ''),
          status: (parsed.status as 'pending' | 'running' | 'completed' | 'error') ?? 'completed',
          detail: parsed.detail != null ? String(parsed.detail) : undefined,
        }

      case 'followups': {
        // Backend `suggest_followups` tool emits this AFTER the assistant
        // text stream completes but BEFORE the `done` event. Frontend renders
        // the options as MCQ buttons.
        const opts = Array.isArray(parsed.options) ? parsed.options : []
        return {
          type: 'followups',
          followups: {
            label: String(parsed.label ?? ''),
            options: opts.map((o) => String(o)),
            multi: Boolean(parsed.multi ?? false),
          },
        }
      }

      case 'done':
        return {
          type: 'done',
          sessionId: parsed.session_id != null ? String(parsed.session_id) : undefined,
          messageId: parsed.message_id != null ? String(parsed.message_id) : undefined,
        }

      case 'error':
        return {
          type: 'error',
          message: String(parsed.message ?? parsed.error ?? 'Unknown error'),
          code: parsed.code != null ? String(parsed.code) : undefined,
        }

      default: {
        // Try to interpret unknown event types as actions
        if (parsed.label || parsed.action_type) {
          return {
            type: 'action',
            action: {
              id: String(parsed.id ?? crypto.randomUUID()),
              type: eventType,
              label: String(parsed.label ?? eventType),
              status: (parsed.status as 'pending' | 'running' | 'completed' | 'error') ?? 'running',
              detail: parsed.detail != null ? String(parsed.detail) : undefined,
              timestamp: new Date(),
            },
          }
        }
        // Fallback: try as token if it has a text field
        if (typeof parsed.text === 'string') {
          return { type: 'token', text: parsed.text }
        }
        return null
      }
    }
  } catch {
    // Non-JSON data line -- treat as raw token text
    if (data.trim()) {
      return { type: 'token', text: data }
    }
    return null
  }
}

/**
 * Converts a POST-based SSE endpoint into the ChatSendFn async generator format.
 *
 * Uses fetch() with ReadableStream reader (not EventSource, which doesn't support
 * POST or custom headers). Buffers partial lines, splits on newlines, and tracks
 * the SSE `event:` field from each frame.
 *
 * Cancellation is handled via AbortController -- calling generator.return() will
 * abort the fetch request and close the stream.
 */
export function useSSEStream(config: SSEStreamConfig): ChatSendFn {
  const {
    url,
    method = 'POST',
    headers = {},
    buildBody = defaultBuildBody,
    parseEvent = defaultParseEvent,
  } = config

  // Track the active abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null)

  const sendFn: ChatSendFn = useCallback(
    async function* (
      message: string,
      sessionId: string | null,
      metadata?: Record<string, unknown>
    ): AsyncGenerator<ChatEvent, void, undefined> {
      // Abort any previous stream
      abortControllerRef.current?.abort()

      const abortController = new AbortController()
      abortControllerRef.current = abortController

      try {
        const fetchOptions: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            ...headers,
          },
          signal: abortController.signal,
        }

        if (method === 'POST') {
          const body = buildBody(message, sessionId)
          // Spread metadata at the TOP LEVEL of the body. Backends typically
          // expect flags like `regenerate: true` directly on the request, not
          // nested under `metadata`. Pydantic / extra-strict backends drop
          // unknown fields safely, so this is harmless when the field isn't
          // recognized server-side.
          const bodyWithMeta =
            metadata && typeof body === 'object' && body !== null
              ? { ...(body as Record<string, unknown>), ...metadata }
              : body
          fetchOptions.body = JSON.stringify(bodyWithMeta)
        }

        const response = await fetch(url, fetchOptions)

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error')
          yield {
            type: 'error',
            message: `HTTP ${response.status}: ${errorText}`,
            code: String(response.status),
          }
          return
        }

        if (!response.body) {
          yield { type: 'error', message: 'Response body is null' }
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        let buffer = ''
        let currentEventType = 'message'

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })

            // Process complete lines
            const lines = buffer.split('\n')
            // Keep the last potentially incomplete line in the buffer
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              const trimmed = line.trim()

              // Empty line = end of event frame
              if (trimmed === '') {
                currentEventType = 'message'
                continue
              }

              // Comment line (starts with :)
              if (trimmed.startsWith(':')) {
                continue
              }

              // Event type field
              if (trimmed.startsWith('event:')) {
                currentEventType = trimmed.slice(6).trim()
                continue
              }

              // Data field
              if (trimmed.startsWith('data:')) {
                const data = trimmed.slice(5).trim()

                // Skip [DONE] sentinel
                if (data === '[DONE]') {
                  yield { type: 'done' }
                  return
                }

                const event = parseEvent(currentEventType, data)
                if (event) {
                  yield event
                  // If we got a done event, stop reading
                  if (event.type === 'done') {
                    return
                  }
                }
              }
            }
          }

          // Process any remaining data in the buffer
          if (buffer.trim()) {
            if (buffer.trim().startsWith('data:')) {
              const data = buffer.trim().slice(5).trim()
              if (data && data !== '[DONE]') {
                const event = parseEvent(currentEventType, data)
                if (event) {
                  yield event
                }
              }
            }
          }
        } finally {
          reader.cancel().catch(() => {
            // Ignore cancel errors
          })
        }
      } catch (err: unknown) {
        // AbortError means the stream was intentionally cancelled
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }
        const message = err instanceof Error ? err.message : 'Connection failed'
        yield { type: 'error', message }
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null
        }
      }
    },
    [url, method, headers, buildBody, parseEvent]
  )

  return sendFn
}
