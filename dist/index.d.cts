import * as react from 'react';
import { ReactNode } from 'react';
import * as react_jsx_runtime from 'react/jsx-runtime';
import { ClassValue } from 'clsx';

/** Display/format hint shared by metrics and table columns. */
type ValueFormat = 'number' | 'currency' | 'percent' | 'compact' | 'raw';
/** Closed chart-type enum (mirrors the backend ChartSpec). */
type ChartType = 'bar' | 'bar_horizontal' | 'bar_grouped' | 'bar_stacked' | 'line' | 'area' | 'area_stacked' | 'pie' | 'donut' | 'scatter';
/** A scalar cell value as it travels on the wire. */
type CellValue = string | number | null;
/** A data row keyed by field name. */
type DataRow = Record<string, CellValue>;
interface MetricDelta {
    value: CellValue;
    direction: 'up' | 'down' | 'flat';
    label?: string;
}
interface Metric {
    id: string;
    label: string;
    value: CellValue;
    unit?: string;
    format?: ValueFormat;
    delta?: MetricDelta;
    spark?: number[];
}
interface MetricGroupBlock {
    type: 'metric_group';
    metrics: Metric[];
}
interface ChartFieldRef {
    key: string;
    label: string;
}
interface ChartBlockOptions {
    stacked?: boolean;
    show_legend?: boolean;
    orientation?: 'vertical' | 'horizontal';
}
interface ChartBlock {
    type: 'chart';
    chart_type: ChartType;
    title?: string;
    data: DataRow[];
    x: ChartFieldRef;
    series: ChartFieldRef[];
    options?: ChartBlockOptions;
}
interface TableColumn {
    key: string;
    label: string;
    align?: 'left' | 'right' | 'center';
    format?: ValueFormat;
    unit?: string;
}
interface TableBlock {
    type: 'table';
    title?: string;
    columns: TableColumn[];
    rows: DataRow[];
    total_count?: number;
    page_size?: number;
}
interface TextBlock {
    type: 'text';
    markdown: string;
}
interface ActionItem {
    id: string;
    label: string;
    style?: 'primary' | 'secondary';
    on_click: {
        send_message: string;
    };
}
interface ActionsBlock {
    type: 'actions';
    actions: ActionItem[];
}
type Block = MetricGroupBlock | ChartBlock | TableBlock | TextBlock | ActionsBlock;
type BlockType = Block['type'];
interface ViewSpec {
    surface_id: string;
    version: '1';
    title?: string;
    blocks: Block[];
}
/** True when `value` is a renderable block of a known type with its required shape. */
declare function isValidBlock(value: unknown): value is Block;
/** True when `value` is a structurally valid ViewSpec (blocks array present). */
declare function isValidViewSpec(value: unknown): value is ViewSpec;

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
    /**
     * Agentic-UI surfaces (ViewSpecs) emitted via `ui_block` events, rendered
     * below the prose by <AuiView>. Assistant only; appended in arrival order.
     */
    blocks?: ViewSpec[];
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
interface VoiceTranscription {
    text: string;
    language: string;
    language_code: string;
    /**
     * How the language was determined. `autodetect` means the backend chose from
     * its candidate locales; `forced` means a single language was used — either
     * because the caller passed one, or because the install's region only
     * supports single-language transcription.
     */
    mode?: 'autodetect' | 'forced';
}
/**
 * Shape of `GET /v1/enterprise/voice`. The library never fetches this — the
 * consumer does, to decide whether to pass a VoiceHandler at all — but the
 * type ships so consumers don't hand-roll it.
 */
interface VoiceStatus {
    enabled: boolean;
    locales?: VoiceLocale[];
    autodetect_candidates?: string[];
    /**
     * Whether this install's region supports multi-language auto-detection.
     * `null` means the install has not determined it yet. When `false`, every
     * transcription is single-language, so a consumer serving multilingual users
     * may want to render a language picker and pass `language` to `transcribe`.
     */
    stt_autodetect_available?: boolean | null;
}
interface VoiceLocale {
    locale: string;
    locale_name: string;
    language_code: string;
    default_voice: string;
    alt_voice?: string;
}
/**
 * Optional handler the consumer wires to a backend voice endpoint.
 * Provide via ChatConfig.voice to enable the speaker button on assistant
 * messages (TTS) and the microphone button in the input (STT).
 *
 * Voice is a per-install feature on the CypherX side, so the consumer should
 * probe its own backend first (`GET /v1/enterprise/voice` returns
 * `{ enabled }`) and only pass `voice` when the install has it turned on —
 * the library renders the buttons whenever the handler is present.
 *
 * Both calls run consumer-side, so auth headers (X-API-Key) and CORS stay in
 * the consumer's fetch. Audio is fetched as a Blob rather than assigned to an
 * `<audio src>` precisely because an element load cannot carry those headers.
 */
interface VoiceHandler {
    /** Synthesize spoken audio for a persisted assistant message. Return the audio blob (audio/mpeg). */
    synthesize: (backendMessageId: string) => Promise<Blob>;
    /**
     * Transcribe a recorded audio clip.
     *
     * The library's own mic converts recordings to 16 kHz mono WAV
     * (`audio/wav`) before calling this, because which containers the backend
     * accepts depends on the install's Azure region — regions without fast
     * transcription take only WAV or OGG. Upload the blob you are given as-is;
     * its `type` is authoritative.
     *
     * `language` is an optional BCP-47 locale that forces single-language
     * transcription. Leave it unset for auto-detection. Installs whose region
     * reports `stt_autodetect_available: false` are single-language regardless,
     * so consumers serving multilingual users may want to offer a picker there.
     */
    transcribe: (file: Blob, language?: string) => Promise<VoiceTranscription>;
}
/** Playback status of the provider's shared audio element for one message. */
type SpeechStatus = 'idle' | 'loading' | 'playing' | 'error';
interface SpeechState {
    /** Local id of the message this status refers to; null when nothing is active. */
    messageId: string | null;
    status: SpeechStatus;
    /** Human-readable failure reason. Only set when status is 'error'. */
    error?: string;
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
    type: 'ui_block';
    spec: ViewSpec;
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
     * Optional voice handler. When provided, a speaker button appears in the
     * action bar of persisted assistant messages (synthesize-on-click, never
     * autoplay) and a microphone button appears in the input, whose transcript
     * lands in the input for review rather than sending automatically.
     *
     * Voice ships dark per install, so gate this yourself: probe
     * `GET /v1/enterprise/voice` and pass `voice` only when `enabled` is true.
     */
    voice?: VoiceHandler;
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
    /** Playback status of THIS message. Omit (or 'idle') for the resting state. */
    speechStatus?: SpeechStatus;
    /** Failure reason to surface next to the speaker button when status is 'error'. */
    speechError?: string;
    /** Toggle handler for the speaker button. Omit to hide it. */
    onSpeak?: () => void;
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
    /** Re-pull the session list from the SessionAdapter into state.sessions. */
    refreshSessions: () => Promise<void>;
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
    /** Which message (if any) the shared audio element is currently loading or playing. */
    speech: SpeechState;
    /**
     * Play the spoken form of an assistant message, or stop it if it is already
     * playing. Starting one message stops any other. Requires ChatConfig.voice.
     */
    toggleSpeech: (messageId: string) => void;
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
declare function ChatProvider({ children, onSend, sessionAdapter, initialMessages, initialSessionId, maxInputLength, placeholder, autoFocus, actionLabels, feedback, voice, enableRegenerate, }: ChatProviderProps): react_jsx_runtime.JSX.Element;

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
declare function MessageActionBar({ content, actions, onCopy, onRetry, onEdit, feedback, onFeedback, speechStatus, speechError, onSpeak, className, }: MessageActionBarProps): react_jsx_runtime.JSX.Element | null;

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

interface VoiceRecordButtonProps {
    /** Whether the surrounding input is disabled. */
    disabled?: boolean;
    /** Diameter of the button. PromptInput's row uses 32px, ChatInput's uses 28px. */
    size?: 'sm' | 'md';
    className?: string;
}
/**
 * Microphone button — tap to record, tap to stop, transcript lands in the input.
 *
 * The transcript is inserted rather than sent: speech recognition is fallible
 * and the user reviews before committing, which also keeps the send path
 * identical to typing.
 *
 * Renders nothing without a ChatConfig.voice handler, so the whole feature
 * stays dark on installs that haven't enabled voice.
 */
declare function VoiceRecordButton({ disabled, size, className }: VoiceRecordButtonProps): react_jsx_runtime.JSX.Element | null;

interface AuiViewProps {
    spec: ViewSpec;
    onSendMessage: (message: string) => void;
}
declare function AuiView({ spec, onSendMessage }: AuiViewProps): react_jsx_runtime.JSX.Element | null;

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

type RecorderStatus = 'idle' | 'recording' | 'transcribing' | 'error';
interface UseVoiceRecorderOptions {
    /** Called with the recorded clip once the user stops. */
    onClip: (clip: Blob) => Promise<void>;
}
interface UseVoiceRecorderResult {
    status: RecorderStatus;
    /** Failure reason to surface inline. Only set when status is 'error'. */
    error: string | null;
    /** Whole seconds elapsed in the current recording. */
    elapsedSeconds: number;
    /** True when the last recording ended by hitting the duration cap. */
    limitReached: boolean;
    /** Start recording, or stop and transcribe if already recording. */
    toggle: () => void;
    /** Clear an error back to the resting state. */
    dismissError: () => void;
}
declare function useVoiceRecorder({ onClip }: UseVoiceRecorderOptions): UseVoiceRecorderResult;

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

/**
 * 16 kHz mono WAV encoding for voice input.
 *
 * WHY: the CypherX backend has two speech-to-text transports and they do not
 * accept the same containers. Fast transcription takes the WebM/Opus a browser
 * records natively, but it is not offered in every Azure region; installs in
 * the other regions fall back to the short-audio API, which accepts only WAV
 * and OGG. No MediaRecorder format is available in every browser AND accepted
 * by that fallback (Chrome records only WebM, Safari only MP4), so a recording
 * uploaded as-is fails outright on those installs.
 *
 * Converting every recording to 16 kHz mono PCM removes the guess: both
 * transports accept it from every browser, and it is exactly what the
 * short-audio transport declares it wants. Dictation is seconds long, so the
 * size cost against Opus is bounded.
 *
 * `encodeWav` is deliberately free of Web Audio types so it can be tested
 * against known bytes under the node-environment vitest config; the decoding
 * and resampling that genuinely need a browser live in `blobToWav`.
 */
/** Sample rate the short-audio transport expects. */
declare const TARGET_SAMPLE_RATE = 16000;
/** Content type to upload converted audio under. */
declare const WAV_CONTENT_TYPE = "audio/wav";
/**
 * Encode mono float samples (-1..1) as a 16-bit PCM WAV.
 *
 * Samples are clamped before scaling: a value outside -1..1 would otherwise
 * wrap around the 16-bit range and turn a loud passage into noise.
 */
declare function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer;
/** Whether this browser can run the conversion at all. */
declare function canConvertToWav(): boolean;
/**
 * Decode a recorded blob and re-encode it as 16 kHz mono WAV.
 *
 * Decoding uses the same browser that produced the recording, so its own
 * container is always decodable. Resampling and the downmix to mono are done
 * by an OfflineAudioContext — which, unlike a live AudioContext, needs no user
 * gesture, so it is safe to run after the awaits in the recorder's stop handler.
 *
 * Throws if the browser cannot decode the clip. Callers should fall back to
 * uploading the original blob: fast-transcription installs still accept WebM,
 * making a decode failure degraded rather than broken.
 */
declare function blobToWav(blob: Blob): Promise<Blob>;

/**
 * Hard cap on a single recording, in seconds.
 *
 * The backend's short-audio STT transport — used on installs whose Azure
 * region has no fast transcription — rejects anything over 60 s outright, so
 * we stop just under it. Losing the last couple of seconds beats losing the
 * whole take.
 */
declare const MAX_RECORDING_SECONDS = 58;

export { ActionIndicator, type ActionIndicatorProps, type ActionItem, type ActionsBlock, AuiView, type AuiViewProps, type Block, type BlockType, type CellValue, ChainOfThought, type ChainOfThoughtProps, type ChartBlock, type ChartBlockOptions, type ChartFieldRef, type ChartType, type ChatAction, type ChatConfig, ChatContainer, type ChatContainerProps, type ChatContextValue, type ChatEvent, ChatInput, type ChatInputProps, ChatMessage, type ChatMessage$1 as ChatMessageData, type ChatMessageProps, ChatProvider, type ChatSendFn, type ChatSession, ChatWidget, type ChatWidgetProps, CodeBlock, type CodeBlockProps, type DataRow, EmptyState, type EmptyStateProps, type FeedbackData, type FeedbackHandler, FeedbackPopover, type FeedbackPopoverProps, type FeedbackRating, type FeedbackReasonCategory, type FileAttachment, FollowupsCard, type FollowupsCardProps, type FollowupsData, MAX_RECORDING_SECONDS, MessageActionBar, type MessageActionBarProps, type MessageActionItem, MessageList, type MessageListProps, type Metric, type MetricDelta, type MetricGroupBlock, ModeSwitch, type ModeSwitchOption$1 as ModeSwitchOption, type ModeSwitchProps$1 as ModeSwitchProps, PromptInput, type PromptInputProps, type SSEStreamConfig, type SessionAdapter, SessionList, type SessionListProps, SessionSelector, type SessionSelectorProps, type SpeechState, type SpeechStatus, StreamingText, type StreamingTextProps, TARGET_SAMPLE_RATE, type TableBlock, type TableColumn, type TextBlock, TextShimmer, type TextShimmerProps, ThinkingIndicator, type ThinkingIndicatorProps, type ValueFormat, type ViewSpec, type VoiceHandler, type VoiceLocale, VoiceRecordButton, type VoiceStatus, type VoiceTranscription, WAV_CONTENT_TYPE, blobToWav, canConvertToWav, cn, encodeWav, formatRelativeTime, isValidBlock, isValidViewSpec, renderMarkdown, useChat, useChatContext, useChatScroll, useSSEStream, useSessionManager, useStreamingText, useVoiceRecorder };
