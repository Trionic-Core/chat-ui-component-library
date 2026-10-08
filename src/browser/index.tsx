import { useLayoutEffect, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { ChatProvider } from '../components/chat-provider'
import { ChatContainer } from '../components/chat-container'
import { ChatWidget } from '../components/chat-widget'
import { useChatContext } from '../context/chat-context'
import { createSSEClient } from '../utils/sse'
import type { ChatContextValue, ChatSendFn } from '../types'
import type { BrowserChatInstance, BrowserChatOptions, BrowserPresentation, BrowserTheme } from './types'
import stylesheet from '../../dist/browser/widget.css'

export type * from './types'
export { renderMarkdown } from '../utils/markdown'
export const version = __CXC_BROWSER_VERSION__

const mounted = Symbol.for('cypherx.chat.mounted')
type Target = HTMLElement & { [mounted]?: boolean }

function validatePresentation(options: BrowserPresentation) {
  for (const key of ['title', 'placeholder'] as const) {
    if (options[key] !== undefined && typeof options[key] !== 'string') throw new Error(`Invalid chat ${key}`)
  }
  if (options.theme && !['light', 'dark', 'auto'].includes(options.theme)) throw new Error('Invalid chat theme')
  for (const key of ['width', 'height'] as const) {
    const value = options[key]
    if (value !== undefined && (typeof value !== 'string' || !CSS.supports(key, value))) throw new Error(`Invalid chat ${key}`)
  }
}

/** Mount the same React components without requiring a consumer React installation. */
export function mount(target: string | HTMLElement, options: BrowserChatOptions): BrowserChatInstance {
  const container = (typeof target === 'string' ? document.querySelector(target) : target) as Target | null
  if (!(container instanceof HTMLElement) || container.ownerDocument !== document || !container.isConnected) throw new Error('Chat mount target must be a connected element in this document')
  if (container[mounted]) throw new Error('A chat instance is already mounted here; destroy it first')
  if (!options || Boolean(options.endpoint) === Boolean(options.onSend)) throw new Error('Provide exactly one of endpoint or onSend')
  if (options.endpoint !== undefined && typeof options.endpoint !== 'string') throw new Error('endpoint must be a URL string')
  if (options.onSend !== undefined && typeof options.onSend !== 'function') throw new Error('onSend must be a function')
  if (options.endpoint && !['http:', 'https:'].includes(new URL(options.endpoint, document.baseURI).protocol)) throw new Error('Chat endpoint must use HTTP or HTTPS')
  if (options.mode && !['inline', 'widget'].includes(options.mode)) throw new Error('Invalid chat mode')
  if (options.maxInputLength !== undefined && (!Number.isInteger(options.maxInputLength) || options.maxInputLength < 1)) throw new Error('maxInputLength must be a positive integer')
  validatePresentation(options)
  for (const key of Object.keys(options.themeTokens ?? {})) {
    if (!/^--cxc-[a-z0-9-]+$/.test(key)) throw new Error(`Invalid theme token: ${key}`)
  }

  let presentation: BrowserPresentation = { theme: 'light', title: 'Chat', height: '600px', width: '420px', ...options }
  let visible = options.defaultOpen ?? false
  let destroyed = false
  let context: ChatContextValue | null = null
  let customController: AbortController | undefined
  const element = document.createElement('div')
  element.dataset.cypherxChat = version
  const shadow = element.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  if (options.nonce) style.nonce = options.nonce
  style.textContent = stylesheet
  const frame = document.createElement('div')
  frame.className = 'cxc-browser-root'
  frame.dataset.mode = options.mode ?? 'inline'
  for (const [name, value] of Object.entries(options.themeTokens ?? {})) frame.style.setProperty(name, value)
  shadow.append(style, frame)
  const reactHost = document.createElement('div')
  reactHost.className = 'cxc-browser-app'
  frame.append(reactHost)
  container.append(element)
  container[mounted] = true
  const root = createRoot(reactHost)
  const media = window.matchMedia('(prefers-color-scheme: dark)')

  function applyTheme() {
    const theme = presentation.theme as BrowserTheme
    frame.classList.toggle('dark', theme === 'dark' || (theme === 'auto' && media.matches))
    frame.style.height = options.mode === 'widget' ? '0px' : presentation.height!
  }
  media.addEventListener('change', applyTheme)

  function notify(name: 'event' | 'state', detail: unknown) {
    if (destroyed) return
    element.dispatchEvent(new CustomEvent(`cypherx:${name}`, { detail: structuredClone(detail), bubbles: true, composed: true }))
    try {
      if (name === 'event') options.onEvent?.(structuredClone(detail) as Parameters<NonNullable<BrowserChatOptions['onEvent']>>[0])
      else options.onStateChange?.(structuredClone(detail) as Parameters<NonNullable<BrowserChatOptions['onStateChange']>>[0])
    } catch (error) {
      console.error('CypherX chat callback failed', error)
    }
  }

  const client = createSSEClient(() => ({
    url: options.endpoint!, headers: options.headers, credentials: options.credentials,
    buildBody: options.buildBody, parseEvent: options.parseEvent,
  }))
  const send: ChatSendFn = (message, sessionId, metadata) => {
    const controller = new AbortController()
    customController = controller
    const source = options.onSend
      ? (async function* () { yield* options.onSend!(message, sessionId, metadata, controller.signal) })()
      : client.send(message, sessionId, metadata)
    const iterator = (async function* () {
      try {
        for await (const event of source) {
          if (destroyed || controller.signal.aborted) break
          notify('event', event)
          yield event
        }
      } finally {
        controller.abort()
        void source.return(undefined).catch(() => {})
        if (customController === controller) customController = undefined
      }
    })()
    const originalReturn = iterator.return.bind(iterator)
    iterator.return = value => {
      controller.abort()
      // Abort the endpoint iterator immediately, even while the wrapper awaits next().
      void source.return(undefined).catch(() => {})
      return originalReturn(value)
    }
    return iterator
  }

  function Bridge() {
    const value = useChatContext()
    useLayoutEffect(() => { context = value })
    useEffect(() => { notify('state', value.state) }, [value.state])
    return null
  }

  function render() {
    applyTheme()
    root.render(
      <ChatProvider onSend={send} autoFocus={options.autoFocus ?? false}
        placeholder={presentation.placeholder} maxInputLength={options.maxInputLength}
        initialMessages={options.initialMessages} initialSessionId={options.initialSessionId}
        sessionAdapter={options.sessionAdapter} feedback={options.feedback} voice={options.voice}
        voiceStatus={options.voiceStatus} enableRegenerate={options.enableRegenerate}>
        <Bridge />
        {options.mode === 'widget'
          ? <ChatWidget open={visible} onOpenChange={value => { visible = value; render() }}
              position={options.position} width={presentation.width} height={presentation.height}
              headerSlot={<span>{presentation.title}</span>} />
          : <ChatContainer showSessions={options.showSessions} allowAttachments={false}
              headerSlot={<span>{presentation.title}</span>} />}
      </ChatProvider>,
    )
  }

  function active() {
    if (destroyed || !context) throw new Error('Chat instance has been destroyed')
    return context
  }
  function destroy() {
    if (destroyed) return
    destroyed = true
    client.abort()
    customController?.abort()
    media.removeEventListener('change', applyTheme)
    root.unmount()
    element.remove()
    delete container![mounted]
    context = null
  }
  try { flushSync(render) } catch (error) { destroy(); throw error }

  return {
    element,
    send(message, metadata) {
      const ctx = active()
      if (typeof message !== 'string' || !message.trim()) throw new Error('Message must be a non-empty string')
      if (message.trim().length > (options.maxInputLength ?? 10000)) throw new Error('Message exceeds maxInputLength')
      if (ctx.state.isStreaming) throw new Error('Stop or wait for the current response before sending')
      flushSync(() => ctx.send(message, metadata === undefined ? undefined : structuredClone(metadata)))
    },
    stop() { flushSync(() => active().stop()) },
    clear() { flushSync(() => active().clearMessages()) },
    setInput(value) { flushSync(() => active().setInput(value)) },
    getState() { return structuredClone(active().state) },
    update(next) {
      active()
      validatePresentation(next)
      presentation = { ...presentation, ...next }
      flushSync(render)
    },
    open() { active(); visible = true; flushSync(render) },
    close() { active(); visible = false; flushSync(render) },
    destroy,
  }
}
