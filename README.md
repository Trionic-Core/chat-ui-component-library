# @cypherx/chat-ui

CypherX's client renderer: streaming chat UI + **Agentic UI** (KPI cards, charts, tables) over the CypherX-native `ViewSpec` protocol. SSE support, session management, markdown rendering, and more.

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Integrating with CypherX?** Start here:
> - **[INTEGRATION.md](./INTEGRATION.md)** — connect to your CypherX backend, render AUI surfaces, sessions/history, the event protocol.
> - **[THEMING.md](./THEMING.md)** — match your brand (colors, fonts, radius, **chart palette**) by overriding `--cxc-*` tokens.

---

## Features

- **Streaming-first** -- AsyncGenerator-based architecture for real-time token streaming
- **Backend-agnostic** -- Works with any API (REST, SSE, WebSocket, local LLM)
- **Chain of Thought** -- Collapsible accordion with timeline steps
- **Text Shimmer** -- Gradient sweep animation for thinking states
- **Message Actions** -- Hover-reveal copy/retry/edit bar on messages
- **Voice** -- Speaker button reads assistant answers aloud, mic button dictates into the input, searchable picker for the dictation language (opt-in, consumer-supplied handlers)
- **Prompt Input** -- ChatGPT-style two-row input with file attachments and suggestion chips
- **Chat Widget** -- Floating FAB + modal for embedding in any page
- **Session management** -- Built-in sidebar with CRUD, or bring your own
- **Markdown rendering** -- Built-in lightweight renderer with XSS sanitization
- **Code blocks** -- Syntax highlighting with copy button and language badge
- **Theming** -- CSS custom properties for full visual customization (light + dark mode)
- **Accessible** -- WCAG AA compliant with keyboard navigation and screen reader support
- **Animated** -- Purposeful Motion animations with `prefers-reduced-motion` support
- **TypeScript** -- Strict types for all components, hooks, and events
- **Tiny** -- Tree-shakeable, ~45KB core (gzipped)

---

## Quick Start

### Installation

```bash
# Private package — configure the @cypherx registry token first (see INTEGRATION.md §1)
npm install @cypherx/chat-ui
```

Peer dependency — just **React** (everything else is bundled):

```bash
npm install react react-dom
```

### Import Styles

In your global CSS (e.g. `globals.css` for Next.js):

```css
@import "tailwindcss";

/* Scan the library for Tailwind classes */
@source "../node_modules/@cypherx/chat-ui/dist";

/* Import design tokens */
@import "@cypherx/chat-ui/styles.css";
```

### Basic Usage

```tsx
import { ChatProvider, ChatContainer } from '@cypherx/chat-ui'
import '@cypherx/chat-ui/styles.css'

function App() {
  return (
    <ChatProvider
      onSend={async function* (message, sessionId) {
        yield { type: 'thinking', active: true }

        // Simulate streaming response
        const words = 'Hello! How can I help you today?'.split(' ')
        for (const word of words) {
          yield { type: 'token', text: word + ' ' }
          await new Promise((r) => setTimeout(r, 50))
        }

        yield { type: 'done' }
      }}
      placeholder="Ask anything..."
    >
      <ChatContainer className="h-screen" />
    </ChatProvider>
  )
}
```

---

## Full Example with SSE

```tsx
import {
  ChatProvider,
  ChatContainer,
  useSSEStream,
} from '@cypherx/chat-ui'
import '@cypherx/chat-ui/styles.css'

function App() {
  const streamChat = useSSEStream({
    url: '/api/chat',
    headers: { Authorization: `Bearer ${token}` },
    buildBody: (message, sessionId) => ({
      message,
      session_id: sessionId,
    }),
  })

  const sessionAdapter = {
    list: async () => {
      const res = await fetch('/api/sessions')
      return res.json()
    },
    get: async (id: string) => {
      const res = await fetch(`/api/sessions/${id}`)
      return res.json()
    },
    delete: async (id: string) => {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
    },
  }

  return (
    <ChatProvider
      onSend={streamChat}
      sessionAdapter={sessionAdapter}
      placeholder="Ask about your data..."
    >
      <ChatContainer
        className="h-screen"
        showSessions
        emptyState={
          <EmptyState
            title="Welcome"
            description="Ask me anything about your data."
            suggestions={[
              'Show me revenue trends',
              'Compare Q1 vs Q2',
              'Top products by sales',
            ]}
          />
        }
      />
    </ChatProvider>
  )
}
```

---

## Component API Reference

### `<ChatProvider>`

Root context provider. Wraps the entire chat UI.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSend` | `ChatSendFn` | *required* | AsyncGenerator function that yields `ChatEvent` objects |
| `sessionAdapter` | `SessionAdapter` | `undefined` | Optional session CRUD adapter for persistence |
| `initialMessages` | `ChatMessage[]` | `[]` | Initial messages to populate the chat |
| `initialSessionId` | `string \| null` | `null` | Initial active session ID |
| `maxInputLength` | `number` | `10000` | Maximum input character length |
| `placeholder` | `string` | `'Send a message...'` | Input placeholder text |
| `autoFocus` | `boolean` | `true` | Auto-focus input on mount |
| `actionLabels` | `Record<string, { active; completed }>` | `undefined` | Custom labels for action types |
| `feedback` | `FeedbackHandler` | `undefined` | Enables thumbs-up / thumbs-down on assistant messages |
| `voice` | `VoiceHandler` | `undefined` | Enables the speaker button on assistant messages and the mic in the input |
| `voiceStatus` | `VoiceStatus` | `undefined` | The `GET /v1/enterprise/voice` payload. Adds a dictation language picker beside the mic |
| `enableRegenerate` | `boolean` | `false` | Edit affordance on the last user message, Regenerate on the last assistant message |

### Voice (v0.5.0)

Passing a `voice` handler turns on two independent affordances:

- **Speaker** — appears in the action bar of assistant messages that have a `backendMessageId` and are no longer streaming. Click synthesizes on demand (never autoplay), click again stops. The provider owns a single `HTMLAudioElement`, so starting one message interrupts any other, and caches the object URL per backend message id so a replay costs nothing.
- **Microphone** — tap to record, tap to stop; the transcript is **inserted into the input for review** rather than sent, so the user always confirms before committing. Recording auto-stops at 58 seconds. In `<PromptInput>` the mic occupies the send position (see below); in `<ChatInput>` it sits to the left of the text field.

> **Behaviour change in 0.6.0 — `<PromptInput>` only.** The mic no longer sits in the left button cluster. It now holds the **send position**, and swaps to Send as soon as there is text — the ChatGPT pattern: speak, review the transcript, send with the same button. An install upgrading from 0.5.0 will see the input bar rearrange, so this is a deliberate visual change rather than a silent one.
>
> The right cluster is `[language chip] [mic ⇄ send]`. Precisely:
> - empty input + voice configured → **mic**
> - any text → **send** (identical to 0.5.0's send button)
> - streaming → **stop**, as before
> - voice not configured → **send**, disabled when empty, exactly as before
>
> The swap is suppressed while the mic is recording or transcribing, even once a transcript lands in the box — the recorder lives inside the button, so swapping it out mid-capture would stop the microphone and discard the clip. It resolves to Send the moment recording ends. Suggestion chips are hidden while the mic is busy for the same reason (clicking one sends). Pressing Enter still sends at any time, so a long transcription never leaves the user without a way out.
>
> The language chip does **not** come and go with the swap — a control that appeared and vanished on every keystroke would be worse than one that stays put. `aria-label` follows the button's current role, so a screen reader is never told "send" while it is a mic, and the swap animation collapses to zero duration under `prefers-reduced-motion`.
>
> `<ChatInput>` (legacy) keeps its 0.5.0 arrangement. Its mic, text field and send button share one row, so a recording timer appearing between them would squeeze the field as you speak — a worse trade than the inconsistency.

```tsx
import type { VoiceHandler } from '@cypherx/chat-ui'

const voice: VoiceHandler = {
  async synthesize(backendMessageId) {
    const res = await fetch(
      `${API_BASE}/v1/enterprise/chat/messages/${backendMessageId}/speech`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' },
    )
    if (!res.ok) throw new Error(`Speech failed: HTTP ${res.status}`)
    return res.blob() // audio/mpeg
  },
  async transcribe(file, language) {
    // `file` arrives as 16 kHz mono WAV — upload it as-is (see note below).
    const form = new FormData()
    form.append('file', file, 'recording.wav')
    if (language) form.append('language', language)
    const res = await fetch(`${API_BASE}/v1/enterprise/voice/transcriptions`, {
      method: 'POST', headers, body: form,
    })
    if (!res.ok) throw new Error(`Transcription failed: HTTP ${res.status}`)
    return res.json() // { text, language, language_code }
  },
}

<ChatProvider onSend={send} voice={voiceEnabled ? voice : undefined}>
```

The library renders the voice UI whenever the handler is present, so **gate it yourself**: voice ships dark per install, and `GET /v1/enterprise/voice` returns `{ enabled }` (plus the configured `locales`). Probe it on mount and pass `voice` only when `enabled` is true — otherwise the buttons appear and every click returns 403.

Auth stays consumer-side. Audio is fetched as a `Blob` rather than assigned to an `<audio src>` specifically because an element load cannot carry an `X-API-Key` header. The mic needs browser microphone permission and a secure origin (HTTPS or localhost); a denial surfaces inline and leaves the button in place to retry.

#### Audio format and the 58-second cap

Recordings reach `transcribe` as **16 kHz mono WAV**, converted by the library — upload the blob as-is rather than re-wrapping it. This is not cosmetic: the backend picks its speech-to-text transport from the install's Azure region, and regions without fast transcription fall back to an API that accepts only WAV or OGG and caps clips at 60 seconds. No single MediaRecorder format is both universally recordable and universally accepted (Chrome records WebM, Safari MP4), so the library converts and auto-stops recording at 58 seconds. If a browser cannot decode its own recording, the original blob is sent instead — still fine on fast-transcription installs.

#### Dictation language (v0.6.0)

You already fetch `GET /v1/enterprise/voice` to decide whether to pass `voice`. Pass the whole payload as `voiceStatus` and the library mounts a language picker next to the mic, built from that install's own catalog:

```tsx
const status = await fetch(`${API_BASE}/v1/enterprise/voice`, { headers }).then((r) => r.json())

<ChatProvider
  onSend={send}
  voice={status.enabled ? voice : undefined}
  voiceStatus={status.enabled ? status : undefined}
>
```

Omit `voiceStatus` (or pass one with no `locales`) and no picker renders — the mic auto-detects exactly as it does today. Nothing else about the existing voice setup changes.

Why it matters: an Azure region **without** fast transcription can only transcribe one language at a time, and falls back to the first configured locale when the caller names none — which is how an English sentence comes back written in Gujarati script. On those installs, picking a language explicitly is the only way to reach the other 152 locales.

The panel offers, in order:

- **Auto-detect**, shown only while it is actually possible. It disappears when `stt_autodetect_available` is `false` — and also the moment a request sent *without* a language comes back with `mode: 'forced'`, which proves the region has no auto-detect transport whatever the status endpoint last claimed. That reply is the more reliable signal, since the backend's own flag is per-process and resets on restart.
- **Frequent** — the locales in `autodetect_candidates`, i.e. the ones this install was configured with. Derived, never a hardcoded language list.
- **Search** across all 153, matching the endonym, the English name, the language subtag and the locale code — `guj`, `ગુ`, `gu-IN` and `Gujarati` all reach the same row.

Selection is passed straight through as `transcribe(file, language)`; "Auto-detect" passes `undefined`. When auto-detect is unavailable the picker pre-selects the first configured candidate, which is what the backend would have used anyway. Language names render via `Intl.DisplayNames`, so the endonyms cost nothing in bundle size and fall back to the catalog's English name on older browsers.

The picker is mounted inside `<PromptInput>` (immediately left of the mic/send button) and `<ChatInput>` (beside the mic); `<LanguagePicker>` is also exported for consumers composing their own input surface. It stays put while the mic/send button swaps.

### `<ChatContainer>`

Main layout shell. Composes sidebar + messages + input.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `showSessions` | `boolean` | `false` | Show the session sidebar |
| `sessionPosition` | `'left' \| 'right'` | `'left'` | Sidebar position |
| `emptyState` | `ReactNode` | `<EmptyState />` | Custom empty state component |
| `className` | `string` | `undefined` | Additional CSS classes |
| `headerSlot` | `ReactNode` | `undefined` | Custom header controls |
| `inputAddonSlot` | `ReactNode` | `undefined` | Addon buttons in the input area |

### `<MessageList>`

Scrollable message container with auto-scroll.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `renderMessage` | `(message, index) => ReactNode` | `undefined` | Custom message renderer |
| `className` | `string` | `undefined` | Additional CSS classes |

### `<ChatMessage>`

Individual message renderer (user or assistant).

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `message` | `ChatMessage` | *required* | The message data |
| `isStreaming` | `boolean` | `false` | Whether this message is currently streaming |
| `onRetry` | `() => void` | `undefined` | Retry callback for errored messages |
| `className` | `string` | `undefined` | Additional CSS classes |

### `<PromptInput>` (v0.2.0)

ChatGPT-style two-row input: textarea on top, action bar on bottom. The action bar puts attachments and `addonSlot` on the left, and the dictation language chip plus one circular control on the right — mic while there is nothing to send, otherwise send/stop. See [Voice](#voice-v050) for the swap rules.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `placeholder` | `string` | From config | Override placeholder text |
| `disabled` | `boolean` | `false` | Disable the input |
| `maxRows` | `number` | `6` | Max rows before scrolling |
| `maxHeight` | `number` | `240` | Max height in pixels |
| `allowAttachments` | `boolean` | `false` | Enable file drag-and-drop + attach button |
| `acceptFileTypes` | `string` | `undefined` | Accepted file types (e.g. `'image/*,.pdf'`) |
| `onFilesAttached` | `(files: FileAttachment[]) => void` | `undefined` | File attach callback |
| `suggestions` | `string[]` | `undefined` | Suggestion chips shown when input is empty |
| `onSuggestionClick` | `(suggestion: string) => void` | `undefined` | Suggestion click handler |
| `addonSlot` | `ReactNode` | `undefined` | Custom action buttons in the bottom-left row |
| `className` | `string` | `undefined` | Additional CSS classes |

### `<ChatInput>` (legacy)

Single-row auto-resizing textarea with send/stop button.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `placeholder` | `string` | From config | Override placeholder text |
| `disabled` | `boolean` | `false` | Disable the input |
| `maxRows` | `number` | `6` | Max rows before scrolling |
| `addonSlot` | `ReactNode` | `undefined` | Addon buttons (left of send) |
| `className` | `string` | `undefined` | Additional CSS classes |

### `<ChainOfThought>` (v0.2.0)

Collapsible accordion with timeline steps.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `actions` | `ChatAction[]` | *required* | Array of actions/steps to display |
| `isActive` | `boolean` | `false` | Whether actions are still running (auto-expands) |
| `thinkingLabel` | `string` | `'Thinking'` | Label shown with shimmer during active state |
| `className` | `string` | `undefined` | Additional CSS classes |

### `<TextShimmer>` (v0.2.0)

Gradient sweep animation on text via `background-clip: text`.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | *required* | Text content to animate |
| `as` | `'span' \| 'p' \| 'div' \| ...` | `'span'` | HTML element to render |
| `duration` | `number` | `2` | Animation duration in seconds |
| `spread` | `number` | `20` | Gradient highlight width (5-45) |
| `className` | `string` | `undefined` | Additional CSS classes |

### `<MessageActionBar>` (v0.2.0)

Hover-reveal action buttons (copy, retry, edit) on messages.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `content` | `string` | `undefined` | Message content (for copy to clipboard) |
| `actions` | `MessageActionItem[]` | `undefined` | Additional custom action buttons |
| `onCopy` | `() => void` | `undefined` | Called after copy |
| `onRetry` | `() => void` | `undefined` | Retry handler (omit to hide button) |
| `onEdit` | `() => void` | `undefined` | Edit handler (omit to hide button) |
| `className` | `string` | `undefined` | Additional CSS classes |

### `<ChatWidget>`

Floating chat widget with FAB button trigger.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `position` | `'bottom-right' \| 'bottom-left'` | `'bottom-right'` | FAB position |
| `defaultOpen` | `boolean` | `false` | Open by default |
| `width` | `string` | `'420px'` | Panel width on desktop |
| `height` | `string` | `'600px'` | Panel height on desktop |
| `fabIcon` | `ReactNode` | Chat icon | Custom FAB icon |
| `fabLabel` | `string` | `'Open chat'` | FAB aria-label/tooltip |
| `emptyState` | `ReactNode` | `<EmptyState />` | Custom empty state |
| `inputAddonSlot` | `ReactNode` | `undefined` | Addon buttons in the input |
| `headerSlot` | `ReactNode` | `'Chat'` | Custom header content |
| `className` | `string` | `undefined` | Additional CSS classes |

### `<ActionIndicator>` (legacy)

Collapsible status cards for tool calls. Prefer `<ChainOfThought>` in v0.2.0.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `actions` | `ChatAction[]` | *required* | Array of actions to display |
| `isActive` | `boolean` | `false` | Whether actions are still running |
| `className` | `string` | `undefined` | Additional CSS classes |

### `<ThinkingIndicator>`

TextShimmer-based thinking label (v0.2.0 redesign).

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | `'Thinking'` | Label text with shimmer animation |
| `className` | `string` | `undefined` | Additional CSS classes |

### `<CodeBlock>`

Syntax-highlighted code with copy button.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `code` | `string` | *required* | The code string |
| `language` | `string` | `undefined` | Programming language |
| `showLineNumbers` | `boolean` | `false` | Show line numbers |
| `showCopy` | `boolean` | `true` | Show copy button |
| `maxHeight` | `string` | `'400px'` | Max height before scrolling |
| `className` | `string` | `undefined` | Additional CSS classes |

### `<EmptyState>`

Welcome screen for empty chat.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `icon` | `ReactNode` | Chat icon | Custom icon |
| `title` | `string` | `'How can I help you?'` | Heading text |
| `description` | `string` | `'Ask me anything...'` | Description text |
| `suggestions` | `string[]` | `undefined` | Clickable prompt suggestions |
| `onSuggestionClick` | `(suggestion: string) => void` | `undefined` | Suggestion click handler |
| `className` | `string` | `undefined` | Additional CSS classes |

### `<SessionList>`

Session sidebar panel.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSelectSession` | `(sessionId: string) => void` | `undefined` | Session selection handler |
| `onNewConversation` | `() => void` | `undefined` | New conversation handler |
| `className` | `string` | `undefined` | Additional CSS classes |

### `<SessionSelector>`

Compact dropdown for mobile session switching.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `undefined` | Additional CSS classes |

### `<StreamingText>`

Token-by-token text reveal animation.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string` | *required* | The full text to animate |
| `charsPerFrame` | `number` | `2` | Characters per animation frame |
| `animate` | `boolean` | `true` | Whether animation is active |
| `onComplete` | `() => void` | `undefined` | Animation complete callback |
| `className` | `string` | `undefined` | Additional CSS classes |

---

## Hook API Reference

### `useChat()`

Primary consumer hook. Must be used within `<ChatProvider>`.

```tsx
const {
  // State
  messages,        // ChatMessage[]
  isStreaming,      // boolean
  activeSessionId,  // string | null
  sessions,        // ChatSession[]
  connectionStatus, // 'idle' | 'connecting' | 'streaming' | 'error'
  error,           // string | null
  inputValue,      // string

  // Actions
  send,            // (message: string, metadata?) => void
  stop,            // () => void
  retry,           // (messageId: string) => void
  setInput,        // (value: string) => void
  clearMessages,    // () => void
  loadSession,      // (sessionId: string) => Promise<void>
  deleteSession,    // (sessionId: string) => Promise<void>
  newConversation,  // () => void
} = useChat()
```

### `useSSEStream(config)`

Converts a POST-based SSE endpoint into the `ChatSendFn` async generator format.

```tsx
const sendFn = useSSEStream({
  url: '/api/chat',
  method: 'POST',                    // Default: 'POST'
  headers: { Authorization: '...' },
  buildBody: (message, sessionId) => ({ message, session_id: sessionId }),
  parseEvent: (eventType, data) => { /* return ChatEvent or null */ },
})
```

### `useSessionManager(adapter?)`

Session CRUD with loading states.

```tsx
const {
  sessions,      // ChatSession[]
  isLoading,      // boolean
  error,          // string | null
  refresh,        // () => Promise<void>
  deleteSession,  // (id: string) => Promise<void>
  renameSession,  // (id: string, title: string) => Promise<void>
} = useSessionManager(adapter)
```

### `useChatScroll(deps)`

Smart auto-scroll with user override detection.

```tsx
const {
  scrollRef,      // RefObject<HTMLDivElement>
  bottomRef,      // RefObject<HTMLDivElement>
  isAtBottom,      // boolean
  unreadCount,    // number
  scrollToBottom,  // (behavior?: ScrollBehavior) => void
} = useChatScroll([messages.length])
```

### `useStreamingText(text, options?)`

Character-by-character text animation.

```tsx
const {
  displayedText,  // string (the currently visible portion)
  isAnimating,    // boolean
} = useStreamingText(fullText, {
  charsPerFrame: 2,  // Default: 2
  enabled: true,      // Default: true
})
```

---

## Theming

The library uses CSS custom properties with the `--cxc-` prefix. Override them at any scope:

### Global Override

```css
:root {
  --cxc-accent: #E11D48;
  --cxc-accent-hover: #BE123C;
  --cxc-font-sans: 'Inter', sans-serif;
}
```

### Scoped Override

```css
.my-chat-wrapper {
  --cxc-bg: #0F172A;
  --cxc-text: #F8FAFC;
}
```

### Dark Mode

Dark mode activates automatically with the `.dark` class or `[data-theme="dark"]` attribute on any ancestor element.

### Available Tokens

| Token | Description |
|-------|-------------|
| `--cxc-bg` | Background color |
| `--cxc-bg-subtle` | Subtle background (sidebar, code headers) |
| `--cxc-bg-muted` | Muted background (hover states, inline code) |
| `--cxc-border` | Primary border color |
| `--cxc-border-subtle` | Subtle border color |
| `--cxc-border-focus` | Focus ring color |
| `--cxc-text` | Primary text color |
| `--cxc-text-secondary` | Secondary text color |
| `--cxc-text-muted` | Muted text color |
| `--cxc-accent` | Accent/primary color |
| `--cxc-accent-hover` | Accent hover state |
| `--cxc-accent-light` | Light accent background |
| `--cxc-success` | Success color |
| `--cxc-error` | Error color |
| `--cxc-warning` | Warning color |
| `--cxc-user-bg` | User message bubble background |
| `--cxc-assistant-bg` | Assistant message background |
| `--cxc-code-bg` | Code block background |
| `--cxc-input-bg` | Input field background |
| `--cxc-sidebar-bg` | Sidebar background |
| `--cxc-sidebar-width` | Sidebar width (default: 280px) |
| `--cxc-font-sans` | Sans-serif font family |
| `--cxc-font-mono` | Monospace font family |
| `--cxc-radius-sm/md/lg/xl` | Border radius scale |
| `--cxc-shadow-sm/md/lg` | Shadow scale |

---

## TypeScript Types

All types are exported and available for consumption:

```tsx
import type {
  ChatMessageData,      // Message data shape (aliased to avoid component collision)
  ChatAction,           // Tool call / action status
  ChatSession,          // Session metadata
  ChatEvent,            // Streaming event discriminated union
  ChatSendFn,           // AsyncGenerator send function type
  SessionAdapter,       // Session CRUD adapter interface
  SSEStreamConfig,      // SSE hook configuration
  ChatConfig,           // Provider configuration
  FeedbackHandler,      // Consumer-supplied like/dislike endpoints
  VoiceHandler,         // Consumer-supplied TTS + STT endpoints
  VoiceTranscription,   // { text, language, language_code, mode }
  VoiceStatus,          // GET /v1/enterprise/voice payload -> ChatConfig.voiceStatus
  LanguageOption,       // One selectable dictation locale
  DictationState,       // { language, autodetectAvailable, explicit }
  ChatContainerProps,
  ChatMessageProps,
  ChatInputProps,
  ActionIndicatorProps,
  SessionListProps,
  // ... and more
} from '@cypherx/chat-ui'
```

### Streaming Event Protocol

The `ChatEvent` discriminated union defines the streaming protocol:

```typescript
type ChatEvent =
  | { type: 'token'; text: string }           // Append text to response
  | { type: 'thinking'; active: boolean }      // Toggle thinking indicator
  | { type: 'reasoning'; text: string }        // Append reasoning text
  | { type: 'action'; action: ChatAction }     // Add a tool call/action
  | { type: 'action_update'; actionId: string; status: ... }  // Update action status
  | { type: 'done'; sessionId?: string }       // Stream complete
  | { type: 'error'; message: string }         // Error occurred
```

---

## Adapter Pattern

The library is backend-agnostic. Consumers provide a `ChatSendFn` -- an AsyncGenerator that yields `ChatEvent` objects:

### Mock / Testing

```typescript
const mockSend: ChatSendFn = async function* (message) {
  yield { type: 'thinking', active: true }
  await delay(500)
  yield { type: 'token', text: 'Here is the answer.' }
  yield { type: 'done' }
}
```

### SSE (via useSSEStream)

```typescript
const send = useSSEStream({ url: '/api/chat' })
```

### WebSocket

```typescript
const wsSend: ChatSendFn = async function* (message) {
  const ws = new WebSocket('wss://api.example.com/chat')
  // ... yield events from ws.onmessage
}
```

### Local LLM (Ollama)

```typescript
const ollamaSend: ChatSendFn = async function* (message) {
  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    body: JSON.stringify({ model: 'llama3', prompt: message, stream: true }),
  })
  // ... parse NDJSON response
}
```

---

## Contributing

1. Clone the repository
2. Install dependencies: `npm install`
3. Start development: `npm run dev`
4. Type check: `npm run lint`
5. Build: `npm run build`

---

## License

MIT
