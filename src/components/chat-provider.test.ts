// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatProvider } from './chat-provider'
import { useChatContext } from '../context/chat-context'
import type { ChatConfig, ChatContextValue, ChatEvent, ChatSession } from '../types'

let root: Root
let host: HTMLDivElement
let context: ChatContextValue
function Probe() { context = useChatContext(); return null }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
async function mount(config: Partial<ChatConfig> = {}) {
  await act(async () => root.render(createElement(ChatProvider, {
    onSend: async function* () { yield { type: 'done' } }, ...config, children: createElement(Probe),
  })))
}
beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

describe('chat provider lifecycle', () => {
  it('stops immediately and ignores late events/finalization from a cancelled response', async () => {
    const first = deferred<void>(), second = deferred<void>()
    await mount({ onSend: async function* (message) {
      yield { type: 'token', text: message }
      await (message === 'first' ? first : second).promise
      yield { type: 'token', text: ' late' }
      yield { type: 'done' }
    } })
    await act(async () => context.send('first'))
    await act(async () => context.stop())
    expect(context.state.messages[1].isStreaming).toBe(false)
    await act(async () => context.send('second'))
    await act(async () => first.resolve())
    expect(context.state.isStreaming).toBe(true)
    expect(context.state.messages[1].content).toBe('first')
    await act(async () => second.resolve())
    expect(context.state.isStreaming).toBe(false)
    expect(context.state.messages[3].content).toBe('second late')
  })
  it('returns the active iterator on unmount', async () => {
    const gate = deferred<void>()
    const iterator = (async function* (): AsyncGenerator<ChatEvent, void, undefined> { yield { type: 'token', text: 'partial' }; await gate.promise })()
    const close = vi.spyOn(iterator, 'return')
    await mount({ onSend: () => iterator })
    await act(async () => context.send('hello'))
    await act(async () => root.render(null))
    expect(close).toHaveBeenCalled()
    await act(async () => gate.resolve())
  })
  it('accepts only the latest session load and invalidates pending loads on clear', async () => {
    const a = deferred<{ session: ChatSession; messages: [] }>(), b = deferred<{ session: ChatSession; messages: [] }>()
    const session = (id: string): ChatSession => ({ id, title: id, messageCount: 0, createdAt: new Date(), updatedAt: new Date() })
    await mount({ sessionAdapter: { list: async () => [], get: id => (id === 'a' ? a : b).promise } })
    let loadA!: Promise<void>, loadB!: Promise<void>
    act(() => { loadA = context.loadSession('a'); loadB = context.loadSession('b') })
    await act(async () => { b.resolve({ session: session('b'), messages: [] }); await loadB })
    expect(context.state.activeSessionId).toBe('b')
    await act(async () => { context.clearMessages(); a.resolve({ session: session('a'), messages: [] }); await loadA })
    expect(context.state.activeSessionId).toBeNull()
  })
  it('enforces message limits at the shared provider boundary', async () => {
    const send = vi.fn(async function* (): AsyncGenerator<ChatEvent, void, undefined> { yield { type: 'done' } })
    await mount({ onSend: send, maxInputLength: 5 })
    await act(async () => { context.send(''); context.send('too long') })
    expect(send).not.toHaveBeenCalled()
    expect(context.state.messages).toEqual([])
    await act(async () => context.send('hello'))
    expect(send).toHaveBeenCalledOnce()
  })
})
