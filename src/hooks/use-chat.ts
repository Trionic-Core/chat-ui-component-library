import { useChatContext } from '../context/chat-context'
import type { ChatMessage, ChatSession } from '../types'

/**
 * The primary consumer hook for interacting with the chat.
 *
 * Returns a flat API surface with all state and actions needed to build
 * a chat interface. Must be used within a <ChatProvider>.
 *
 * This is a thin wrapper around `useChatContext()` that destructures the
 * context value into a flat object for ergonomic consumption.
 */
export function useChat(): {
  // State
  messages: ChatMessage[]
  isStreaming: boolean
  activeSessionId: string | null
  sessions: ChatSession[]
  connectionStatus: 'idle' | 'connecting' | 'streaming' | 'error'
  error: string | null
  inputValue: string

  // Actions
  send: (message: string, metadata?: Record<string, unknown>) => void
  stop: () => void
  retry: (messageId: string) => void
  setInput: (value: string) => void
  clearMessages: () => void
  loadSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  newConversation: () => void
} {
  const ctx = useChatContext()

  return {
    // State
    messages: ctx.state.messages,
    isStreaming: ctx.state.isStreaming,
    activeSessionId: ctx.state.activeSessionId,
    sessions: ctx.state.sessions,
    connectionStatus: ctx.state.connectionStatus,
    error: ctx.state.error,
    inputValue: ctx.state.inputValue,

    // Actions
    send: ctx.send,
    stop: ctx.stop,
    retry: ctx.retry,
    setInput: ctx.setInput,
    clearMessages: ctx.clearMessages,
    loadSession: ctx.loadSession,
    deleteSession: ctx.deleteSession,
    newConversation: ctx.newConversation,
  }
}
