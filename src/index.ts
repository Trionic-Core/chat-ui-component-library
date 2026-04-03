// ============================================================================
// @cypherx/chat-ui — Public API
// ============================================================================

// ============================================================================
// @cypherx/chat-ui v0.2.0 — Public API
// ============================================================================

// Types
export type {
  ChatAction,
  ChatSession,
  ChatEvent,
  ChatSendFn,
  SessionAdapter,
  SSEStreamConfig,
  ChatConfig,
  ChatContainerProps,
  MessageListProps,
  ChatMessageProps,
  StreamingTextProps,
  ActionIndicatorProps,
  ThinkingIndicatorProps,
  ChatInputProps,
  CodeBlockProps,
  EmptyStateProps,
  SessionListProps,
  SessionSelectorProps,
  ChatWidgetProps,
  ChatContextValue,
  // v0.2.0 types
  TextShimmerProps,
  MessageActionItem,
  MessageActionBarProps,
  ChainOfThoughtProps,
  FileAttachment,
  PromptInputProps,
} from './types'

// Export the ChatMessage interface under an alias to avoid collision
// with the ChatMessage component.
export type { ChatMessage as ChatMessageData } from './types'

// Components
export { ChatProvider } from './components/chat-provider'
export { ChatContainer } from './components/chat-container'
export { MessageList } from './components/message-list'
export { ChatMessage } from './components/chat-message'
export { StreamingText } from './components/streaming-text'
export { ActionIndicator } from './components/action-indicator'
export { ThinkingIndicator } from './components/thinking-indicator'
export { ChatInput } from './components/chat-input'
export { CodeBlock } from './components/code-block'
export { EmptyState } from './components/empty-state'
export { SessionList } from './components/session-list'
export { SessionSelector } from './components/session-selector'
export { ChatWidget } from './components/chat-widget'

// v0.2.0 components
export { TextShimmer } from './components/text-shimmer'
export { MessageActionBar } from './components/message-action-bar'
export { ChainOfThought } from './components/chain-of-thought'
export { PromptInput } from './components/prompt-input'

// Context
export { useChatContext } from './context/chat-context'

// Hooks
export { useChat } from './hooks/use-chat'
export { useSSEStream } from './hooks/use-sse-stream'
export { useChatScroll } from './hooks/use-chat-scroll'
export { useStreamingText } from './hooks/use-streaming-text'
export { useSessionManager } from './hooks/use-session-manager'

// Utilities
export { cn } from './utils/cn'
export { formatRelativeTime } from './utils/format-time'
export { renderMarkdown } from './utils/markdown'
