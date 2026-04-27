import type { ReactNode } from 'react'

// ============================================================================
// Core Message Types
// ============================================================================

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  isStreaming?: boolean
  actions?: ChatAction[]
  reasoning?: string
  error?: boolean
  /** Structured follow-up suggestions emitted by the agent (assistant only). */
  followups?: FollowupsData
  /** Locked-in selection from a followups card. Once set, the card renders read-only. */
  followupsSelection?: string[]
  /** The user's like/dislike rating on this message (assistant only). */
  feedback?: FeedbackData | null
  /** Backend-issued message id (set on the assistant turn after `done` lands). */
  backendMessageId?: string
  metadata?: Record<string, unknown>
}

// ============================================================================
// Followup Suggestions (emitted by backend `suggest_followups` agent tool)
// ============================================================================

export interface FollowupsData {
  /** Agent-written intro line, e.g. "Want to dig deeper?". */
  label: string
  /** 2-5 options. The last is always "Other (specify)" appended by backend. */
  options: string[]
  /** Single-select if false (default), multi-select if true. */
  multi: boolean
}

// ============================================================================
// Feedback (Like / Dislike)
// ============================================================================

export type FeedbackRating = 'up' | 'down'

export type FeedbackReasonCategory =
  | 'incorrect'
  | 'hallucinated'
  | 'unhelpful'
  | 'too_verbose'
  | 'too_brief'
  | 'unsafe'
  | 'off_topic'
  | 'other'

export interface FeedbackData {
  rating: FeedbackRating
  reasonCategory?: FeedbackReasonCategory
  reasonText?: string
}

/**
 * Optional handler the consumer wires to a backend feedback endpoint.
 * Provide via ChatConfig.feedback to enable thumbs-up / thumbs-down on
 * assistant messages.
 */
export interface FeedbackHandler {
  /** Submit (or update) the user's feedback for an assistant message. */
  submit: (backendMessageId: string, feedback: FeedbackData) => Promise<void>
  /** Remove the user's feedback for a message. */
  remove: (backendMessageId: string) => Promise<void>
}

export interface ChatAction {
  id: string
  type: string
  label: string
  status: 'pending' | 'running' | 'completed' | 'error'
  detail?: string
  timestamp: Date
  children?: ChatAction[]
}

// ============================================================================
// Session Types
// ============================================================================

export interface ChatSession {
  id: string
  title: string
  lastMessage?: string
  messageCount: number
  createdAt: Date
  updatedAt: Date
  metadata?: Record<string, unknown>
}

// ============================================================================
// Streaming Event Protocol
// ============================================================================

export type ChatEvent =
  | { type: 'token'; text: string }
  | { type: 'thinking'; active: boolean }
  | { type: 'reasoning'; text: string }
  | { type: 'action'; action: ChatAction }
  | { type: 'action_update'; actionId: string; status: ChatAction['status']; detail?: string }
  | { type: 'followups'; followups: FollowupsData }
  | { type: 'done'; sessionId?: string; messageId?: string }
  | { type: 'error'; message: string; code?: string }

// ============================================================================
// Adapter Interfaces (Backend-Agnostic)
// ============================================================================

/**
 * The core send function. Consumers implement this as an AsyncGenerator
 * that yields ChatEvent objects. The provider consumes these events
 * and updates state accordingly.
 */
export type ChatSendFn = (
  message: string,
  sessionId: string | null,
  metadata?: Record<string, unknown>
) => AsyncGenerator<ChatEvent, void, undefined>

/**
 * Session adapter for CRUD operations.
 * All methods are optional -- if not provided, session features are disabled.
 */
export interface SessionAdapter {
  list: () => Promise<ChatSession[]>
  get?: (sessionId: string) => Promise<{ session: ChatSession; messages: ChatMessage[] }>
  create?: (title?: string) => Promise<ChatSession>
  delete?: (sessionId: string) => Promise<void>
  rename?: (sessionId: string, title: string) => Promise<void>
}

// ============================================================================
// SSE Stream Configuration
// ============================================================================

export interface SSEStreamConfig {
  /** The URL to connect to. */
  url: string
  /** HTTP method. Default: 'POST'. */
  method?: 'GET' | 'POST'
  /** Additional headers to send with the request. */
  headers?: Record<string, string>
  /** Transform the message into the request body. */
  buildBody?: (message: string, sessionId: string | null) => unknown
  /** Parse an SSE data line into a ChatEvent. Return null to skip. */
  parseEvent?: (eventType: string, data: string) => ChatEvent | null
}

// ============================================================================
// Provider Configuration
// ============================================================================

export interface ChatConfig {
  /** The send function -- required. Returns an AsyncGenerator of ChatEvents. */
  onSend: ChatSendFn

  /** Optional session adapter for persistence. */
  sessionAdapter?: SessionAdapter

  /** Initial messages to populate the chat. */
  initialMessages?: ChatMessage[]

  /** Initial session ID. */
  initialSessionId?: string | null

  /** Maximum input length in characters. Default: 10000. */
  maxInputLength?: number

  /** Placeholder text for the input. */
  placeholder?: string

  /** Whether to auto-focus the input on mount. Default: true. */
  autoFocus?: boolean

  /** Custom action label resolver. Maps action.type to human-readable labels. */
  actionLabels?: Record<string, { active: string; completed: string }>

  /**
   * Optional feedback handler. When provided, thumbs-up / thumbs-down buttons
   * appear in the action bar of assistant messages, and submitting calls
   * `feedback.submit(backendMessageId, ...)` against the consumer's endpoint.
   */
  feedback?: FeedbackHandler

  /**
   * When true, the LAST user message renders an Edit affordance and the LAST
   * assistant message renders a Regenerate affordance. Both submit via
   * `send(text, { regenerate: true })` so the backend trims the tail. Default: false.
   */
  enableRegenerate?: boolean
}

// ============================================================================
// Component Prop Types
// ============================================================================

export interface ChatContainerProps {
  /** Show session sidebar. Default: false. */
  showSessions?: boolean
  /** Session sidebar position. Default: 'left'. */
  sessionPosition?: 'left' | 'right'
  /** Custom empty state component. */
  emptyState?: ReactNode
  /** Additional class names for the container. */
  className?: string
  /** Slot for additional controls in the header. */
  headerSlot?: ReactNode
  /** Slot for addon buttons in the input area (left of send). */
  inputAddonSlot?: ReactNode
}

export interface MessageListProps {
  /** Custom message renderer override. */
  renderMessage?: (message: ChatMessage, index: number) => ReactNode
  /** Additional class names. */
  className?: string
}

export interface ChatMessageProps {
  message: ChatMessage
  /** Whether this message is currently streaming. */
  isStreaming?: boolean
  /** Whether this is the LAST message in the list. Drives edit/regenerate affordances. */
  isLast?: boolean
  /** Called when user clicks retry on an errored message. */
  onRetry?: () => void
  /** Additional class names. */
  className?: string
}

export interface StreamingTextProps {
  /** The full text to animate. */
  text: string
  /** Characters revealed per frame. Default: 2. */
  charsPerFrame?: number
  /** Whether animation is active. Default: true. */
  animate?: boolean
  /** Callback when animation completes. */
  onComplete?: () => void
  /** Additional class names. */
  className?: string
}

export interface ActionIndicatorProps {
  actions: ChatAction[]
  /** Whether any action is still running. */
  isActive?: boolean
  /** Additional class names. */
  className?: string
}

// ============================================================================
// v0.2.0 — New Component Prop Types
// ============================================================================

export interface TextShimmerProps {
  /** Content to render with shimmer effect. */
  children: ReactNode
  /** HTML element to render as. Default: 'span'. */
  as?: 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  /** Animation duration in seconds. Default: 2. */
  duration?: number
  /** Gradient spread (5-45). Higher = wider highlight. Default: 20. */
  spread?: number
  /** Additional class names. */
  className?: string
}

export interface MessageActionItem {
  id: string
  icon: ReactNode
  label: string
  onClick: () => void
}

export interface MessageActionBarProps {
  /** The message content string (used for copy). */
  content?: string
  /** Additional custom actions beyond copy/retry/edit. */
  actions?: MessageActionItem[]
  /** Called after content is copied to clipboard. */
  onCopy?: () => void
  /** Called when retry is clicked. Omit to hide retry button. */
  onRetry?: () => void
  /** Called when edit is clicked. Omit to hide edit button. */
  onEdit?: () => void
  /** Current feedback rating. When defined the like/dislike buttons render. */
  feedback?: FeedbackData | null
  /** Submit handler for like/dislike. Omit to hide feedback buttons. */
  onFeedback?: (rating: FeedbackRating) => void
  /** Optional handler invoked when the user opens the dislike reason popover. */
  onFeedbackDetail?: () => void
  /** Additional class names. */
  className?: string
}

export interface FollowupsCardProps {
  /** The data emitted by the agent's `suggest_followups` tool. */
  followups: FollowupsData
  /** Locked-in selection (renders read-only). When set, the card no longer accepts input. */
  lockedSelection?: string[]
  /** Called when the user submits one or more options. The joined text is what gets sent as the next user message. */
  onSelect: (options: string[]) => void
  /** Additional class names. */
  className?: string
}

export interface FeedbackPopoverProps {
  /** The current rating context (the popover only opens for `down` in v1). */
  rating: FeedbackRating
  /** Called when the user submits the feedback (with optional reason). */
  onSubmit: (reason: { category?: FeedbackReasonCategory; text?: string }) => void
  /** Called when the user dismisses the popover without submitting. */
  onDismiss: () => void
  /** Additional class names. */
  className?: string
}

export interface ChainOfThoughtProps {
  /** The list of actions/steps to display. */
  actions: ChatAction[]
  /** Whether actions are still running (auto-expands accordion). */
  isActive?: boolean
  /** Thinking label shown during active state. Default: 'Thinking'. */
  thinkingLabel?: string
  /** Additional class names. */
  className?: string
}

export interface FileAttachment {
  id: string
  file: File
  name: string
  size: number
  type: string
}

export interface PromptInputProps {
  /** Override placeholder from provider config. */
  placeholder?: string
  /** Whether the input is disabled. */
  disabled?: boolean
  /** Max rows before scrolling. Default: 6. */
  maxRows?: number
  /** Max height in pixels. Default: 240. */
  maxHeight?: number
  /** Enable file attachments. Default: false. */
  allowAttachments?: boolean
  /** Accepted file types (e.g. 'image/*,.pdf'). */
  acceptFileTypes?: string
  /** Called when files are attached. */
  onFilesAttached?: (files: FileAttachment[]) => void
  /** Suggestion chips shown below the input when empty. */
  suggestions?: string[]
  /** Called when a suggestion chip is clicked. */
  onSuggestionClick?: (suggestion: string) => void
  /** Slot for addon buttons (left of send). */
  addonSlot?: ReactNode
  /** Additional class names. */
  className?: string
}

export interface ThinkingIndicatorProps {
  /** Label text next to the dots. Default: 'Thinking'. */
  label?: string
  /** Additional class names. */
  className?: string
}

export interface ChatInputProps {
  /** Override placeholder from provider config. */
  placeholder?: string
  /** Whether the input is disabled. */
  disabled?: boolean
  /** Max rows before scrolling. Default: 6. */
  maxRows?: number
  /** Slot for addon buttons (left of send button). */
  addonSlot?: ReactNode
  /** Additional class names. */
  className?: string
}

export interface CodeBlockProps {
  /** The code string to render. */
  code: string
  /** Programming language for syntax highlighting. */
  language?: string
  /** Show line numbers. Default: false. */
  showLineNumbers?: boolean
  /** Show copy button. Default: true. */
  showCopy?: boolean
  /** Max height before scrolling (CSS value). Default: '400px'. */
  maxHeight?: string
  /** Additional class names. */
  className?: string
}

export interface EmptyStateProps {
  /** Icon to display. Defaults to a chat icon. */
  icon?: ReactNode
  /** Heading text. */
  title?: string
  /** Description text. */
  description?: string
  /** Suggested prompts shown as clickable chips. */
  suggestions?: string[]
  /** Called when a suggestion is clicked. */
  onSuggestionClick?: (suggestion: string) => void
  /** Additional class names. */
  className?: string
}

export interface SessionListProps {
  /** Called when a session is selected. */
  onSelectSession?: (sessionId: string) => void
  /** Called when "New conversation" is clicked. */
  onNewConversation?: () => void
  /** Additional class names. */
  className?: string
}

export interface SessionSelectorProps {
  /** Additional class names. */
  className?: string
}

export interface ChatWidgetProps {
  /** Position of the FAB button. Default: 'bottom-right'. */
  position?: 'bottom-right' | 'bottom-left'
  /** Whether the widget is open by default. Default: false. */
  defaultOpen?: boolean
  /** Width of the widget modal on desktop (CSS value). Default: '420px'. */
  width?: string
  /** Height of the widget modal on desktop (CSS value). Default: '600px'. */
  height?: string
  /** Custom icon for the FAB button. */
  fabIcon?: ReactNode
  /** Label shown above the FAB on hover. */
  fabLabel?: string
  /** Additional class names for the widget container. */
  className?: string
  /** Custom empty state. */
  emptyState?: ReactNode
  /** Slot for addon buttons in the input area. */
  inputAddonSlot?: ReactNode
  /** Slot for custom header content inside the widget. */
  headerSlot?: ReactNode
}

// ============================================================================
// Internal State (used by reducer)
// ============================================================================

/** @internal */
export interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  activeSessionId: string | null
  sessions: ChatSession[]
  inputValue: string
  error: string | null
  connectionStatus: 'idle' | 'connecting' | 'streaming' | 'error'
}

/** @internal */
export type ChatReducerAction =
  | { type: 'ADD_USER_MESSAGE'; message: ChatMessage }
  | { type: 'ADD_ASSISTANT_PLACEHOLDER'; message: ChatMessage }
  | { type: 'APPEND_TOKEN'; messageId: string; text: string }
  | { type: 'APPEND_REASONING'; messageId: string; text: string }
  | { type: 'ADD_ACTION'; messageId: string; action: ChatAction }
  | { type: 'UPDATE_ACTION'; messageId: string; actionId: string; status: ChatAction['status']; detail?: string }
  | { type: 'SET_FOLLOWUPS'; messageId: string; followups: FollowupsData }
  | { type: 'LOCK_FOLLOWUPS'; messageId: string; selection: string[] }
  | { type: 'SET_FEEDBACK'; messageId: string; feedback: FeedbackData | null }
  | { type: 'FINALIZE_MESSAGE'; messageId: string; sessionId?: string; backendMessageId?: string }
  | { type: 'SET_ERROR'; messageId: string; error: string }
  | { type: 'SET_MESSAGES'; messages: ChatMessage[] }
  | { type: 'SET_STREAMING'; isStreaming: boolean }
  | { type: 'SET_SESSION'; sessionId: string | null }
  | { type: 'SET_SESSIONS'; sessions: ChatSession[] }
  | { type: 'REMOVE_SESSION'; sessionId: string }
  | { type: 'SET_INPUT'; value: string }
  | { type: 'SET_CONNECTION_STATUS'; status: ChatState['connectionStatus'] }
  | { type: 'TRIM_LAST_PAIR' }
  | { type: 'RESET' }

// ============================================================================
// Context Types
// ============================================================================

// ============================================================================
// Mode Switch Types
// ============================================================================

export interface ModeSwitchOption {
  /** Unique value for this option */
  value: string
  /** Display label */
  label: string
  /** Optional icon (React node) */
  icon?: React.ReactNode
}

export interface ModeSwitchProps {
  /** The available options (2-4 items) */
  options: ModeSwitchOption[]
  /** Currently active value */
  value: string
  /** Called when the user selects a different option */
  onChange: (value: string) => void
  /** Additional CSS class */
  className?: string
}

// ============================================================================
// Context Types
// ============================================================================

export interface ChatContextValue {
  state: ChatState
  config: ChatConfig
  send: (message: string, metadata?: Record<string, unknown>) => void
  stop: () => void
  retry: (messageId: string) => void
  setInput: (value: string) => void
  clearMessages: () => void
  setMessages: (messages: ChatMessage[]) => void
  loadSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  newConversation: () => void
  /** Pick (or finalize) one or more options from a followups card. Sends the joined text as the next user message. */
  selectFollowup: (messageId: string, options: string[]) => void
  /** Submit feedback on an assistant message. Requires ChatConfig.feedback. */
  submitFeedback: (messageId: string, feedback: FeedbackData) => Promise<void>
  /** Remove feedback on an assistant message. Requires ChatConfig.feedback. */
  removeFeedback: (messageId: string) => Promise<void>
  /** Edit the last user message and regenerate. Removes the last user+assistant pair locally and re-sends with regenerate=true. */
  editAndRegenerate: (newContent: string) => void
  /** Regenerate the last assistant message using the same prompt + regenerate=true. */
  regenerateLast: () => void
}
