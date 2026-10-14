import type { ChatEvent } from '../types'
import { isValidViewSpec } from '../aui/aui-types'

/**
 * Default event parser: expects JSON in the SSE data field.
 * Maps event types to ChatEvent discriminated union members.
 */
export function defaultParseEvent(eventType: string, data: string): ChatEvent | null {
  try {
    const value: unknown = JSON.parse(data)
    if (!value || typeof value !== 'object') return null
    const parsed = value as Record<string, unknown>

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

      case 'ui_block': {
        // Agentic-UI surface emitted by the backend's render_ui_view tool.
        // The ViewSpec rides either as the data payload itself or nested under
        // a `spec` field. Validate the load-bearing shape (blocks array) and
        // skip anything malformed so a bad surface never breaks the stream.
        const candidate = isValidViewSpec(parsed.spec) ? parsed.spec : parsed
        if (isValidViewSpec(candidate)) {
          return { type: 'ui_block', spec: candidate }
        }
        return null
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
          message: String(parsed.message ?? parsed.detail ?? parsed.error ?? 'Unknown error'),
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
