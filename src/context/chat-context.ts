import { createContext, useContext } from 'react'
import type { ChatContextValue } from '../types'

export const ChatContext = createContext<ChatContextValue | null>(null)

/**
 * Access the chat context. Must be used within a <ChatProvider>.
 * This is the internal hook -- the public `useChat()` wraps it with
 * a flattened API surface.
 */
export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext)
  if (!ctx) {
    throw new Error(
      'useChatContext must be used within a <ChatProvider>. ' +
      'Wrap your chat components with <ChatProvider onSend={...}>.'
    )
  }
  return ctx
}
