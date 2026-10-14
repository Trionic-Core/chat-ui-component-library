// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatProvider } from './chat-provider'
import { ChatContainer } from './chat-container'
import { useChatContext } from '../context/chat-context'
import { createSSEClient } from '../utils/sse'

/* ------------------------------------------------------------------
 * The knowledge chat, end to end, with the library's DEFAULT setup: the
 * real wire frames of POST /v1/enterprise/knowledge/chat go through the
 * shared SSE client and the default parseEvent into ChatContainer.
 *
 * The backend sends `action {"status": "Searched documents"}`, then waits
 * (a checked multi-document answer can take many seconds), then sends the
 * answer. During that wait the user must see the status text and exactly one
 * working signal (the step list's shimmering "Thinking..." header).
 * ----------------------------------------------------------------*/

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let container: HTMLDivElement
let root: Root
let push: (frame: string) => void
let close: () => void

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver)
  vi.stubGlobal('IntersectionObserver', NoopResizeObserver)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.scrollTo = function () {}
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      push = frame => controller.enqueue(encoder.encode(frame))
      close = () => controller.close()
    },
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } }),
  ))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function AskOnMount({ question }: { question: string }) {
  const { send } = useChatContext()
  useEffect(() => { send(question) }, [send, question])
  return null
}

async function flush() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
}

const thinkingCount = () => (container.textContent?.match(/Thinking\.\.\./g) ?? []).length

describe('knowledge chat wait, default library setup', () => {
  it('shows the status and one working signal until the answer starts', async () => {
    const client = createSSEClient(() => ({ url: '/v1/enterprise/knowledge/chat' }))
    await act(async () => {
      root.render(createElement(ChatProvider, {
        onSend: client.send,
        autoFocus: false,
        children: [
          createElement(ChatContainer, { key: 'c' }),
          createElement(AskOnMount, { key: 'a', question: 'A question about my bill or plan' }),
        ],
      }))
    })

    // The exact first frame the backend sends.
    push('event: action\ndata: {"status": "Searched documents"}\n\n')
    await flush()
    expect(container.textContent).toContain('Searched documents')
    expect(thinkingCount()).toBe(1)

    // The answer arrives whole, then done.
    push('event: token\ndata: {"text": "Hi! How can I help with your bill or plan?"}\n\n')
    push('event: done\ndata: {"session_id": "ks_test"}\n\n')
    close()
    await flush()
    expect(container.textContent).toContain('Hi! How can I help with your bill or plan?')
    expect(thinkingCount()).toBe(0)
  })
})
