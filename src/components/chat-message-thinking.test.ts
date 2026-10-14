// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatProvider } from './chat-provider'
import { ChatMessage } from './chat-message'
import type { ChatAction, ChatMessage as ChatMessageData } from '../types'

/* ------------------------------------------------------------------
 * An assistant message shows exactly one working signal until the first
 * text arrives. With a step list ("Searched documents") the list's own
 * shimmering "Thinking..." header is that signal; without steps, the
 * separate thinking indicator is.
 * ----------------------------------------------------------------*/

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SEARCHED: ChatAction = {
  id: 'a1', type: 'status', label: 'Searched documents', status: 'running', timestamp: new Date(),
}

function assistant(content: string, actions?: ChatAction[]): ChatMessageData {
  return { id: 'm1', role: 'assistant', content, timestamp: new Date(), actions }
}

let container: HTMLDivElement
let root: Root

// jsdom has no ResizeObserver; the message's layout hooks only need it to exist.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function mount(message: ChatMessageData, isStreaming: boolean) {
  const noSend = async function* () {}
  await act(async () => {
    root.render(
      createElement(ChatProvider, {
        onSend: noSend,
        autoFocus: false,
        children: createElement(ChatMessage, { message, isStreaming }),
      }),
    )
  })
}

const dots = () => container.querySelector('[aria-label="AI is thinking"]')
const thinkingCount = () => (container.textContent?.match(/Thinking\.\.\./g) ?? []).length

describe('the working signal on an assistant message', () => {
  it('is the step list alone while a step runs and no text has arrived', async () => {
    await mount(assistant('', [SEARCHED]), true)
    expect(container.textContent).toContain('Searched documents')
    expect(thinkingCount()).toBe(1)
    expect(dots()).toBeNull()
  })

  it('is the thinking indicator while streaming with no text and no steps', async () => {
    await mount(assistant(''), true)
    expect(dots()).not.toBeNull()
  })

  it('ends once the first text arrives', async () => {
    await mount(assistant('Hi', [SEARCHED]), true)
    expect(dots()).toBeNull()
    expect(container.textContent).toContain('Hi')
  })

  it('ends when the message is not streaming', async () => {
    await mount(assistant('', [SEARCHED]), false)
    expect(dots()).toBeNull()
    expect(thinkingCount()).toBe(0)
  })
})
