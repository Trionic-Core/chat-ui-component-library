import * as react from 'react';
import { ReactNode } from 'react';
import * as react_jsx_runtime from 'react/jsx-runtime';
import { ClassValue } from 'clsx';

interface ChatMessage$1 {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    isStreaming?: boolean;
    actions?: ChatAction[];
    reasoning?: string;
    error?: boolean;
    /** Structured follow-up suggestions emitted by the agent (assistant only). */
    followups?: FollowupsData;
    /** Locked-in selection from a followups card. Once set, the card renders read-only. */
    followupsSelection?: string[];
    /** The user's like/dislike rating on this message (assistant only). */
    feedback?: FeedbackData | null;
    /** Backend-issued message id (set on the assistant turn after `done` lands). */
    backendMessageId?: string;
    metadata?: Record<string, unknown>;
}
interface FollowupsData {
    /** Agent-written intro line, e.g. "Want to dig deeper?". */
    label: string;
    /** 2-5 options. The last is always "Other (specify)" appended by backend. */
    options: string[];
    /** Single-select if false (default), multi-select if true. */
    multi: boolean;
}
type FeedbackRating = 'up' | 'down';
type FeedbackReasonCategory = 'incorrect' | 'hallucinated' | 'unhelpful' | 'too_verbose' | 'too_brief' | 'unsafe' | 'off_topic' | 'other';
interface FeedbackData {
    rating: FeedbackRating;
    reasonCategory?: FeedbackReasonCategory;
    reasonText?: string;
}
/**
 * Optional handler the consumer wires to a backend feedback endpoint.
 * Provide via ChatConfig.feedback to enable thumbs-up / thumbs-down on
 * assistant messages.
 */
interface FeedbackHandler {
    /** Submit (or update) the user's feedback for an assistant message. */
    submit: (backendMessageId: string, feedback: FeedbackData) => Promise<void>;
    /** Remove the user's feedback for a message. */
    remove: (backendMessageId: string) => Promise<void>;
}
interface ChatAction {
    id: string;
    type: string;
    label: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    detail?: string;
    timestamp: Date;
    children?: ChatAction[];
}
interface ChatSession {
    id: string;
    title: string;
    lastMessage?: string;
    messageCount: number;
    createdAt: Date;
    updatedAt: Date;
    metadata?: Record<string, unknown>;
}
type ChatEvent = {
    type: 'token';
    text: string;
} | {
    type: 'thinking';
    active: boolean;
} | {
    type: 'reasoning';
    text: string;
} | {
    type: 'action';
    action: ChatAction;
} | {
    type: 'action_update';
    actionId: string;
    status: ChatAction['status'];
    detail?: string;
} | {
    type: 'followups';
    followups: FollowupsData;
} | {
    type: 'done';
    sessionId?: string;
    messageId?: string;
} | {
    type: 'error';
    message: string;
    code?: string;
};
/**
 * The core send function. Consumers implement this as an AsyncGenerator
 * that yields ChatEvent objects. The provider consumes these events
 * and updates state accordingly.
 */
type ChatSendFn = (message: string, sessionId: string | null, metadata?: Record<string, unknown>) => AsyncGenerator<ChatEvent, void, undefined>;
/**
 * Session adapter for CRUD operations.
 * All methods are optional -- if not provided, session features are disabled.
 */
interface SessionAdapter {
    list: () => Promise<ChatSession[]>;
    get?: (sessionId: string) => Promise<{
        session: ChatSession;
        messages: ChatMessage$1[];
    }>;
    create?: (title?: string) => Promise<ChatSession>;
    delete?: (sessionId: string) => Promise<void>;
    rename?: (sessionId: string, title: string) => Promise<void>;
}
interface SSEStreamConfig {
    /** The URL to connect to. */
    url: string;
    /** HTTP method. Default: 'POST'. */
    method?: 'GET' | 'POST';
    /** Additional headers to send with the request. */
    headers?: Record<string, string>;
    /** Transform the message into the request body. */
    buildBody?: (message: string, sessionId: string | null) => unknown;
    /** Parse an SSE data line into a ChatEvent. Return null to skip. */
    parseEvent?: (eventType: string, data: string) => ChatEvent | null;
}
interface ChatConfig {
    /** The send function -- required. Returns an AsyncGenerator of ChatEvents. */
    onSend: ChatSendFn;
    /** Optional session adapter for persistence. */
    sessionAdapter?: SessionAdapter;
    /** Initial messages to populate the chat. */
    initialMessages?: ChatMessage$1[];
    /** Initial session ID. */
    initialSessionId?: string | null;
    /** Maximum input length in characters. Default: 10000. */
    maxInputLength?: number;
    /** Placeholder text for the input. */
    placeholder?: string;
    /** Whether to auto-focus the input on mount. Default: true. */
    autoFocus?: boolean;
    /** Custom action label resolver. Maps action.type to human-readable labels. */
    actionLabels?: Record<string, {
        active: string;
        completed: string;
    }>;
    /**
     * Optional feedback handler. When provided, thumbs-up / thumbs-down buttons
     * appear in the action bar of assistant messages, and submitting calls
     * `feedback.submit(backendMessageId, ...)` against the consumer's endpoint.
     */
    feedback?: FeedbackHandler;
    /**
     * When true, the LAST user message renders an Edit affordance and the LAST
     * assistant message renders a Regenerate affordance. Both submit via
     * `send(text, { regenerate: true })` so the backend trims the tail. Default: false.
     */
    enableRegenerate?: boolean;
}
interface ChatContainerProps {
    /** Show session sidebar. Default: false. */
    showSessions?: boolean;
    /** Session sidebar position. Default: 'left'. */
    sessionPosition?: 'left' | 'right';
    /** Custom empty state component. */
    emptyState?: ReactNode;
    /** Additional class names for the container. */
    className?: string;
    /** Slot for additional controls in the header. */
    headerSlot?: ReactNode;
    /** Slot for addon buttons in the input area (left of send). */
    inputAddonSlot?: ReactNode;
}
interface MessageListProps {
    /** Custom message renderer override. */
    renderMessage?: (message: ChatMessage$1, index: number) => ReactNode;
    /** Additional class names. */
    className?: string;
}
interface ChatMessageProps {
    message: ChatMessage$1;
    /** Whether this message is currently streaming. */
    isStreaming?: boolean;
    /** Whether this is the LAST message in the list. Drives edit/regenerate affordances. */
    isLast?: boolean;
    /** Called when user clicks retry on an errored message. */
    onRetry?: () => void;
    /** Additional class names. */
    className?: string;
}
interface StreamingTextProps {
    /** The full text to animate. */
    text: string;
    /** Characters revealed per frame. Default: 2. */
    charsPerFrame?: number;
    /** Whether animation is active. Default: true. */
    animate?: boolean;
    /** Callback when animation completes. */
    onComplete?: () => void;
    /** Additional class names. */
    className?: string;
}
interface ActionIndicatorProps {
    actions: ChatAction[];
    /** Whether any action is still running. */
    isActive?: boolean;
    /** Additional class names. */
    className?: string;
}
interface TextShimmerProps {
    /** Content to render with shimmer effect. */
    children: ReactNode;
    /** HTML element to render as. Default: 'span'. */
    as?: 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    /** Animation duration in seconds. Default: 2. */
    duration?: number;
    /** Gradient spread (5-45). Higher = wider highlight. Default: 20. */
    spread?: number;
    /** Additional class names. */
    className?: string;
}
interface MessageActionItem {
    id: string;
    icon: ReactNode;
    label: string;
    onClick: () => void;
}
interface MessageActionBarProps {
    /** The message content string (used for copy). */
    content?: string;
    /** Additional custom actions beyond copy/retry/edit. */
    actions?: MessageActionItem[];
    /** Called after content is copied to clipboard. */
    onCopy?: () => void;
    /** Called when retry is clicked. Omit to hide retry button. */
    onRetry?: () => void;
    /** Called when edit is clicked. Omit to hide edit button. */
    onEdit?: () => void;
    /** Current feedback rating. When defined the like/dislike buttons render. */
    feedback?: FeedbackData | null;
    /** Submit handler for like/dislike. Omit to hide feedback buttons. */
    onFeedback?: (rating: FeedbackRating) => void;
    /** Optional handler invoked when the user opens the dislike reason popover. */
    onFeedbackDetail?: () => void;
    /** Additional class names. */
    className?: string;
}
interface FollowupsCardProps {
    /** The data emitted by the agent's `suggest_followups` tool. */
    followups: FollowupsData;
    /** Locked-in selection (renders read-only). When set, the card no longer accepts input. */
    lockedSelection?: string[];
    /** Called when the user submits one or more options. The joined text is what gets sent as the next user message. */
    onSelect: (options: string[]) => void;
    /** Additional class names. */
    className?: string;
}
interface FeedbackPopoverProps {
    /** The current rating context (the popover only opens for `down` in v1). */
    rating: FeedbackRating;
    /** Called when the user submits the feedback (with optional reason). */
    onSubmit: (reason: {
        category?: FeedbackReasonCategory;
        text?: string;
    }) => void;
    /** Called when the user dismisses the popover without submitting. */
    onDismiss: () => void;
    /** Additional class names. */
    className?: string;
}
interface ChainOfThoughtProps {
    /** The list of actions/steps to display. */
    actions: ChatAction[];
    /** Whether actions are still running (auto-expands accordion). */
    isActive?: boolean;
    /** Thinking label shown during active state. Default: 'Thinking'. */
    thinkingLabel?: string;
    /** Additional class names. */
    className?: string;
}
interface FileAttachment {
    id: string;
    file: File;
    name: string;
    size: number;
    type: string;
}
interface PromptInputProps {
    /** Override placeholder from provider config. */
    placeholder?: string;
    /** Whether the input is disabled. */
    disabled?: boolean;
    /** Max rows before scrolling. Default: 6. */
    maxRows?: number;
    /** Max height in pixels. Default: 240. */
    maxHeight?: number;
    /** Enable file attachments. Default: false. */
    allowAttachments?: boolean;
    /** Accepted file types (e.g. 'image/*,.pdf'). */
    acceptFileTypes?: string;
    /** Called when files are attached. */
    onFilesAttached?: (files: FileAttachment[]) => void;
    /** Suggestion chips shown below the input when empty. */
    suggestions?: string[];
    /** Called when a suggestion chip is clicked. */
    onSuggestionClick?: (suggestion: string) => void;
    /** Slot for addon buttons (left of send). */
    addonSlot?: ReactNode;
    /** Additional class names. */
    className?: string;
}
interface ThinkingIndicatorProps {
    /** Label text next to the dots. Default: 'Thinking'. */
    label?: string;
    /** Additional class names. */
    className?: string;
}
interface ChatInputProps {
    /** Override placeholder from provider config. */
    placeholder?: string;
    /** Whether the input is disabled. */
    disabled?: boolean;
    /** Max rows before scrolling. Default: 6. */
    maxRows?: number;
    /** Slot for addon buttons (left of send button). */
    addonSlot?: ReactNode;
    /** Additional class names. */
    className?: string;
}
interface CodeBlockProps {
    /** The code string to render. */
    code: string;
    /** Programming language for syntax highlighting. */
    language?: string;
    /** Show line numbers. Default: false. */
    showLineNumbers?: boolean;
    /** Show copy button. Default: true. */
    showCopy?: boolean;
    /** Max height before scrolling (CSS value). Default: '400px'. */
    maxHeight?: string;
    /** Additional class names. */
    className?: string;
}
interface EmptyStateProps {
    /** Icon to display. Defaults to a chat icon. */
    icon?: ReactNode;
    /** Heading text. */
    title?: string;
    /** Description text. */
    description?: string;
    /** Suggested prompts shown as clickable chips. */
    suggestions?: string[];
    /** Called when a suggestion is clicked. */
    onSuggestionClick?: (suggestion: string) => void;
    /** Additional class names. */
    className?: string;
}
interface SessionListProps {
    /** Called when a session is selected. */
    onSelectSession?: (sessionId: string) => void;
    /** Called when "New conversation" is clicked. */
    onNewConversation?: () => void;
    /** Additional class names. */
    className?: string;
}
interface SessionSelectorProps {
    /** Additional class names. */
    className?: string;
}
interface ChatWidgetProps {
    /** Position of the FAB button. Default: 'bottom-right'. */
    position?: 'bottom-right' | 'bottom-left';
    /** Whether the widget is open by default. Default: false. */
    defaultOpen?: boolean;
    /** Width of the widget modal on desktop (CSS value). Default: '420px'. */
    width?: string;
    /** Height of the widget modal on desktop (CSS value). Default: '600px'. */
    height?: string;
    /** Custom icon for the FAB button. */
    fabIcon?: ReactNode;
    /** Label shown above the FAB on hover. */
    fabLabel?: string;
    /** Additional class names for the widget container. */
    className?: string;
    /** Custom empty state. */
    emptyState?: ReactNode;
    /** Slot for addon buttons in the input area. */
    inputAddonSlot?: ReactNode;
    /** Slot for custom header content inside the widget. */
    headerSlot?: ReactNode;
}
/** @internal */
interface ChatState {
    messages: ChatMessage$1[];
    isStreaming: boolean;
    activeSessionId: string | null;
    sessions: ChatSession[];
    inputValue: string;
    error: string | null;
    connectionStatus: 'idle' | 'connecting' | 'streaming' | 'error';
}
interface ModeSwitchOption$1 {
    /** Unique value for this option */
    value: string;
    /** Display label */
    label: string;
    /** Optional icon (React node) */
    icon?: React.ReactNode;
}
interface ModeSwitchProps$1 {
    /** The available options (2-4 items) */
    options: ModeSwitchOption$1[];
    /** Currently active value */
    value: string;
    /** Called when the user selects a different option */
    onChange: (value: string) => void;
    /** Additional CSS class */
    className?: string;
}
interface ChatContextValue {
    state: ChatState;
    config: ChatConfig;
    send: (message: string, metadata?: Record<string, unknown>) => void;
    stop: () => void;
    retry: (messageId: string) => void;
    setInput: (value: string) => void;
    clearMessages: () => void;
    setMessages: (messages: ChatMessage$1[]) => void;
    loadSession: (sessionId: string) => Promise<void>;
    deleteSession: (sessionId: string) => Promise<void>;
    newConversation: () => void;
    /** Pick (or finalize) one or more options from a followups card. Sends the joined text as the next user message. */
    selectFollowup: (messageId: string, options: string[]) => void;
    /** Submit feedback on an assistant message. Requires ChatConfig.feedback. */
    submitFeedback: (messageId: string, feedback: FeedbackData) => Promise<void>;
    /** Remove feedback on an assistant message. Requires ChatConfig.feedback. */
    removeFeedback: (messageId: string) => Promise<void>;
    /** Edit the last user message and regenerate. Removes the last user+assistant pair locally and re-sends with regenerate=true. */
    editAndRegenerate: (newContent: string) => void;
    /** Regenerate the last assistant message using the same prompt + regenerate=true. */
    regenerateLast: () => void;
}

interface ChatProviderProps extends ChatConfig {
    children: React.ReactNode;
}
/**
 * Root context provider for the chat UI.
 *
 * Wraps useReducer for all chat state and orchestrates the async generator
 * consumption loop for streaming messages. Supports cancellation via
 * generator.return().
 */
declare function ChatProvider({ children, onSend, sessionAdapter, initialMessages, initialSessionId, maxInputLength, placeholder, autoFocus, actionLabels, feedback, enableRegenerate, }: ChatProviderProps): react_jsx_runtime.JSX.Element;

/**
 * ChatContainer v0.2.0 — main layout shell.
 *
 * Design:
 * - Content-first, borderless feel
 * - Messages centered at 720px max-width
 * - Floating PromptInput at bottom with breathing room
 * - Subtle gradient fade at input/message boundary
 * - Sidebar slides in/out with spring animation
 */
declare function ChatContainer({ showSessions, sessionPosition, emptyState, className, headerSlot, inputAddonSlot, suggestions, onSuggestionClick, allowAttachments, }: ChatContainerProps & {
    suggestions?: string[];
    onSuggestionClick?: (s: string) => void;
    allowAttachments?: boolean;
}): react_jsx_runtime.JSX.Element;

/**
 * Scrollable message container.
 *
 * CypherX chat layout:
 * - Content centered at max-width 720px with auto margins
 * - Generous horizontal padding (24px mobile, 32px desktop)
 * - Generous vertical padding
 * - Near-invisible custom scrollbar
 * - Scroll-to-bottom button: minimal pill floating at bottom center
 *
 * Features:
 * - Smart auto-scrolling with user override detection
 * - Thinking indicator appears for empty streaming messages
 * - Optional custom message renderer
 * - Screen reader announcements for new messages
 */
declare const MessageList: react.ForwardRefExoticComponent<MessageListProps & react.RefAttributes<HTMLDivElement>>;

/**
 * ChatMessage v0.3.0 — CypherX message layout.
 *
 * User messages: Right-aligned dark pill. When `isLast && config.enableRegenerate`,
 * an Edit affordance reveals an inline textarea that submits via editAndRegenerate.
 *
 * Assistant messages: Left-aligned, no bubble. New in v0.3.0:
 * - FollowupsCard renders below content when `message.followups` is set.
 * - MessageActionBar shows like/dislike buttons when ChatConfig.feedback is provided.
 * - Dislike opens a popover for reason category + free text.
 * - When `isLast && config.enableRegenerate`, the bar also exposes Retry which
 *   calls regenerateLast (re-runs the last user prompt with regenerate=true).
 */
declare function ChatMessage({ message, isStreaming, isLast, onRetry, className, }: ChatMessageProps): react_jsx_runtime.JSX.Element;

/**
 * Token-by-token text reveal animation component.
 *
 * Uses requestAnimationFrame-based animation via the useStreamingText hook.
 * Renders text as a <span> with whitespace preservation.
 *
 * When streaming is active (animate=true), shows a blinking cursor
 * after the last revealed character using the .cxc-cursor CSS class.
 */
declare function StreamingText({ text, charsPerFrame, animate, onComplete, className, }: StreamingTextProps): react_jsx_runtime.JSX.Element;

/**
 * CypherX collapsible action/thinking section.
 *
 * Design:
 * - Collapsed: Single-line header with summary text, chevron, and status icon.
 *   Clean and unobtrusive -- just a subtle gray text line.
 * - Expanded: Vertical timeline with status dots/icons for each step.
 *   Running steps show a pulsing clock icon.
 *   Completed steps show a green checkmark.
 *   "Done" indicator at the bottom when all complete.
 *
 * Behavior:
 * - Auto-expands while actions are running (isActive=true).
 * - Collapses to summary once all actions complete.
 * - Click to toggle when not actively running.
 *
 * The section has NO background color or border -- it flows
 * naturally within the message content.
 */
declare function ActionIndicator({ actions, isActive, className, }: ActionIndicatorProps): react_jsx_runtime.JSX.Element | null;

/**
 * ThinkingIndicator v0.2.0 — TextShimmer-based thinking state.
 *
 * Renders the label text (default "Thinking...") with a gradient
 * shimmer sweep animation. Clean, minimal, no extra chrome.
 *
 * The gradient colors adapt to light/dark mode via CSS tokens.
 * Fades in/out via AnimatePresence for smooth mount/unmount.
 */
declare function ThinkingIndicator({ label, className, }: ThinkingIndicatorProps): react_jsx_runtime.JSX.Element;

/**
 * CypherX floating input bar.
 *
 * Design:
 * - Centered, max-width constrained (not full-width)
 * - Rounded pill shape with large border-radius (24px)
 * - Subtle shadow for floating depth (shadow-input token)
 * - Clean placeholder text in muted color
 * - Send button: dark circle with ArrowUp icon, right-aligned
 * - Stop button: replaces send when streaming (Square icon)
 * - Generous internal padding for comfortable typing
 *
 * The input floats above the content visually due to the shadow,
 * creating a layered, premium feel like a messaging app.
 */
declare function ChatInput({ placeholder, disabled, maxRows, addonSlot, className, }: ChatInputProps): react_jsx_runtime.JSX.Element;

/**
 * Premium code block with dark background and clean styling.
 *
 * Design:
 * - Dark background (#1C1B19 light mode, #111010 dark mode)
 * - Clean rounded corners (radius-lg = 16px)
 * - Header with muted language badge and copy button
 * - Copy button shows "Copied!" with checkmark for 2s
 * - Monospace font with proper tab-size
 * - Horizontal scroll for long lines (no wrapping)
 * - Subtle border that blends with the content
 *
 * The code is rendered as text content (never HTML) to prevent XSS.
 */
declare function CodeBlock({ code, language, showLineNumbers, showCopy, maxHeight, className, }: CodeBlockProps): react_jsx_runtime.JSX.Element;

/**
 * Welcome screen displayed when there are no messages.
 *
 * CypherX empty state design:
 * - Centered vertically and horizontally
 * - Warm, minimal aesthetic
 * - "How can I help you?" in a warm, confident font
 * - Subtle description text
 * - Suggestion chips: clean rounded pills with hover lift
 * - No heavy icon or ornament -- content-first
 *
 * The sparkles icon is subtle and warm-toned, setting the
 * expectation of an intelligent, helpful assistant.
 */
declare function EmptyState({ icon, title, description, suggestions, onSuggestionClick, className, }: EmptyStateProps): react_jsx_runtime.JSX.Element;

/**
 * Session sidebar panel showing chat history.
 *
 * Features:
 * - "New Chat" button at top with Plus icon
 * - Scrollable list of sessions sorted by updatedAt descending
 * - Each session shows: title (truncated), relative time, message count badge
 * - Active session highlighted with accent background
 * - Delete button appears on hover
 * - Animated list with AnimatePresence for add/remove transitions
 * - Loading skeleton while sessions are being fetched
 * - Empty state when no sessions exist
 * - Keyboard navigation: Arrow Up/Down, Enter to select, Delete to remove
 *
 * Data source: Reads from ChatContext (sessions array from useSessionManager).
 */
declare function SessionList({ onSelectSession, onNewConversation, className, }: SessionListProps): react_jsx_runtime.JSX.Element;

/**
 * Compact dropdown version of the session list for mobile and header use.
 *
 * Features:
 * - Button showing current session title (or "New Chat")
 * - Dropdown with session list on click
 * - "New Chat" option at top of dropdown
 * - ChevronDown indicator
 * - Click outside to close
 * - Keyboard navigation (Escape to close, ArrowDown/Up to navigate)
 * - Uses the same session data from ChatContext
 */
declare function SessionSelector({ className }: SessionSelectorProps): react_jsx_runtime.JSX.Element;

/**
 * ChatWidget v0.2.0 — floating chat panel with FAB trigger.
 *
 * Features:
 * - FAB button at bottom-right/left to open
 * - Fixed panel with configurable width/height
 * - Expand button to go near full-screen
 * - Compact mode when collapsed, full mode when expanded
 * - Escape to close, click outside to close
 */
declare function ChatWidget({ position, defaultOpen, width, height, fabIcon, fabLabel, className, emptyState, inputAddonSlot, headerSlot, }: ChatWidgetProps): react_jsx_runtime.JSX.Element;

/**
 * TextShimmer — gradient sweep animation across text.
 *
 * Pure CSS implementation via `background-clip: text` with a sliding
 * linear gradient. No JS animation library required.
 *
 * The gradient has three stops: muted → foreground → muted, sized at
 * 200% width. A single keyframe slides `background-position` from
 * right to left, creating a shimmering highlight effect.
 *
 * Design tokens control the gradient colors (`--cxc-shimmer-*`)
 * so the shimmer adapts to light/dark mode automatically.
 */
declare function TextShimmer({ children, as, duration, spread, className, }: TextShimmerProps): react_jsx_runtime.JSX.Element;

/**
 * MessageActionBar — hover-reveal row of action buttons on messages.
 *
 * Design pattern:
 * - Container uses `opacity-0 group-hover/message:opacity-100` so it
 *   only appears when the parent message is hovered.
 * - Each button is a small icon-only circle with tooltip.
 * - Copy button toggles to a checkmark for 2 seconds after copying.
 *
 * The parent ChatMessage must have `group/message` class for this to work.
 */
declare function MessageActionBar({ content, actions, onCopy, onRetry, onEdit, feedback, onFeedback, className, }: MessageActionBarProps): react_jsx_runtime.JSX.Element | null;

/**
 * ChainOfThought — CypherX collapsible accordion with timeline.
 *
 * Replaces ActionIndicator in v0.2.0.
 *
 * Design:
 * - Collapsed: single-line header with shimmer text (active) or summary (done).
 * - Expanded: vertical timeline with step dots and connector lines.
 * - Auto-expands during streaming, auto-collapses when done.
 * - Smooth expand/collapse using max-height + ResizeObserver
 *   with cubic-bezier(0.165, 0.85, 0.45, 1) easing.
 * - No background, no border — flows naturally in the message.
 */
declare function ChainOfThought({ actions, isActive, thinkingLabel, className, }: ChainOfThoughtProps): react_jsx_runtime.JSX.Element | null;

/**
 * PromptInput v0.2.0 — ChatGPT/PromptKit-style two-row input.
 *
 * Layout:
 * ┌────────────────────────────────────────────┐
 * │  [textarea - full width]                    │
 * │                                             │
 * │  [+] [addon slots]  ·············  [send]   │
 * └────────────────────────────────────────────┘
 *
 * - Textarea on top, takes full width.
 * - Action bar on bottom: attach (+), addon buttons on left, send on right.
 * - Rounded container with subtle border + shadow.
 * - File attachment previews between textarea and action bar.
 * - Suggestion chips rendered above the container.
 */
declare function PromptInput({ placeholder, disabled, maxRows, maxHeight, allowAttachments, acceptFileTypes, onFilesAttached, suggestions, onSuggestionClick, addonSlot, className, }: PromptInputProps): react_jsx_runtime.JSX.Element;

/**
 * CypherX Mode Switch.
 *
 * Design:
 * - Compact pill-shaped toggle with sliding indicator
 * - Uses design tokens for consistent theming (light + dark)
 * - Smooth spring animation on the active indicator
 * - Each option has an icon + label
 * - Active state: filled background with inverse text
 * - Inactive state: transparent with muted text
 */
interface ModeSwitchOption {
    /** Unique value for this option */
    value: string;
    /** Display label */
    label: string;
    /** Optional icon (React node, e.g., lucide-react icon) */
    icon?: React.ReactNode;
}
interface ModeSwitchProps {
    /** The available options (2-4 items) */
    options: ModeSwitchOption[];
    /** Currently active value */
    value: string;
    /** Called when the user selects a different option */
    onChange: (value: string) => void;
    /** Additional CSS class */
    className?: string;
}
declare function ModeSwitch({ options, value, onChange, className }: ModeSwitchProps): react_jsx_runtime.JSX.Element;

/**
 * FollowupsCard — render the agent's `suggest_followups` tool output as
 * an MCQ-style block of buttons, displayed below an assistant message.
 *
 * Design pattern:
 * - Single-select (multi=false): each option is a pill button. Clicking
 *   any one immediately submits and locks the card.
 * - Multi-select (multi=true): options become checkbox-style toggles with
 *   a "Continue" button that submits the union.
 * - "Other (specify)" is always the last option (appended by backend). It
 *   reveals a text input on selection; submitting commits the typed text.
 * - Once submitted, the card locks and visibly shows the chosen options.
 *
 * The card receives `lockedSelection` from the message state — the parent
 * (ChatMessage) reads `message.followupsSelection` to determine if the
 * card should render read-only.
 */
declare function FollowupsCard({ followups, lockedSelection, onSelect, className, }: FollowupsCardProps): react_jsx_runtime.JSX.Element;

/**
 * FeedbackPopover — small floating panel that appears after a thumbs-down
 * is clicked. Lets the user pick a reason chip + optionally type a comment.
 *
 * Currently only opens on `down`. Up-feedback submits immediately without
 * a popover (matches claude.ai's pattern).
 *
 * Positioned by the parent (MessageActionBar) — this component is just the
 * panel, not the trigger.
 */
declare function FeedbackPopover({ rating: _rating, onSubmit, onDismiss, className, }: FeedbackPopoverProps): react_jsx_runtime.JSX.Element;

/**
 * Access the chat context. Must be used within a <ChatProvider>.
 * This is the internal hook -- the public `useChat()` wraps it with
 * a flattened API surface.
 */
declare function useChatContext(): ChatContextValue;

/**
 * The primary consumer hook for interacting with the chat.
 *
 * Returns a flat API surface with all state and actions needed to build
 * a chat interface. Must be used within a <ChatProvider>.
 *
 * This is a thin wrapper around `useChatContext()` that destructures the
 * context value into a flat object for ergonomic consumption.
 */
declare function useChat(): {
    messages: ChatMessage$1[];
    isStreaming: boolean;
    activeSessionId: string | null;
    sessions: ChatSession[];
    connectionStatus: 'idle' | 'connecting' | 'streaming' | 'error';
    error: string | null;
    inputValue: string;
    send: (message: string, metadata?: Record<string, unknown>) => void;
    stop: () => void;
    retry: (messageId: string) => void;
    setInput: (value: string) => void;
    clearMessages: () => void;
    loadSession: (sessionId: string) => Promise<void>;
    deleteSession: (sessionId: string) => Promise<void>;
    newConversation: () => void;
};

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
declare function useSSEStream(config: SSEStreamConfig): ChatSendFn;

/**
 * Smart auto-scroll hook with user override detection.
 *
 * Uses IntersectionObserver on a sentinel element at the bottom of the scroll
 * container for efficient bottom detection, avoiding expensive scroll event
 * calculations on every frame.
 *
 * Algorithm:
 * 1. Observes a sentinel div at the bottom of the scroll container.
 * 2. If the sentinel is visible, the user is "at the bottom."
 * 3. On dependency change (new message), if at bottom, auto-scroll. Otherwise increment unreadCount.
 * 4. scrollToBottom() scrolls and resets unreadCount.
 */
declare function useChatScroll(deps: unknown[]): {
    scrollRef: React.RefObject<HTMLDivElement | null>;
    bottomRef: React.RefObject<HTMLDivElement | null>;
    isAtBottom: boolean;
    unreadCount: number;
    scrollToBottom: (behavior?: ScrollBehavior) => void;
};

interface UseStreamingTextOptions {
    /** Characters revealed per animation frame. Default: 2. */
    charsPerFrame?: number;
    /** Whether animation is enabled. Default: true. */
    enabled?: boolean;
}
/**
 * Character-by-character text animation using requestAnimationFrame.
 *
 * Tracks a cursor position within the full text. Each animation frame
 * advances the cursor by `charsPerFrame` characters. When the full text
 * grows (streaming), the animation smoothly catches up from the current
 * cursor position.
 *
 * When `enabled` is false, returns the full text immediately with no animation.
 */
declare function useStreamingText(fullText: string, options?: UseStreamingTextOptions): {
    displayedText: string;
    isAnimating: boolean;
};

interface UseSessionManagerReturn {
    sessions: ChatSession[];
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    deleteSession: (sessionId: string) => Promise<void>;
    renameSession: (sessionId: string, title: string) => Promise<void>;
}
/**
 * Wraps SessionAdapter with loading states and error handling.
 * If adapter is undefined, all operations are no-ops and sessions is empty.
 */
declare function useSessionManager(adapter?: SessionAdapter): UseSessionManagerReturn;

declare function cn(...inputs: ClassValue[]): string;

/**
 * Formats a Date into a human-readable relative time string.
 * e.g., "just now", "2m ago", "1h ago", "3d ago", "Jan 5"
 */
declare function formatRelativeTime(date: Date): string;

/**
 * Lightweight markdown renderer.
 *
 * Converts markdown text to sanitized HTML string for use with dangerouslySetInnerHTML.
 * Supports all common markdown features needed for chat messages.
 *
 * Security: All output is sanitized via an allowlist of safe HTML tags and attributes.
 * Script tags, event handlers, and javascript: URLs are stripped.
 */
/**
 * Renders markdown text to a sanitized HTML string.
 *
 * Supports: bold, italic, strikethrough, inline code, code blocks,
 * links, headers, unordered/ordered lists, blockquotes, tables,
 * horizontal rules, and line breaks.
 *
 * Headings are capped: h1 -> h3, h2 -> h4, etc. to prevent layout disruption.
 */
declare function renderMarkdown(markdown: string): string;

export { ActionIndicator, type ActionIndicatorProps, ChainOfThought, type ChainOfThoughtProps, type ChatAction, type ChatConfig, ChatContainer, type ChatContainerProps, type ChatContextValue, type ChatEvent, ChatInput, type ChatInputProps, ChatMessage, type ChatMessage$1 as ChatMessageData, type ChatMessageProps, ChatProvider, type ChatSendFn, type ChatSession, ChatWidget, type ChatWidgetProps, CodeBlock, type CodeBlockProps, EmptyState, type EmptyStateProps, type FeedbackData, type FeedbackHandler, FeedbackPopover, type FeedbackPopoverProps, type FeedbackRating, type FeedbackReasonCategory, type FileAttachment, FollowupsCard, type FollowupsCardProps, type FollowupsData, MessageActionBar, type MessageActionBarProps, type MessageActionItem, MessageList, type MessageListProps, ModeSwitch, type ModeSwitchOption$1 as ModeSwitchOption, type ModeSwitchProps$1 as ModeSwitchProps, PromptInput, type PromptInputProps, type SSEStreamConfig, type SessionAdapter, SessionList, type SessionListProps, SessionSelector, type SessionSelectorProps, StreamingText, type StreamingTextProps, TextShimmer, type TextShimmerProps, ThinkingIndicator, type ThinkingIndicatorProps, cn, formatRelativeTime, renderMarkdown, useChat, useChatContext, useChatScroll, useSSEStream, useSessionManager, useStreamingText };
