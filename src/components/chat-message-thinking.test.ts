// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatProvider } from './chat-provider'
import { ChatMessage } from './chat-message'
import type { ChatAction, ChatMessage as ChatMessageData } from '../types'

/* ------------------------------------------------------------------
 * The typing dots stay until the first text arrives. A status line such
 * as "Searched documents" is not an answer: a knowledge answer is checked
 * whole and arrives as one token after a long wait, so the dots must keep
 * showing under the status.
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

describe('the typing dots on an assistant message', () => {
  it('show under a status line while no text has arrived', async () => {
    await mount(assistant('', [SEARCHED]), true)
    expect(container.textContent).toContain('Searched documents')
    expect(dots()).not.toBeNull()
  })

  it('show while streaming with no text and no status', async () => {
    await mount(assistant(''), true)
    expect(dots()).not.toBeNull()
  })

  it('hide once the first text arrives', async () => {
    await mount(assistant('Hi', [SEARCHED]), true)
    expect(dots()).toBeNull()
  })

  it('hide when the message is not streaming', async () => {
    await mount(assistant('', [SEARCHED]), false)
    expect(dots()).toBeNull()
  })
})
