import type {
  ChatConfig, ChatEvent, ChatMessage, ChatState, SSEStreamConfig,
} from '../types'

export type BrowserTheme = 'light' | 'dark' | 'auto'
export interface BrowserPresentation {
  theme?: BrowserTheme
  title?: string
  placeholder?: string
  /** Inline frame height, or floating panel height. Defaults to 600px. */
  height?: string
  /** Floating panel width. Defaults to 420px. */
  width?: string
}

export interface BrowserChatOptions extends BrowserPresentation {
  /** POST SSE endpoint, preferably an authenticated same-origin Java proxy. */
  endpoint?: string
  /** Alternative to endpoint. It must honor signal for pending asynchronous work. */
  onSend?: (message: string, sessionId: string | null, metadata: Record<string, unknown> | undefined, signal: AbortSignal) => AsyncGenerator<ChatEvent, void, undefined>
  headers?: SSEStreamConfig['headers']
  credentials?: RequestCredentials
  buildBody?: SSEStreamConfig['buildBody']
  parseEvent?: SSEStreamConfig['parseEvent']
  mode?: 'inline' | 'widget'
  position?: 'bottom-right' | 'bottom-left'
  defaultOpen?: boolean
  autoFocus?: boolean
  maxInputLength?: number
  initialSessionId?: string | null
  initialMessages?: ChatMessage[]
  sessionAdapter?: ChatConfig['sessionAdapter']
  showSessions?: boolean
  feedback?: ChatConfig['feedback']
  voice?: ChatConfig['voice']
  voiceStatus?: ChatConfig['voiceStatus']
  enableRegenerate?: boolean
  /** CSP nonce for the SDK's isolated stylesheet. */
  nonce?: string
  /** Selected --cxc-* design token overrides, applied inside the shadow root. */
  themeTokens?: Record<string, string>
  onEvent?: (event: ChatEvent) => void
  onStateChange?: (state: ChatState) => void
}

export interface BrowserChatInstance {
  /** The SDK-owned element, appended without replacing existing target children. */
  readonly element: HTMLElement
  send(message: string, metadata?: Record<string, unknown>): void
  stop(): void
  clear(): void
  setInput(value: string): void
  getState(): ChatState
  update(options: BrowserPresentation): void
  open(): void
  close(): void
  /** Idempotent; stops streaming, unmounts React and removes the SDK-owned element. */
  destroy(): void
}

export type { ChatEvent, ChatMessage, ChatState }
