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

function Probe({ count = 0, tokens = 0 }: { count?: number; tokens?: number }) {
  seen = useChatScroll([count, tokens], count)
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
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(createElement(Probe)))
  Object.defineProperties(seen.scrollRef.current!, {
    scrollTo: { value: scrollTo },
    scrollHeight: { value: 900 },
    clientHeight: { value: 100 },
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
    expect(scrollTo).toHaveBeenCalledWith({ top: 900, behavior: 'instant' })
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('preserves the explicit scroll behavior requested by the consumer', () => {
    act(() => seen.scrollToBottom('instant'))
    expect(scrollTo).toHaveBeenCalledWith({ top: 900, behavior: 'instant' })
  })

  it('leaves a reader who scrolled up in place when another message arrives', () => {
    act(() => {
      seen.scrollRef.current!.scrollTop = 500
      seen.scrollRef.current!.dispatchEvent(new Event('scroll'))
      seen.scrollRef.current!.scrollTop = 400
      seen.scrollRef.current!.dispatchEvent(new Event('scroll'))
    })
    act(() => observer([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver))
    act(() => root.render(createElement(Probe, { count: 1 })))
    expect(scrollTo).not.toHaveBeenCalled()
    expect(seen.unreadCount).toBe(1)
    act(() => root.render(createElement(Probe, { count: 1, tokens: 10 })))
    expect(seen.unreadCount).toBe(1)
    act(() => seen.scrollToBottom())
    expect(seen.unreadCount).toBe(0)
    expect(seen.isAtBottom).toBe(true)
  })

  it('does not treat content growth as a reader scrolling away', () => {
    act(() => observer([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver))
    act(() => root.render(createElement(Probe, { count: 1, tokens: 100 })))
    act(() => frame(0))
    expect(scrollTo).toHaveBeenCalledWith({ top: 900, behavior: 'instant' })
    expect(seen.unreadCount).toBe(0)
  })

  it('recognizes upward scrolling before an automatic scroll event is delivered', () => {
    scrollTo.mockImplementationOnce(() => { seen.scrollRef.current!.scrollTop = 800 })
    act(() => seen.scrollToBottom('instant'))
    scrollTo.mockClear()
    act(() => {
      seen.scrollRef.current!.scrollTop = 0
      seen.scrollRef.current!.dispatchEvent(new Event('scroll'))
    })
    act(() => root.render(createElement(Probe, { count: 1 })))
    act(() => frame(0))
    expect(scrollTo).not.toHaveBeenCalled()
    expect(seen.unreadCount).toBe(1)
  })

  it('counts new messages arriving before the reader scroll event is delivered', () => {
    scrollTo.mockImplementationOnce(() => { seen.scrollRef.current!.scrollTop = 800 })
    act(() => seen.scrollToBottom('instant'))
    scrollTo.mockClear()
    seen.scrollRef.current!.scrollTop = 0
    act(() => root.render(createElement(Probe, { count: 1 })))
    act(() => frame(0))
    expect(scrollTo).not.toHaveBeenCalled()
    expect(seen.unreadCount).toBe(1)
    act(() => observer([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(seen.unreadCount).toBe(1)
    expect(seen.isAtBottom).toBe(false)
  })

  it('resumes following when a conversation is cleared while reading older messages', () => {
    act(() => root.render(createElement(Probe, { count: 2 })))
    act(() => {
      seen.scrollRef.current!.scrollTop = 500
      seen.scrollRef.current!.dispatchEvent(new Event('scroll'))
      seen.scrollRef.current!.scrollTop = 100
      seen.scrollRef.current!.dispatchEvent(new Event('scroll'))
    })
    act(() => root.render(createElement(Probe, { count: 3 })))
    expect(seen.unreadCount).toBe(1)
    act(() => root.render(createElement(Probe, { count: 0 })))
    act(() => frame(0))
    expect(seen.unreadCount).toBe(0)
    expect(scrollTo).toHaveBeenCalledWith({ top: 900, behavior: 'instant' })
  })

  it('cancels a pending frame when the component unmounts', () => {
    act(() => root.render(null))
    expect(cancelFrame).toHaveBeenCalledWith(1)
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
