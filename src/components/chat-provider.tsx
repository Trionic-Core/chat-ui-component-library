import { useCallback, useMemo, useReducer, useRef } from 'react'
import { ChatContext } from '../context/chat-context'
import { chatReducer, initialChatState } from '../context/chat-reducer'
import type { ChatConfig, ChatContextValue, ChatEvent, ChatMessage } from '../types'

interface ChatProviderProps extends ChatConfig {
  children: React.ReactNode
}

let messageCounter = 0
function generateId(): string {
  messageCounter += 1
  return `msg_${Date.now()}_${messageCounter}`
}

/**
 * Root context provider for the chat UI.
 *
 * Wraps useReducer for all chat state and orchestrates the async generator
 * consumption loop for streaming messages. Supports cancellation via
 * generator.return().
 */
export function ChatProvider({
  children,
  onSend,
  sessionAdapter,
  initialMessages,
  initialSessionId = null,
  maxInputLength = 10000,
  placeholder,
  autoFocus = true,
  actionLabels,
}: ChatProviderProps) {
  const [state, dispatch] = useReducer(chatReducer, {
    ...initialChatState,
    messages: initialMessages ?? [],
    activeSessionId: initialSessionId,
  })

  const generatorRef = useRef<AsyncGenerator<ChatEvent, void, undefined> | null>(null)
  const isStreamingRef = useRef(false)

  const config = useMemo<ChatConfig>(
    () => ({
      onSend,
      sessionAdapter,
      initialMessages,
      initialSessionId,
      maxInputLength,
      placeholder,
      autoFocus,
      actionLabels,
    }),
    [onSend, sessionAdapter, initialMessages, initialSessionId, maxInputLength, placeholder, autoFocus, actionLabels]
  )

  const send = useCallback(
    (message: string, metadata?: Record<string, unknown>) => {
      // Prevent double-send while streaming
      if (isStreamingRef.current) return

      const trimmed = message.trim()
      if (!trimmed) return

      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
        metadata,
      }

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      }

      dispatch({ type: 'ADD_USER_MESSAGE', message: userMessage })
      dispatch({ type: 'ADD_ASSISTANT_PLACEHOLDER', message: assistantMessage })
      dispatch({ type: 'SET_INPUT', value: '' })
      dispatch({ type: 'SET_STREAMING', isStreaming: true })
      dispatch({ type: 'SET_CONNECTION_STATUS', status: 'connecting' })

      // Start the async generator consumption loop
      const generator = onSend(trimmed, state.activeSessionId, metadata)
      generatorRef.current = generator
      isStreamingRef.current = true

      ;(async () => {
        try {
          dispatch({ type: 'SET_CONNECTION_STATUS', status: 'streaming' })

          for await (const event of generator) {
            switch (event.type) {
              case 'token':
                dispatch({
                  type: 'APPEND_TOKEN',
                  messageId: assistantMessage.id,
                  text: event.text,
                })
                break

              case 'thinking':
                // Thinking state is derived from:
                // isStreaming && content === '' && no actions
                // No explicit dispatch needed -- the indicator appears automatically
                break

              case 'reasoning':
                dispatch({
                  type: 'APPEND_REASONING',
                  messageId: assistantMessage.id,
                  text: event.text,
                })
                break

              case 'action':
                dispatch({
                  type: 'ADD_ACTION',
                  messageId: assistantMessage.id,
                  action: event.action,
                })
                break

              case 'action_update':
                dispatch({
                  type: 'UPDATE_ACTION',
                  messageId: assistantMessage.id,
                  actionId: event.actionId,
                  status: event.status,
                  detail: event.detail,
                })
                break

              case 'done':
                dispatch({
                  type: 'FINALIZE_MESSAGE',
                  messageId: assistantMessage.id,
                  sessionId: event.sessionId,
                })
                break

              case 'error':
                dispatch({
                  type: 'SET_ERROR',
                  messageId: assistantMessage.id,
                  error: event.message,
                })
                break
            }
          }
        } catch (err) {
          // Generator was cancelled or errored
          const errorMessage =
            err instanceof Error ? err.message : 'Connection lost'
          dispatch({
            type: 'SET_ERROR',
            messageId: assistantMessage.id,
            error: errorMessage,
          })
        } finally {
          dispatch({ type: 'SET_STREAMING', isStreaming: false })
          dispatch({ type: 'SET_CONNECTION_STATUS', status: 'idle' })
          generatorRef.current = null
          isStreamingRef.current = false
        }
      })()
    },
    [onSend, state.activeSessionId]
  )

  const stop = useCallback(() => {
    if (generatorRef.current) {
      generatorRef.current.return(undefined)
    }
  }, [])

  const retry = useCallback(
    (messageId: string) => {
      // Find the errored assistant message and the user message before it
      const msgIndex = state.messages.findIndex((m) => m.id === messageId)
      if (msgIndex < 0) return

      const erroredMessage = state.messages[msgIndex]
      if (erroredMessage.role !== 'assistant' || !erroredMessage.error) return

      // Find the user message immediately before
      const userMessage = state.messages
        .slice(0, msgIndex)
        .reverse()
        .find((m) => m.role === 'user')
      if (!userMessage) return

      // Remove the errored pair and resend
      const remainingMessages = state.messages.filter(
        (m) => m.id !== messageId && m.id !== userMessage.id
      )
      dispatch({ type: 'SET_MESSAGES', messages: remainingMessages })

      // Re-send the original user message
      send(userMessage.content, userMessage.metadata)
    },
    [state.messages, send]
  )

  const setInput = useCallback((value: string) => {
    dispatch({ type: 'SET_INPUT', value })
  }, [])

  const clearMessages = useCallback(() => {
    dispatch({ type: 'RESET' })
  }, [])

  const setMessages = useCallback((messages: ChatMessage[]) => {
    dispatch({ type: 'SET_MESSAGES', messages })
  }, [])

  const loadSession = useCallback(
    async (sessionId: string) => {
      if (!sessionAdapter?.get) return

      try {
        const { session, messages } = await sessionAdapter.get(sessionId)
        dispatch({ type: 'SET_MESSAGES', messages })
        dispatch({ type: 'SET_SESSION', sessionId: session.id })
      } catch {
        // Session load failed -- consumers can check error state
      }
    },
    [sessionAdapter]
  )

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (!sessionAdapter?.delete) return

      try {
        await sessionAdapter.delete(sessionId)
        dispatch({ type: 'REMOVE_SESSION', sessionId })
      } catch {
        // Delete failed silently
      }
    },
    [sessionAdapter]
  )

  const newConversation = useCallback(() => {
    if (isStreamingRef.current) {
      stop()
    }
    dispatch({ type: 'RESET' })
  }, [stop])

  const contextValue = useMemo<ChatContextValue>(
    () => ({
      state,
      config,
      send,
      stop,
      retry,
      setInput,
      clearMessages,
      setMessages,
      loadSession,
      deleteSession,
      newConversation,
    }),
    [state, config, send, stop, retry, setInput, clearMessages, setMessages, loadSession, deleteSession, newConversation]
  )

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  )
}
