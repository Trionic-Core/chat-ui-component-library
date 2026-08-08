// ============================================================================
// @cypherx/chat-ui — Public API
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
  ModeSwitchOption,
  ModeSwitchProps,
  // v0.3.0 types — followups, feedback, regenerate
  FollowupsData,
  FollowupsCardProps,
  FeedbackRating,
  FeedbackReasonCategory,
  FeedbackData,
  FeedbackHandler,
  FeedbackPopoverProps,
  // v0.5.0 types — voice (TTS speaker + STT mic)
  VoiceHandler,
  VoiceTranscription,
  VoiceStatus,
  VoiceLocale,
  SpeechStatus,
  SpeechState,
  // v0.6.0 types — dictation language picker
  LanguagePickerProps,
  LanguageOption,
  LanguageSearchIndex,
  DictationState,
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
export { ModeSwitch } from './components/mode-switch'

// v0.3.0 components — followups MCQ + dislike-reason popover
export { FollowupsCard } from './components/followups-card'
export { FeedbackPopover } from './components/feedback-popover'

// v0.5.0 components — voice. The mic is already mounted inside PromptInput and
// ChatInput; exported for consumers composing their own input surface.
export { VoiceRecordButton } from './components/voice-record-button'

// v0.6.0 components — dictation language. Mounted beside the mic in PromptInput
// and ChatInput; exported for the same reason.
export { LanguagePicker } from './components/language-picker'

// AUI (Agentic UI) — renders ui_block ViewSpecs below assistant messages
export { AuiView } from './aui'
export { isValidViewSpec, isValidBlock } from './aui'
export type {
  AuiViewProps,
  ViewSpec,
  Block,
  BlockType,
  MetricGroupBlock,
  ChartBlock,
  TableBlock,
  TextBlock,
  ActionsBlock,
  Metric,
  MetricDelta,
  ChartType,
  ChartFieldRef,
  ChartBlockOptions,
  TableColumn,
  ActionItem,
  ValueFormat,
  CellValue,
  DataRow,
} from './aui'

// Context
export { useChatContext } from './context/chat-context'

// Hooks
export { useChat } from './hooks/use-chat'
export { useSSEStream } from './hooks/use-sse-stream'
export { useChatScroll } from './hooks/use-chat-scroll'
export { useStreamingText } from './hooks/use-streaming-text'
export { useSessionManager } from './hooks/use-session-manager'
export { useVoiceRecorder } from './hooks/use-voice-recorder'

// Utilities
export { cn } from './utils/cn'
export { formatRelativeTime } from './utils/format-time'
export { renderMarkdown } from './utils/markdown'
// Voice audio conversion — the mic applies this itself; exported for consumers
// uploading recordings they captured outside the library.
export { blobToWav, encodeWav, canConvertToWav, TARGET_SAMPLE_RATE, WAV_CONTENT_TYPE } from './utils/wav'
export { MAX_RECORDING_SECONDS } from './utils/voice'
