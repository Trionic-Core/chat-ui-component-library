// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatScroll } from './use-chat-scroll'

let root: Root
let host: HTMLDivElement
let seen: ReturnType<typeof useChatScroll>
let frame: FrameRequestCallback
let observer: IntersectionObserverCallback
const scrollTo = vi.fn()
const scrollIntoView = vi.fn()
const cancelFrame = vi.fn()

function Probe({ count = 0 }: { count?: number }) {
  seen = useChatScroll([count])
  return createElement('div', { ref: seen.scrollRef }, createElement('div', { ref: seen.bottomRef }))
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1 }))
  vi.stubGlobal('cancelAnimationFrame', cancelFrame)
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { observer = callback }
    observe() {}
    disconnect() {}
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(createElement(Probe)))
  Object.defineProperties(seen.scrollRef.current!, {
    scrollTo: { value: scrollTo },
    scrollHeight: { value: 900 },
  })
  Object.defineProperty(seen.bottomRef.current!, 'scrollIntoView', { value: scrollIntoView })
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('embedded chat scrolling', () => {
  it('scrolls only the message container, never embedding-page ancestors', () => {
    act(() => frame(0))
    expect(scrollTo).toHaveBeenCalledWith({ top: 900, behavior: 'smooth' })
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('preserves the explicit scroll behavior requested by the consumer', () => {
    act(() => seen.scrollToBottom('instant'))
    expect(scrollTo).toHaveBeenCalledWith({ top: 900, behavior: 'instant' })
  })

  it('leaves a reader who scrolled up in place when another message arrives', () => {
    act(() => observer([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver))
    act(() => root.render(createElement(Probe, { count: 1 })))
    expect(scrollTo).not.toHaveBeenCalled()
    expect(seen.unreadCount).toBe(1)
    act(() => seen.scrollToBottom())
    expect(seen.unreadCount).toBe(0)
    expect(seen.isAtBottom).toBe(true)
  })

  it('cancels a pending frame when the component unmounts', () => {
    act(() => root.render(null))
    expect(cancelFrame).toHaveBeenCalledWith(1)
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
